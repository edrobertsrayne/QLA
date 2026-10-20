// Contract tests for `POST /api/report`.
//
// Externally observable behaviour only: JSON in, `{ strengths,
// areasForImprovement, model, usage }` or the error envelope out. The model is
// a stub transport (zero real calls); upstream status mapping runs the live
// transport over a stubbed fetch.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST } from './+server';
import { isRecord } from '$lib/parse/is-breakdown.js';
import { REPORT_MAX_BODY_BYTES } from '$lib/server/report';
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

interface Envelope {
	strengths?: string[];
	areasForImprovement?: string[];
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
type Entry = Record<string, unknown>;

const USAGE = { promptTokens: 10, completionTokens: 5, totalTokens: 15, estCost: 0 };

function entry(label: string, gained: number, available: number, overrides: Entry = {}): Entry {
	return {
		label,
		summary: `Question ${label}`,
		commandWord: 'Explain',
		ao: 'AO1',
		topics: [],
		gained,
		available,
		...overrides
	};
}

function body(overrides: Body = {}): Body {
	return {
		paperLabel: 'Paper 1',
		entries: [
			entry('1', 2, 2, { topics: ['Forces'] }), // full marks
			entry('2', 1, 4, { ao: 'AO2', topics: ['Forces', 'Energy'] }), // red
			entry('3', 3, 4, { topics: ['Energy'] }), // green
			entry('4', 2, 4, { ao: null, commandWord: null }) // amber, no topic
		],
		...overrides
	};
}

function theme(text: string, ...questions: string[]) {
	return { text, questions };
}

const GOOD_OUTPUT = {
	strengths: [theme('Secure recall on the early questions', '1', '3')],
	areasForImprovement: [theme('Longer explanations lose marks', '2')]
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
	const request = new Request('http://localhost/api/report', { method: 'POST', body: text });
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

describe('POST /api/report success', () => {
	it('returns only the prose, the model and usage', async () => {
		const { status, json } = await post(body());

		expect(status).toBe(200);
		expect(json.strengths).toEqual(['Secure recall on the early questions']);
		expect(json.areasForImprovement).toEqual(['Longer explanations lose marks']);
		expect(json.model).toBeTruthy();
		expect(json.usage?.totalTokens).toBe(15);
		expect(json).not.toHaveProperty('questions');
		expect(calls).toHaveLength(1);
	});

	it('accepts a fenced JSON answer', async () => {
		stubModel(null, '```json\n' + JSON.stringify(GOOD_OUTPUT) + '\n```');

		expect((await post(body())).status).toBe(200);
	});

	it('accepts decimal marks within range', async () => {
		stubModel({
			strengths: [theme('Secure recall on the early questions', '2')],
			areasForImprovement: [theme('Longer explanations lose marks', '1')]
		});
		const { status } = await post(body({ entries: [entry('1', 0.5, 2.5), entry('2', 2.5, 2.5)] }));
		expect(status).toBe(200);
	});

	it('allows empty areas only when every mark was gained', async () => {
		stubModel({ strengths: [theme('Everything secure', '1')], areasForImprovement: [] });

		const allFull = await post(body({ entries: [entry('1', 2, 2), entry('2', 4, 4)] }));
		expect(allFull.status).toBe(200);
		expect(allFull.json.areasForImprovement).toEqual([]);

		const dropped = await post(body());
		expect(dropped.status).toBe(502);
		expect(dropped.json.error?.checks?.map((check) => check.id)).toContain('areas-required');
	});
});

describe('POST /api/report model payload', () => {
	it('rolls marks up per topic and leaves no-topic entries out of it', async () => {
		await post(body());

		const data = calls[0]?.data;
		expect(isRecord(data) ? data['topics'] : undefined).toEqual([
			{ name: 'Forces', gained: 3, available: 6 },
			{ name: 'Energy', gained: 4, available: 8 }
		]);
	});

	it('sends no topic roll-up rows when no entry has a topic', async () => {
		await post(body({ entries: [entry('1', 1, 2), entry('2', 2, 2)] }));

		const data = calls[0]?.data;
		expect(isRecord(data) ? data['topics'] : undefined).toEqual([]);
	});

	it('carries no student identifier anywhere in the data', async () => {
		await post(body());

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
		walk(calls[0]?.data);

		expect(keys.length).toBeGreaterThan(0);
		// Topic roll-up rows legitimately carry `name` (the topic's), so it is not forbidden.
		for (const forbidden of ['id', 'studentId', 'studentName', 'class', 'className']) {
			expect(keys).not.toContain(forbidden);
		}
	});

	it('restricts the schema to the labels it was given', async () => {
		await post(body());

		expect(JSON.stringify(calls[0]?.schema)).toContain('"4"');
	});
});

describe('POST /api/report model resolution', () => {
	it('prefers the request override over the env default', async () => {
		setDefaultModelForTests('env/model');

		const { json } = await post(body({ model: 'custom/override' }));

		expect(json.model).toBe('custom/override');
		expect(calls[0]?.modelId).toBe('custom/override');
	});

	it('uses the env default without an override', async () => {
		setDefaultModelForTests('env/model');

		const { json } = await post(body());

		expect(json.model).toBe('env/model');
		expect(calls[0]?.modelId).toBe('env/model');
	});

	it('falls back to the report default with neither', async () => {
		const { json } = await post(body());

		expect(json.model).toBe('openai/gpt-6-luna');
	});
});

describe('POST /api/report input validation (no model spend)', () => {
	const entries = (...list: Entry[]) => ({ entries: list });
	const cases: [string, Body, string][] = [
		['unknown top-level key', body({ extra: 1 }), 'extra'],
		['non-string model', body({ model: 5 }), 'model'],
		['blank model', body({ model: '  ' }), 'model'],
		['non-string paperLabel', body({ paperLabel: 5 }), 'paperLabel'],
		['paperLabel over 120', body({ paperLabel: 'x'.repeat(121) }), 'paperLabel'],
		['entries not a list', body({ entries: 'no' }), 'entries'],
		['no entries', body(entries()), 'entries'],
		[
			'201 entries',
			body(entries(...Array.from({ length: 201 }, (_, i) => entry(`Q${i}`, 1, 1)))),
			'entries'
		],
		['non-object entry', body({ entries: ['x'] }), 'entries[0]'],
		[
			'unknown entry key',
			body(entries(entry('1', 1, 1, { studentId: 'a' }))),
			'entries[0].studentId'
		],
		['empty label', body(entries(entry('', 1, 1))), 'entries[0].label'],
		['blank label', body(entries(entry('  ', 1, 1))), 'entries[0].label'],
		['label over 120', body(entries(entry('x'.repeat(121), 1, 1))), 'entries[0].label'],
		['duplicate label', body(entries(entry('1', 1, 1), entry('1', 1, 1))), 'entries[1].label'],
		['non-string summary', body(entries(entry('1', 1, 1, { summary: 3 }))), 'entries[0].summary'],
		[
			'summary over 300',
			body(entries(entry('1', 1, 1, { summary: 'x'.repeat(301) }))),
			'entries[0].summary'
		],
		[
			'missing commandWord',
			body(entries(entry('1', 1, 1, { commandWord: undefined }))),
			'entries[0].commandWord'
		],
		[
			'non-string commandWord',
			body(entries(entry('1', 1, 1, { commandWord: 4 }))),
			'entries[0].commandWord'
		],
		['bad AO', body(entries(entry('1', 1, 1, { ao: 'AO9' }))), 'entries[0].ao'],
		['non-string AO', body(entries(entry('1', 1, 1, { ao: 1 }))), 'entries[0].ao'],
		['topics not a list', body(entries(entry('1', 1, 1, { topics: 'a' }))), 'entries[0].topics'],
		[
			'blank topic',
			body(entries(entry('1', 1, 1, { topics: ['ok', ' '] }))),
			'entries[0].topics[1]'
		],
		[
			'topic over 120',
			body(entries(entry('1', 1, 1, { topics: ['x'.repeat(121)] }))),
			'entries[0].topics[0]'
		],
		[
			'11 topics',
			body(entries(entry('1', 1, 1, { topics: Array.from({ length: 11 }, (_, i) => `T${i}`) }))),
			'entries[0].topics'
		],
		['zero available', body(entries(entry('1', 0, 0))), 'entries[0].available'],
		['negative available', body(entries(entry('1', 0, -1))), 'entries[0].available'],
		[
			'non-finite available',
			body(entries(entry('1', 0, 1, { available: null }))),
			'entries[0].available'
		],
		['string gained', body(entries(entry('1', 1, 2, { gained: '1' }))), 'entries[0].gained'],
		['negative gained', body(entries(entry('1', -1, 2))), 'entries[0].gained'],
		['gained over available', body(entries(entry('1', 2.5, 2))), 'entries[0].gained']
	];

	it.each(cases)('rejects %s with 400 and its field path', async (_name, payload, field) => {
		const { status, json } = await post(payload);

		expect(status).toBe(400);
		expect(json.error?.code).toBe('INVALID_REPORT_INPUT');
		expect(json.error?.retryable).toBe(false);
		expect(json.error?.field).toBe(field);
		expect(calls).toHaveLength(0);
	});

	it('rejects non-JSON with 400 and an empty field', async () => {
		const { status, json } = await post('not json {');

		expect(status).toBe(400);
		expect(json.error?.code).toBe('INVALID_REPORT_INPUT');
		expect(json.error?.field).toBe('');
		expect(calls).toHaveLength(0);
	});

	it('rejects a non-object body', async () => {
		const { status, json } = await post('[1]');

		expect(status).toBe(400);
		expect(json.error?.code).toBe('INVALID_REPORT_INPUT');
		expect(calls).toHaveLength(0);
	});

	it('rejects bodies over 256 KB with 413', async () => {
		const { status, json } = await post(
			JSON.stringify({ paperLabel: 'x'.repeat(REPORT_MAX_BODY_BYTES) })
		);

		expect(status).toBe(413);
		expect(json.error?.code).toBe('INVALID_REPORT_INPUT');
		expect(json.error?.retryable).toBe(false);
		expect(json.error?.field).toBe('');
		expect(calls).toHaveLength(0);
	});
});

describe('POST /api/report feedback checks', () => {
	const cases: [string, unknown, string][] = [
		['wrong shape', { strengths: 'x' }, 'shape'],
		[
			'too many strengths',
			{
				strengths: [theme('a', '1'), theme('b', '1'), theme('c', '1'), theme('d', '1')],
				areasForImprovement: [theme('e', '2')]
			},
			'strength-cap'
		],
		[
			'too many areas',
			{
				strengths: [theme('a', '1')],
				areasForImprovement: [theme('e', '2'), theme('f', '3'), theme('g', '4')]
			},
			'area-cap'
		],
		[
			'no area although marks were dropped',
			{ strengths: [theme('a', '1')], areasForImprovement: [] },
			'areas-required'
		],
		[
			'theme citing nothing',
			{ strengths: [theme('a')], areasForImprovement: [theme('e', '2')] },
			'cited-question'
		],
		[
			'unknown label',
			{ strengths: [theme('a', '99')], areasForImprovement: [theme('e', '2')] },
			'known-label'
		],
		[
			'red-band strength',
			{ strengths: [theme('a', '2')], areasForImprovement: [theme('e', '4')] },
			'no-red-strength'
		],
		[
			'full-marks area',
			{ strengths: [theme('a', '3')], areasForImprovement: [theme('e', '1')] },
			'no-full-marks-area'
		],
		[
			'question in both sections',
			{ strengths: [theme('a', '3')], areasForImprovement: [theme('e', '3', '2')] },
			'no-shared-question'
		],
		[
			'digits in prose',
			{ strengths: [theme('Scored 3 marks', '1')], areasForImprovement: [theme('e', '2')] },
			'no-figures'
		],
		[
			'contact details in prose',
			{
				strengths: [theme('Email me at home', '1')],
				areasForImprovement: [theme('see www.example.org', '2')]
			},
			'no-contact'
		]
	];

	it.each(cases)('rejects %s as INVALID_MODEL_OUTPUT', async (_name, output, id) => {
		stubModel(output);

		const { status, json } = await post(body());

		expect(status).toBe(502);
		expect(json.error?.code).toBe('INVALID_MODEL_OUTPUT');
		expect(json.error?.retryable).toBe(true);
		expect(json.error?.checks?.map((check) => check.id)).toContain(id);
		expect(json.strengths).toBeUndefined();
		expect(calls).toHaveLength(1);
	});

	it('rejects unparseable model content as a shape failure', async () => {
		stubModel(null, 'sorry, I cannot do that');

		const { status, json } = await post(body());

		expect(status).toBe(502);
		expect(json.error?.code).toBe('INVALID_MODEL_OUTPUT');
		expect(json.error?.retryable).toBe(true);
		expect(json.error?.checks?.[0]?.id).toBe('shape');
		expect(calls).toHaveLength(1);
	});
});

describe('POST /api/report upstream failures', () => {
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
