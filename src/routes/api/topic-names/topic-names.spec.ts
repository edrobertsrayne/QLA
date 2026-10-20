// Contract tests for `POST /api/topic-names`.
//
// Externally observable behaviour only: JSON in, `{ names, model, usage }`
// or the error envelope out. The model is a stub transport (zero real
// calls); upstream status mapping runs the live transport over a stubbed
// fetch.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST } from './+server';
import { isRecord } from '$lib/parse/is-breakdown.js';
import { STRUCTURED_MAX_BODY_BYTES } from '$lib/server/structured-route';
import {
	resetStructuredFetch,
	resetStructuredTransport,
	setStructuredFetch,
	setStructuredTransport,
	StructuredModelError,
	type StructuredModelInput,
	type StructuredModelResult
} from '$lib/server/openrouter';
import {
	clearApiKeyForTests,
	clearDefaultModelForTests,
	setApiKeyForTests,
	setDefaultModelForTests
} from '$lib/server/parse/env';
import { DEFAULT_MODEL_ID } from '$lib/server/parse/pdf';

interface Envelope {
	names?: Record<string, string>;
	model?: string;
	usage?: { totalTokens?: number };
	error?: {
		code?: string;
		message?: string;
		retryable?: boolean;
		retryAfter?: number;
		field?: string;
		checks?: { id: string; message: string }[];
	};
}

type Body = Record<string, unknown>;

const USAGE = { promptTokens: 10, completionTokens: 5, totalTokens: 15, estCost: 0 };

function code(code: string, summaries: string[] = ['Calculate the new mean speed.']): Body {
	return { code, summaries };
}

function body(overrides: Body = {}): Body {
	return {
		paperLabel: 'Thermal Physics',
		codes: [code('5.1.1'), code('5.1.2', ['Explain gas pressure.', 'State the kinetic model.'])],
		...overrides
	};
}

const GOOD_OUTPUT = {
	names: [
		{ code: '5.1.1', name: 'Kinetic theory of gases' },
		{ code: '5.1.2', name: 'Gas pressure and temperature' }
	]
};

let calls: StructuredModelInput[];

function stubModel(output: unknown, raw?: string): void {
	setStructuredTransport(async (input): Promise<StructuredModelResult> => {
		calls.push(input);
		return { content: raw ?? JSON.stringify(output), usage: USAGE };
	});
}

async function post(payload: string | Body): Promise<{ status: number; json: Envelope }> {
	const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
	const request = new Request('http://localhost/api/topic-names', { method: 'POST', body: text });
	const response = await POST({ request } as unknown as Parameters<typeof POST>[0]);
	return { status: response.status, json: (await response.json()) as Envelope };
}

beforeEach(() => {
	calls = [];
	setApiKeyForTests('test-key');
	setDefaultModelForTests('');
	stubModel(GOOD_OUTPUT);
});

afterEach(() => {
	clearApiKeyForTests();
	clearDefaultModelForTests();
	resetStructuredTransport();
	resetStructuredFetch();
});

describe('POST /api/topic-names success', () => {
	it('returns only the usable names, the model and usage', async () => {
		const { status, json } = await post(body());

		expect(status).toBe(200);
		expect(json.names).toEqual({
			'5.1.1': 'Kinetic theory of gases',
			'5.1.2': 'Gas pressure and temperature'
		});
		expect(json.model).toBeTruthy();
		expect(json.usage?.totalTokens).toBe(15);
		expect(calls).toHaveLength(1);
	});

	it('resolves the model override over the env default', async () => {
		setDefaultModelForTests('env/model');

		const { json } = await post(body({ model: 'custom/override' }));

		expect(json.model).toBe('custom/override');
		expect(calls[0]?.modelId).toBe('custom/override');
	});

	it('falls back to the shared default with neither', async () => {
		const { json } = await post(body());

		expect(json.model).toBe(DEFAULT_MODEL_ID);
		expect(calls[0]?.modelId).toBe(DEFAULT_MODEL_ID);
	});
});

describe('POST /api/topic-names model payload', () => {
	it('carries the codes and summaries but no marks or students', async () => {
		await post(body());

		const data = calls[0]?.data;
		expect(isRecord(data) ? data['codes'] : undefined).toEqual([
			{ code: '5.1.1', summaries: ['Calculate the new mean speed.'] },
			{ code: '5.1.2', summaries: ['Explain gas pressure.', 'State the kinetic model.'] }
		]);
		const keys: string[] = [];
		const walk = (value: unknown): void => {
			if (Array.isArray(value)) value.forEach(walk);
			else if (value !== null && typeof value === 'object') {
				for (const [key, child] of Object.entries(value)) {
					keys.push(key);
					walk(child);
				}
			}
		};
		walk(data);

		expect(keys.length).toBeGreaterThan(0);
		for (const forbidden of [
			'id',
			'studentId',
			'studentName',
			'class',
			'className',
			'marks',
			'gained'
		]) {
			expect(keys).not.toContain(forbidden);
		}
	});

	it('sends a bare object schema for the transport to wrap once', async () => {
		resetStructuredTransport();
		let sent: Record<string, unknown> = {};
		setStructuredFetch(async (_url, init) => {
			sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
			return Response.json({
				choices: [{ message: { content: JSON.stringify(GOOD_OUTPUT) }, finish_reason: 'stop' }],
				usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
			});
		});

		const { status } = await post(body());

		expect(status).toBe(200);
		const format = (sent['response_format'] ?? {}) as Record<string, unknown>;
		const wrapped = (format['json_schema'] ?? {}) as Record<string, unknown>;
		expect(format['type']).toBe('json_schema');
		expect(wrapped['name']).toBe('topic_names');
		expect(wrapped['schema']).toEqual({
			type: 'object',
			properties: { names: expect.anything() },
			required: ['names'],
			additionalProperties: false
		});
	});
});

describe('POST /api/topic-names local name handling', () => {
	it('ignores codes that were never asked for', async () => {
		stubModel({
			names: [
				{ code: '5.1.1', name: 'Kinetic theory of gases' },
				{ code: '9.9.9', name: 'Sneaked in' }
			]
		});

		const { status, json } = await post(body());

		expect(status).toBe(200);
		expect(json.names).toEqual({ '5.1.1': 'Kinetic theory of gases' });
	});

	it('drops blank, over-long and contact names', async () => {
		stubModel({
			names: [
				{ code: '5.1.1', name: '   ' },
				{ code: '5.1.2', name: 'see www.example.org for help' }
			]
		});

		const { status, json } = await post(body());

		expect(status).toBe(200);
		expect(json.names).toEqual({});
	});

	it('drops an over-120-character name', async () => {
		stubModel({ names: [{ code: '5.1.1', name: 'x'.repeat(121) }] });

		const { json } = await post(body({ codes: [code('5.1.1')] }));

		expect(json.names).toEqual({});
	});

	it('answers unparseable model content as a retryable shape failure', async () => {
		stubModel(null, 'sorry, I cannot do that');

		const { status, json } = await post(body());

		expect(status).toBe(502);
		expect(json.error?.code).toBe('INVALID_MODEL_OUTPUT');
		expect(json.error?.retryable).toBe(true);
		expect(json.error?.checks?.[0]?.id).toBe('shape');
		expect(json.names).toBeUndefined();
		expect(calls).toHaveLength(1);
	});
});

describe('POST /api/topic-names input validation (no model spend)', () => {
	const codes = (...list: Body[]) => ({ codes: list });
	const cases: [string, Body, string][] = [
		['unknown top-level key', body({ extra: 1 }), 'extra'],
		['non-string model', body({ model: 5 }), 'model'],
		['blank model', body({ model: '  ' }), 'model'],
		['non-string paperLabel', body({ paperLabel: 5 }), 'paperLabel'],
		['paperLabel over 120', body({ paperLabel: 'x'.repeat(121) }), 'paperLabel'],
		['codes not a list', body({ codes: 'no' }), 'codes'],
		['no codes', body(codes()), 'codes'],
		['201 codes', body(codes(...Array.from({ length: 201 }, (_, i) => code(`C${i}`)))), 'codes'],
		['non-object code', body({ codes: ['x'] }), 'codes[0]'],
		['unknown code key', body({ codes: [{ ...code('5.1.1'), grade: 'A' }] }), 'codes[0].grade'],
		['empty code', body(codes(code(''))), 'codes[0].code'],
		['blank code', body(codes(code('  '))), 'codes[0].code'],
		['code over 120', body(codes(code('x'.repeat(121)))), 'codes[0].code'],
		['duplicate code', body(codes(code('5.1.1'), code('5.1.1'))), 'codes[1].code'],
		['summaries not a list', body(codes({ code: '5.1.1', summaries: 'no' })), 'codes[0].summaries'],
		['no summaries', body(codes({ code: '5.1.1', summaries: [] })), 'codes[0].summaries'],
		[
			'non-string summary',
			body(codes(code('5.1.1', [5 as unknown as string]))),
			'codes[0].summaries[0]'
		],
		['summary over 300', body(codes(code('5.1.1', ['x'.repeat(301)]))), 'codes[0].summaries[0]']
	];

	it.each(cases)('rejects %s with 400 and its field path', async (_name, payload, field) => {
		const { status, json } = await post(payload);

		expect(status).toBe(400);
		expect(json.error?.code).toBe('INVALID_TOPIC_NAMES_INPUT');
		expect(json.error?.retryable).toBe(false);
		expect(json.error?.field).toBe(field);
		expect(calls).toHaveLength(0);
	});

	it('rejects non-JSON with 400 and an empty field', async () => {
		const { status, json } = await post('not json {');

		expect(status).toBe(400);
		expect(json.error?.code).toBe('INVALID_TOPIC_NAMES_INPUT');
		expect(json.error?.field).toBe('');
		expect(calls).toHaveLength(0);
	});

	it('rejects a non-object body', async () => {
		const { status, json } = await post('[1]');

		expect(status).toBe(400);
		expect(json.error?.code).toBe('INVALID_TOPIC_NAMES_INPUT');
		expect(calls).toHaveLength(0);
	});

	it('rejects bodies over 256 KB with 413', async () => {
		const { status, json } = await post(
			JSON.stringify({ paperLabel: 'x'.repeat(STRUCTURED_MAX_BODY_BYTES) })
		);

		expect(status).toBe(413);
		expect(json.error?.code).toBe('INVALID_TOPIC_NAMES_INPUT');
		expect(json.error?.retryable).toBe(false);
		expect(calls).toHaveLength(0);
	});
});

describe('POST /api/topic-names upstream failures', () => {
	let fetches: number;

	function upstream(status: number, headers: Record<string, string> = {}): void {
		resetStructuredTransport();
		fetches = 0;
		setStructuredFetch(async () => {
			fetches += 1;
			return new Response('{}', { status, headers });
		});
	}

	const cases: [number, number, string, boolean][] = [
		[401, 500, 'MODEL_AUTH', false],
		[402, 502, 'MODEL_CREDIT', false],
		[400, 502, 'MODEL_REJECTED', false],
		[404, 502, 'MODEL_REJECTED', false],
		[408, 502, 'MODEL_RETRYABLE', true],
		[429, 502, 'MODEL_RETRYABLE', true],
		[500, 502, 'MODEL_RETRYABLE', true],
		[503, 502, 'MODEL_RETRYABLE', true]
	];

	it.each(cases)(
		'maps upstream %i to %i %s with one upstream call',
		async (upstreamStatus, status, code, retryable) => {
			upstream(upstreamStatus);

			const { status: got, json } = await post(body());

			expect(got).toBe(status);
			expect(json.error?.code).toBe(code);
			expect(json.error?.retryable).toBe(retryable);
			expect(fetches).toBe(1);
		}
	);

	it('honours Retry-After on a retryable failure', async () => {
		upstream(429, { 'Retry-After': '7' });

		const { json } = await post(body());

		expect(json.error?.code).toBe('MODEL_RETRYABLE');
		expect(json.error?.retryAfter).toBe(7);
		expect(fetches).toBe(1);
	});

	it('reports a missing server key as a non-retryable 500 without calling upstream', async () => {
		upstream(200);
		setApiKeyForTests('');

		const { status, json } = await post(body());

		expect(status).toBe(500);
		expect(json.error?.code).toBe('MISSING_API_KEY');
		expect(json.error?.retryable).toBe(false);
		expect(fetches).toBe(0);
	});

	it('does not retry a retryable transport error', async () => {
		let attempts = 0;
		setStructuredTransport(async () => {
			attempts += 1;
			throw new StructuredModelError('busy', { code: 'MODEL_RETRYABLE', retryable: true });
		});

		const { status } = await post(body());

		expect(status).toBe(502);
		expect(attempts).toBe(1);
	});
});
