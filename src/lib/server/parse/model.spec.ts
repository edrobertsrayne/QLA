// Tests for parse's model transport (issue #122).
//
// `estimateCost` moved with the shared HTTP transport to
// `openrouter.spec.ts`. The live parse transport is driven through the shared
// fetch seam (`setStructuredFetch`): the payload it sends (parse's own prompt,
// max_tokens 4000, native file parts and the native file parser) and the
// failure it maps are pinned here.

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import {
	OPENROUTER_URL,
	StructuredModelError,
	estimateCost,
	resetStructuredFetch,
	setStructuredFetch
} from '../openrouter';
import { clearEnvForTests, setEnvForTests } from './env';
import { OPENROUTER_MAX_TOKENS } from './pdf';
import { callModel, resetModelTransport, type ModelInput } from './model';

const MODEL_ID = 'openai/gpt-6-luna';

function parseInput(overrides: Partial<ModelInput> = {}): ModelInput {
	return {
		modelId: MODEL_ID,
		useNativePdf: true,
		paper: {
			filename: 'paper.pdf',
			pageCount: 2,
			text: '[p.1]\nTransverse waves\n\n[p.2]\nInfrared investigation',
			pdfBase64: 'AAAA'
		},
		markscheme: {
			filename: 'markscheme.pdf',
			pageCount: 1,
			text: '[p.1]\nMarking table',
			pdfBase64: 'BBBB'
		},
		...overrides
	};
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
	return new Response(JSON.stringify(body), {
		...init,
		headers: { 'Content-Type': 'application/json', ...init?.headers }
	});
}

function chatBody(content: unknown, finishReason = 'stop'): Record<string, unknown> {
	return {
		choices: [{ message: { content }, finish_reason: finishReason }],
		usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
	};
}

describe('live parse transport', () => {
	const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
	let nextResponse: () => Response = () => {
		throw new Error('no mocked response set');
	};
	let infoSpy: MockInstance | undefined;

	beforeEach(() => {
		infoSpy ??= vi.spyOn(console, 'info').mockImplementation(() => {});
		infoSpy.mockClear();
		fetchCalls.length = 0;
		nextResponse = () => {
			throw new Error('no mocked response set');
		};
		setEnvForTests('OPENROUTER_API_KEY', 'test-key');
		resetModelTransport();
		setStructuredFetch(async (url, init) => {
			fetchCalls.push({ url, init });
			return nextResponse();
		});
	});

	afterEach(() => {
		clearEnvForTests();
		resetModelTransport();
		resetStructuredFetch();
	});

	async function callError(input: ModelInput): Promise<StructuredModelError> {
		try {
			await callModel(input);
		} catch (error) {
			expect(error).toBeInstanceOf(StructuredModelError);
			return error as StructuredModelError;
		}
		throw new Error('expected the parse call to throw');
	}

	it('sends parse’s hybrid payload with its own caller identity', async () => {
		nextResponse = () => jsonResponse(chatBody('{"questions":[]}'));

		const result = await callModel(parseInput());

		expect(fetchCalls).toHaveLength(1);
		const [call] = fetchCalls;
		expect(call?.url).toBe(OPENROUTER_URL);
		const payload = JSON.parse(String(call?.init?.body)) as Record<string, unknown>;
		expect(payload.model).toBe(MODEL_ID);
		expect(payload.max_tokens).toBe(OPENROUTER_MAX_TOKENS);
		expect(payload.max_tokens).toBe(4000);
		expect(payload.plugins).toEqual([{ id: 'file-parser', pdf: { engine: 'native' } }]);
		expect(call?.init?.headers).toMatchObject({
			'HTTP-Referer': 'https://qla.local/parse',
			'X-Title': 'QLA Phase 1 Parse'
		});
		expect(call?.init?.signal).toBeInstanceOf(AbortSignal);

		const messages = payload.messages as Array<{ role: string; content: unknown[] }>;
		expect(messages).toHaveLength(1);
		expect(messages[0]?.role).toBe('user');
		const parts = messages[0]?.content as Array<Record<string, unknown>>;
		expect(parts[0]?.type).toBe('text');
		expect(String(parts[0]?.text)).toContain('--- assessment paper text ---');
		expect(parts.slice(1)).toEqual([
			{
				type: 'file',
				file: { filename: 'paper.pdf', file_data: 'data:application/pdf;base64,AAAA' }
			},
			{
				type: 'file',
				file: { filename: 'markscheme.pdf', file_data: 'data:application/pdf;base64,BBBB' }
			}
		]);
		expect(result.rawJson).toBe('{"questions":[]}');
	});

	it('a 401 maps to MODEL_AUTH, non-retryable', async () => {
		nextResponse = () => new Response('no', { status: 401 });

		const error = await callError(parseInput());

		expect(error.code).toBe('MODEL_AUTH');
		expect(error.retryable).toBe(false);
		expect(fetchCalls).toHaveLength(1);
	});

	it('a 402 credit failure maps to MODEL_CREDIT, non-retryable', async () => {
		nextResponse = () =>
			jsonResponse({ error: { message: 'insufficient credit' } }, { status: 402 });

		const error = await callError(parseInput());

		expect(error.code).toBe('MODEL_CREDIT');
		expect(error.retryable).toBe(false);
	});

	it('a 429 keeps its Retry-After and stays retryable', async () => {
		nextResponse = () =>
			new Response('slow down', { status: 429, headers: { 'Retry-After': '7' } });

		const error = await callError(parseInput());

		expect(error.code).toBe('MODEL_RETRYABLE');
		expect(error.retryable).toBe(true);
		expect(error.retryAfter).toBe(7);
	});

	it('a length finish is a retryable cut-off, not malformed JSON', async () => {
		nextResponse = () => jsonResponse(chatBody('{"questions":[', 'length'));

		const error = await callError(parseInput());

		expect(error.code).toBe('MODEL_RETRYABLE');
		expect(error.retryable).toBe(true);
	});

	it('returns the parsed content with usage priced from the curated catalogue', async () => {
		nextResponse = () => jsonResponse(chatBody('```json\n{"questions":[]}\n```'), { status: 200 });

		const result = await callModel(parseInput({ useNativePdf: false }));

		expect(result.rawJson).toBe('{"questions":[]}');
		expect(result.usage).toEqual({
			promptTokens: 10,
			completionTokens: 5,
			totalTokens: 15,
			estCost: estimateCost(10, 5, MODEL_ID)
		});
		expect(console.info).toHaveBeenCalledTimes(1);
	});
});
