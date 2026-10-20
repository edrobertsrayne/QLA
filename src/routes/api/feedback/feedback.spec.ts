// Contract tests for `GET|POST /api/feedback`: JSON in, `{ number, url }` or
// the error envelope out. The model and GitHub are stubs (zero real calls).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET, POST } from './+server';
import { MODEL_RETRYABLE_CODE } from '$lib/server/parse/model';
import { clearEnvForTests, setEnvForTests } from '$lib/server/parse/env';
import { DEFAULT_MODEL_ID } from '$lib/server/parse/pdf';
import { resetFeedbackFetch, setFeedbackFetch } from '$lib/server/feedback';
import {
	resetStructuredTransport,
	setStructuredTransport,
	StructuredModelError,
	type StructuredModelInput
} from '$lib/server/openrouter';

const USAGE = { promptTokens: 1, completionTokens: 1, totalTokens: 2, estCost: 0 };
const ISSUE_URL = 'https://github.com/edrobertsrayne/QLA/issues/42';

interface Envelope {
	number?: number;
	url?: string;
	enabled?: boolean;
	error?: { code?: string; field?: string; retryable?: boolean };
}

let modelCalls: StructuredModelInput[];
let githubCalls: { url: string; init?: RequestInit }[];

function stubModel(content: string | Error): void {
	setStructuredTransport(async (input) => {
		modelCalls.push(input);
		if (content instanceof Error) throw content;
		return { content, usage: USAGE };
	});
}

function stubGithub(respond: () => Response): void {
	setFeedbackFetch(async (url, init) => {
		githubCalls.push({ url, init });
		return respond();
	});
}

function created(): Response {
	return Response.json({ number: 42, html_url: ISSUE_URL }, { status: 201 });
}

async function post(payload: unknown): Promise<{ status: number; json: Envelope }> {
	const request = new Request('http://localhost/api/feedback', {
		method: 'POST',
		body: JSON.stringify(payload)
	});
	const response = await POST({ request } as unknown as Parameters<typeof POST>[0]);
	return { status: response.status, json: (await response.json()) as Envelope };
}

function filedTitle(): string {
	const body = githubCalls[0]?.init?.body;
	return JSON.parse(String(body)).title;
}

beforeEach(() => {
	modelCalls = [];
	githubCalls = [];
	setEnvForTests('OPENROUTER_MODEL', '');
	setEnvForTests('GITHUB_FEEDBACK_TOKEN', 't');
	stubModel('{"title":"x"}');
	stubGithub(created);
});

afterEach(() => {
	clearEnvForTests();
	resetFeedbackFetch();
	resetStructuredTransport();
});

describe('GET /api/feedback', () => {
	it('reports whether a token is configured', async () => {
		setEnvForTests('GITHUB_FEEDBACK_TOKEN', '');
		const off = await GET({} as Parameters<typeof GET>[0]);
		expect(await off.json()).toEqual({ enabled: false });
		setEnvForTests('GITHUB_FEEDBACK_TOKEN', 't');
		const on = await GET({} as Parameters<typeof GET>[0]);
		expect(await on.json()).toEqual({ enabled: true });
	});
});

describe('POST /api/feedback', () => {
	it('refuses without a token, calling nothing', async () => {
		setEnvForTests('GITHUB_FEEDBACK_TOKEN', '');
		const { status, json } = await post({ text: 'x', page: '/' });
		expect(status).toBe(500);
		expect(json.error?.code).toBe('MISSING_GITHUB_TOKEN');
		expect(modelCalls).toHaveLength(0);
		expect(githubCalls).toHaveLength(0);
	});

	it('rejects blank text and unknown keys', async () => {
		const blank = await post({ text: '   ', page: '/' });
		expect(blank.status).toBe(400);
		expect(blank.json.error?.field).toBe('text');
		const extra = await post({ text: 'x', page: '/', extra: 1 });
		expect(extra.status).toBe(400);
		expect(extra.json.error?.field).toBe('extra');
	});

	it('files an issue titled by the model', async () => {
		stubModel('{"title":"Grid header overlaps the first row"}');
		const { status, json } = await post({
			text: 'Grid header overlaps\nmore detail',
			page: '/marksheet'
		});
		expect(status).toBe(201);
		expect(json).toEqual({ number: 42, url: ISSUE_URL });
		expect(modelCalls[0]?.modelId).toBe(DEFAULT_MODEL_ID);
		expect(modelCalls[0]?.data).toEqual({
			feedback: 'Grid header overlaps\nmore detail',
			page: '/marksheet'
		});
		const call = githubCalls[0];
		expect(call?.url).toBe('https://api.github.com/repos/edrobertsrayne/QLA/issues');
		expect((call?.init?.headers as Record<string, string>).Authorization).toBe('Bearer t');
		const issue = JSON.parse(String(call?.init?.body));
		expect(issue.title).toBe('Grid header overlaps the first row');
		expect(issue.labels).toEqual(['feedback', 'needs-triage']);
		expect(issue.body).toContain('Grid header overlaps\nmore detail');
		expect(issue.body).toContain('Page: `/marksheet`');
	});

	it('uses OPENROUTER_MODEL when set', async () => {
		setEnvForTests('OPENROUTER_MODEL', 'env/model');
		await post({ text: 'x', page: '/' });
		expect(modelCalls[0]?.modelId).toBe('env/model');
	});

	it('falls back to the first line when the model fails', async () => {
		stubModel(new StructuredModelError('x', { code: MODEL_RETRYABLE_CODE, retryable: true }));
		await post({ text: 'Grid header overlaps\nmore detail', page: '/' });
		expect(filedTitle()).toBe('Feedback: Grid header overlaps');
	});

	it.each([['{"title":""}'], [JSON.stringify({ title: 'a'.repeat(81) })]])(
		'falls back on an unusable title %#',
		async (content) => {
			stubModel(content);
			await post({ text: 'Grid header overlaps', page: '/' });
			expect(filedTitle()).toBe('Feedback: Grid header overlaps');
		}
	);

	it('caps a long fallback title at 80 characters', async () => {
		stubModel(new Error('down'));
		await post({ text: 'a'.repeat(100), page: '/' });
		expect(filedTitle()).toHaveLength(80);
	});

	it('maps a GitHub refusal to a non-retryable 502', async () => {
		stubGithub(() => new Response('{}', { status: 401 }));
		const { status, json } = await post({ text: 'x', page: '/' });
		expect(status).toBe(502);
		expect(json.error).toMatchObject({ code: 'GITHUB_REJECTED', retryable: false });
	});

	it('maps an unreachable GitHub to a retryable 502', async () => {
		setFeedbackFetch(async () => {
			throw new Error('offline');
		});
		const { status, json } = await post({ text: 'x', page: '/' });
		expect(status).toBe(502);
		expect(json.error).toMatchObject({ code: 'GITHUB_UNREACHABLE', retryable: true });
	});
});
