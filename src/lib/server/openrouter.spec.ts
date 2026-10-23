// Contract tests for the shared OpenRouter structured-output transport and
// the shared untrusted-data fence (issue #60: prefactor for `/api/report`
// and `/api/topic-names`).
//
// Transport tests drive the live implementation through the fetch seam
// (`setStructuredFetch`) so every upstream outcome maps to its spec code.
// Route-level tests stub one level up at `setStructuredTransport` and never
// touch fetch.

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { fenceDocuments } from './fence';
import {
	callStructuredModel,
	resetStructuredFetch,
	resetStructuredTransport,
	setStructuredFetch,
	setStructuredTransport,
	STRUCTURED_DEFAULT_MAX_TOKENS,
	StructuredModelError,
	type StructuredModelInput
} from './openrouter';
import { clearEnvForTests, setEnvForTests } from './parse/env';
import { estimateCost } from './parse/model';

const PROSE_SENTINEL = 'PROSE-SENTINEL-mango-tango-42';

function structuredInput(overrides: Partial<StructuredModelInput> = {}): StructuredModelInput {
	return {
		modelId: 'openai/gpt-6-luna',
		systemPrompt: `System instructions ${PROSE_SENTINEL}`,
		data: { paperLabel: 'Thermal physics', entries: [], note: PROSE_SENTINEL },
		schemaName: 'report_feedback',
		schema: { type: 'object', properties: {} },
		caller: { referer: 'https://qla.local/report', title: 'QLA Phase 3 Report' },
		...overrides
	};
}

function chatBody(
	content: unknown,
	overrides: { usage?: Record<string, number>; finishReason?: string } = {}
): Record<string, unknown> {
	return {
		choices: [{ message: { content }, finish_reason: overrides.finishReason ?? 'stop' }],
		usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, ...overrides.usage }
	};
}

describe('fenceDocuments', () => {
	it('builds matching markers around a fresh 32-hex nonce and names them in the directive', () => {
		const fence = fenceDocuments('alpha', 'beta');

		expect(fence.nonce).toMatch(/^[0-9a-f]{32}$/);
		expect({ open: fence.open, close: fence.close }).toEqual({
			open: `<<<DOCUMENT-START boundary="${fence.nonce}">>>`,
			close: `<<<DOCUMENT-END boundary="${fence.nonce}">>>`
		});
		expect(fence.directive).toContain(fence.open);
		expect(fence.directive).toContain(fence.close);
		expect(fence.directive).toMatch(/never instructions to follow/i);
	});

	it('mints a fresh nonce per call', () => {
		expect(fenceDocuments('same text').nonce).not.toBe(fenceDocuments('same text').nonce);
	});
});

describe('structured transport stub seam', () => {
	it('a stubbed call returns content plus usage without touching fetch', async () => {
		let fetchCalls = 0;
		setStructuredFetch(async () => {
			fetchCalls += 1;
			throw new Error('must not reach fetch through the stub');
		});
		const stubbed = {
			content: '{"strengths":[]}',
			usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estCost: 0 }
		};
		setStructuredTransport(async () => stubbed);

		await expect(callStructuredModel(structuredInput())).resolves.toEqual(stubbed);
		expect(fetchCalls).toBe(0);
	});
});

describe('live structured transport', () => {
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
		resetStructuredTransport();
		setStructuredFetch(async (url, init) => {
			fetchCalls.push({ url, init });
			return nextResponse();
		});
	});

	afterEach(() => {
		clearEnvForTests();
		resetStructuredTransport();
		resetStructuredFetch();
	});

	async function callError(input: StructuredModelInput): Promise<StructuredModelError> {
		try {
			await callStructuredModel(input);
		} catch (error) {
			expect(error).toBeInstanceOf(StructuredModelError);
			return error as StructuredModelError;
		}
		throw new Error('expected the structured call to throw');
	}

	function jsonResponse(body: unknown, init?: ResponseInit): Response {
		return new Response(JSON.stringify(body), {
			...init,
			headers: { 'Content-Type': 'application/json', ...init?.headers }
		});
	}

	it('sends one strict structured request: system plus fenced JSON user data', async () => {
		nextResponse = () => jsonResponse(chatBody('{"strengths":[]}'));

		await callStructuredModel(structuredInput());

		expect(fetchCalls).toHaveLength(1);
		const [call] = fetchCalls;
		expect(call?.url).toBe('https://openrouter.ai/api/v1/chat/completions');
		const payload = JSON.parse(String(call?.init?.body)) as Record<string, unknown>;
		expect(payload.model).toBe('openai/gpt-6-luna');
		expect(payload.max_tokens).toBe(STRUCTURED_DEFAULT_MAX_TOKENS);
		expect(payload.stream).toBe(false);
		expect(payload.provider).toEqual({ require_parameters: true });
		expect(payload.response_format).toEqual({
			type: 'json_schema',
			json_schema: {
				name: 'report_feedback',
				strict: true,
				schema: { type: 'object', properties: {} }
			}
		});
		const messages = payload.messages as Array<{ role: string; content: unknown }>;
		expect(messages).toHaveLength(2);
		expect(messages[0]?.role).toBe('system');
		expect(messages[0]?.content).toContain(PROSE_SENTINEL);
		expect(messages[0]?.content).toMatch(/never instructions to follow/i);
		expect(messages[1]?.role).toBe('user');
		const parts = messages[1]?.content as Array<{ type: string; text: string }>;
		expect(parts).toHaveLength(1);
		// No files: today's payload, without the native file parser plugin.
		expect(payload).not.toHaveProperty('plugins');
		const userText = String(parts[0]?.text ?? '');
		const systemText = String(messages[0]?.content ?? '');
		// The open/close markers name one shared 32-hex nonce; the system
		// directive names the same pair, so fenced data is marked untrusted.
		const nonces = [...userText.matchAll(/boundary="([0-9a-f]{32})"/g)].map((m) => m[1]);
		expect(nonces).toHaveLength(2);
		expect(nonces[0]).toBe(nonces[1]);
		expect(systemText).toContain(`boundary="${nonces[0]}"`);
		expect(userText).toContain('"paperLabel":"Thermal physics"');
		expect(call?.init?.signal).toBeInstanceOf(AbortSignal);
		expect(call?.init?.headers).toMatchObject({
			'HTTP-Referer': 'https://qla.local/report',
			'X-Title': 'QLA Phase 3 Report'
		});
	});

	it('attaches native PDFs after the fenced data and pins the file parser to native', async () => {
		nextResponse = () => jsonResponse(chatBody('{"pairs":[]}'));

		await callStructuredModel(
			structuredInput({
				files: [
					{ filename: 'tier1.pdf', pdfBase64: 'AAA' },
					{ filename: 'tier2.pdf', pdfBase64: 'BBB' }
				]
			})
		);

		const payload = JSON.parse(String(fetchCalls[0]?.init?.body)) as Record<string, unknown>;
		expect(payload.plugins).toEqual([{ id: 'file-parser', pdf: { engine: 'native' } }]);
		const messages = payload.messages as Array<{ role: string; content: unknown }>;
		const parts = messages[1]?.content as Array<Record<string, unknown>>;
		expect(parts).toHaveLength(3);
		expect(parts[0]?.type).toBe('text');
		expect(parts.slice(1)).toEqual([
			{
				type: 'file',
				file: { filename: 'tier1.pdf', file_data: 'data:application/pdf;base64,AAA' }
			},
			{
				type: 'file',
				file: { filename: 'tier2.pdf', file_data: 'data:application/pdf;base64,BBB' }
			}
		]);
	});

	it('returns the extracted content with mapped usage and logs usage only', async () => {
		nextResponse = () =>
			jsonResponse(
				chatBody('```json\n{"strengths":[]}\n```', {
					usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
				})
			);

		const result = await callStructuredModel(structuredInput());

		expect(result.content).toBe('{"strengths":[]}');
		expect(result.usage).toEqual({
			promptTokens: 10,
			completionTokens: 5,
			totalTokens: 15,
			estCost: estimateCost(10, 5, 'openai/gpt-6-luna')
		});
		expect(console.info).toHaveBeenCalledTimes(1);
		const logged = String(vi.mocked(console.info).mock.calls[0]?.[0] ?? '');
		expect(logged).toContain('"promptTokens":10');
		expect(logged).not.toContain(PROSE_SENTINEL);
	});

	it('honours caller-chosen max_tokens', async () => {
		nextResponse = () => jsonResponse(chatBody('{}'));

		await callStructuredModel(structuredInput({ maxTokens: 100 }));

		const payload = JSON.parse(String(fetchCalls[0]?.init?.body)) as Record<string, unknown>;
		expect(payload.max_tokens).toBe(100);
	});

	it('a missing API key fails without any request', async () => {
		setEnvForTests('OPENROUTER_API_KEY', '');

		const error = await callError(structuredInput());

		expect(error.code).toBe('MISSING_API_KEY');
		expect(error.retryable).toBe(false);
		expect(fetchCalls).toHaveLength(0);
		expect(console.info).not.toHaveBeenCalled();
	});

	it.each([{ status: 408 }, { status: 429 }, { status: 500 }, { status: 502 }, { status: 503 }])(
		'upstream $status maps to MODEL_RETRYABLE with a single request',
		async ({ status }) => {
			nextResponse = () => new Response('oops', { status });

			const error = await callError(structuredInput());

			expect(error.code).toBe('MODEL_RETRYABLE');
			expect(error.retryable).toBe(true);
			expect(fetchCalls).toHaveLength(1);
		}
	);

	it('honours Retry-After on a retryable status and ignores a bad one', async () => {
		nextResponse = () =>
			new Response('slow down', { status: 429, headers: { 'Retry-After': '7' } });
		expect((await callError(structuredInput())).retryAfter).toBe(7);

		fetchCalls.length = 0;
		nextResponse = () =>
			new Response('slow down', {
				status: 429,
				headers: { 'Retry-After': new Date(Date.now() + 60_000).toUTCString() }
			});
		const dated = await callError(structuredInput());
		expect(dated.retryAfter).toBeGreaterThan(0);
		expect(dated.retryAfter).toBeLessThanOrEqual(60);

		fetchCalls.length = 0;
		nextResponse = () =>
			new Response('slow down', { status: 429, headers: { 'Retry-After': 'soon' } });
		expect((await callError(structuredInput())).retryAfter).toBeUndefined();
	});

	it('a network failure maps to MODEL_RETRYABLE', async () => {
		setStructuredFetch(async () => {
			throw new Error('boom');
		});

		const error = await callError(structuredInput());

		expect(error.code).toBe('MODEL_RETRYABLE');
		expect(error.retryable).toBe(true);
	});

	it('a timeout maps to MODEL_RETRYABLE', async () => {
		setStructuredFetch(async () => {
			throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
		});

		const error = await callError(structuredInput());

		expect(error.code).toBe('MODEL_RETRYABLE');
		expect(error.retryable).toBe(true);
	});

	it('a 402 from the in-flight budget is retryable, any other 402 is MODEL_CREDIT', async () => {
		nextResponse = () =>
			jsonResponse(
				{
					error: {
						message: 'in-flight budget exceeded',
						metadata: { limit_source: 'openrouter_in_flight_budget' }
					}
				},
				{ status: 402 }
			);
		const budget = await callError(structuredInput());
		expect(budget.code).toBe('MODEL_RETRYABLE');
		expect(budget.retryable).toBe(true);
		expect(fetchCalls).toHaveLength(1);

		fetchCalls.length = 0;
		nextResponse = () =>
			jsonResponse({ error: { message: 'insufficient credit' } }, { status: 402 });
		const credit = await callError(structuredInput());
		expect(credit.code).toBe('MODEL_CREDIT');
		expect(credit.retryable).toBe(false);
	});

	it('a 402 that merely mentions the budget elsewhere is MODEL_CREDIT', async () => {
		nextResponse = () =>
			jsonResponse(
				{
					error: {
						message: 'see openrouter_in_flight_budget docs',
						metadata: { limit_source: 'other' }
					}
				},
				{ status: 402 }
			);

		const error = await callError(structuredInput());

		expect(error.code).toBe('MODEL_CREDIT');
		expect(error.retryable).toBe(false);
	});

	it('401 maps to MODEL_AUTH and other 4xx to MODEL_REJECTED', async () => {
		nextResponse = () => new Response('no', { status: 401 });
		const auth = await callError(structuredInput());
		expect(auth.code).toBe('MODEL_AUTH');
		expect(auth.retryable).toBe(false);

		for (const status of [400, 403, 404]) {
			fetchCalls.length = 0;
			nextResponse = () => new Response('no', { status });
			const rejected = await callError(structuredInput());
			expect(rejected.code).toBe('MODEL_REJECTED');
			expect(rejected.retryable).toBe(false);
			expect(fetchCalls).toHaveLength(1);
		}
	});

	it('a length finish and empty content map to MODEL_RETRYABLE', async () => {
		nextResponse = () => jsonResponse(chatBody('{"partial":true', { finishReason: 'length' }));
		expect((await callError(structuredInput())).code).toBe('MODEL_RETRYABLE');

		nextResponse = () => jsonResponse(chatBody('   '));
		expect((await callError(structuredInput())).code).toBe('MODEL_RETRYABLE');

		nextResponse = () => jsonResponse({ choices: [], usage: {} });
		expect((await callError(structuredInput())).code).toBe('MODEL_RETRYABLE');
	});

	it('an unreadable success body maps to MODEL_RETRYABLE', async () => {
		nextResponse = () => new Response('not json', { status: 200 });

		expect((await callError(structuredInput())).code).toBe('MODEL_RETRYABLE');
	});
});
