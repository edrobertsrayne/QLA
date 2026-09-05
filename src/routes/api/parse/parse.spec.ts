// Contract tests for `POST /api/parse` — the single Phase 1 seam (#7).
//
// These assert externally observable behaviour only (request shape in,
// `{ breakdown, specRef, warnings, usage }` / status-code mapping out).
// They use the stubbed model transport (#8): real ingestion (#9), the exam
// specification cache (#10) and the live model call (#11) must keep them green.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST } from './+server';
import { MAX_FILE_BYTES } from '$lib/server/parse/schema';
import { isBreakdown } from '$lib/server/parse/validate';
import {
	resetModelTransport,
	setModelTransport,
	stubBreakdown,
	stubUsage,
	type ModelInput,
	type ModelResult
} from '$lib/server/parse/model';

const API_KEY = 'test-key';

interface SeamWarning {
	code?: string;
	questionNumber?: string | null;
	message?: string;
}

interface SeamBody {
	breakdown?: {
		paperId?: string;
		paperTitle?: string;
		year?: number;
		totalMarks?: number;
		specRef?: unknown;
		questions?: Array<Record<string, unknown>>;
	};
	specRef?: {
		board?: string;
		specCode?: string;
		tier?: string;
		version?: string;
		urlHash?: string;
	};
	warnings?: SeamWarning[];
	usage?: {
		totalTokens?: number;
		estCost?: number;
	};
	error?: {
		code?: string;
		message?: string;
	};
}

function pdf(name: string, sizeBytes = 10): File {
	return new File([new Uint8Array(sizeBytes)], name, { type: 'application/pdf' });
}

function validForm(): FormData {
	const form = new FormData();
	form.append('assessmentPaper', pdf('paper.pdf'));
	form.append('markscheme', pdf('markscheme.pdf'));
	form.append('board', 'AQA');
	form.append('subject', '8463');
	form.append('tier', 'H');
	form.append('specUrl', 'https://example.invalid/spec.pdf');
	return form;
}

function stubResultWith(breakdown: unknown): ModelResult {
	return { rawJson: JSON.stringify(breakdown), usage: stubUsage() };
}

async function post(form: FormData): Promise<{ status: number; body: SeamBody }> {
	const request = new Request('http://localhost/api/parse', { method: 'POST', body: form });
	const response = await POST({ request } as unknown as Parameters<typeof POST>[0]);
	return { status: response.status, body: (await response.json()) as SeamBody };
}

function question(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		number: '01.1',
		marks: 2,
		specCodes: ['4.6.1.1'],
		questionText: 'Transverse wave oscillation direction',
		ao: ['AO1'],
		commandWord: 'Complete',
		isCalculation: false,
		isWorkingScientifically: false,
		...overrides
	};
}

function breakdownWith(questions: unknown[], totalMarks = 9): Record<string, unknown> {
	return {
		paperId: 'STUB-PAPER-1',
		paperTitle: 'Stub assessment paper',
		year: 2023,
		totalMarks,
		questions
	};
}

describe('POST /api/parse contract (skeleton, stubbed model)', () => {
	let savedKey: string | undefined;

	beforeEach(() => {
		savedKey = process.env.OPENROUTER_API_KEY;
		process.env.OPENROUTER_API_KEY = API_KEY;
		resetModelTransport();
	});

	afterEach(() => {
		if (savedKey === undefined) {
			delete process.env.OPENROUTER_API_KEY;
		} else {
			process.env.OPENROUTER_API_KEY = savedKey;
		}
		resetModelTransport();
	});

	it('happy path returns schema-valid breakdown with pinned specRef and usage', async () => {
		expect.assertions(13);
		const { status, body } = await post(validForm());

		expect(status).toBe(200);
		expect(body.warnings).toEqual([]);
		expect(isBreakdown(body.breakdown)).toBe(true);
		expect(body.breakdown?.paperId).toBe('STUB-PAPER-1');
		expect(body.breakdown?.paperTitle).toBe('Stub assessment paper');
		expect(body.breakdown?.year).toBe(2023);
		expect(body.breakdown?.totalMarks).toBe(9);
		expect(body.specRef).toMatchObject({ board: 'AQA', specCode: '8463', tier: 'H' });
		expect(body.specRef?.version).toBe('stub-v1');
		expect(body.specRef?.urlHash).toMatch(/^[0-9a-f]{12}$/);
		expect(body.breakdown?.specRef).toEqual(body.specRef);
		expect(body.usage?.totalTokens).toBeDefined();
		expect(body.usage?.estCost).toBeDefined();
	});

	it('honours an optional per-run modelOverride', async () => {
		expect.assertions(2);
		let seen: ModelInput | undefined;
		setModelTransport(async (input) => {
			seen = input;
			return stubResultWith(stubBreakdown());
		});

		const form = validForm();
		form.append('modelOverride', 'openrouter/my-model');
		const { status } = await post(form);

		expect(status).toBe(200);
		expect(seen?.modelOverride).toBe('openrouter/my-model');
	});

	it('unknown spec code warns per question with the breakdown intact', async () => {
		expect.assertions(4);
		setModelTransport(async () =>
			stubResultWith(breakdownWith([question({ specCodes: ['9.9.9.9'] })], 2))
		);

		const { status, body } = await post(validForm());

		expect(status).toBe(200);
		expect(body.breakdown?.questions?.[0]?.['specCodes']).toEqual(['9.9.9.9']);
		expect(body.warnings).toHaveLength(1);
		expect(body.warnings?.[0]).toMatchObject({
			questionNumber: '01.1',
			code: 'UNKNOWN_SPEC_CODE'
		});
	});

	it('duplicate question numbers warn instead of failing', async () => {
		expect.assertions(3);
		setModelTransport(async () =>
			stubResultWith(
				breakdownWith(
					[
						question({ number: '01.1', marks: 1 }),
						question({ number: '01.1', marks: 1, specCodes: ['4.6.2.2'] })
					],
					2
				)
			)
		);

		const { status, body } = await post(validForm());

		expect(status).toBe(200);
		expect(body.breakdown?.questions).toHaveLength(2);
		expect(body.warnings?.some((w) => w.code === 'DUPLICATE_NUMBER')).toBe(true);
	});

	it('empty question number warns instead of failing', async () => {
		expect.assertions(2);
		setModelTransport(async () => stubResultWith(breakdownWith([question({ number: '' })], 2)));

		const { status, body } = await post(validForm());

		expect(status).toBe(200);
		expect(body.warnings?.some((w) => w.code === 'EMPTY_NUMBER')).toBe(true);
	});

	it('non-positive marks warn instead of failing', async () => {
		expect.assertions(2);
		setModelTransport(async () => stubResultWith(breakdownWith([question({ marks: 0 })], 0)));

		const { status, body } = await post(validForm());

		expect(status).toBe(200);
		expect(body.warnings?.some((w) => w.code === 'INVALID_MARKS')).toBe(true);
	});

	it('empty AO warns instead of failing', async () => {
		expect.assertions(2);
		setModelTransport(async () => stubResultWith(breakdownWith([question({ ao: [] })], 2)));

		const { status, body } = await post(validForm());

		expect(status).toBe(200);
		expect(body.warnings?.some((w) => w.code === 'EMPTY_AO')).toBe(true);
	});

	it('malformed spec codes warn instead of failing', async () => {
		expect.assertions(2);
		setModelTransport(async () =>
			stubResultWith(breakdownWith([question({ specCodes: ['not-a-code'] })], 2))
		);

		const { status, body } = await post(validForm());

		expect(status).toBe(200);
		expect(body.warnings?.some((w) => w.code === 'MALFORMED_SPEC_CODE')).toBe(true);
	});

	it('empty spec codes warn instead of failing', async () => {
		expect.assertions(2);
		setModelTransport(async () => stubResultWith(breakdownWith([question({ specCodes: [] })], 2)));

		const { status, body } = await post(validForm());

		expect(status).toBe(200);
		expect(body.warnings?.some((w) => w.code === 'EMPTY_SPEC_CODES')).toBe(true);
	});

	it('totalMarks-vs-sum mismatch warns instead of failing', async () => {
		expect.assertions(3);
		setModelTransport(async () => stubResultWith(breakdownWith([question({ marks: 2 })], 100)));

		const { status, body } = await post(validForm());

		expect(status).toBe(200);
		expect(body.breakdown?.totalMarks).toBe(100);
		expect(body.warnings?.some((w) => w.code === 'TOTAL_MARKS_MISMATCH')).toBe(true);
	});

	it('missing PDFs are rejected before any model call', async () => {
		expect.assertions(3);
		let calls = 0;
		setModelTransport(async () => {
			calls += 1;
			return stubResultWith(stubBreakdown());
		});

		const form = validForm();
		form.delete('markscheme');
		const { status, body } = await post(form);

		expect(status).toBe(400);
		expect(body.error?.code).toBe('MISSING_INPUT');
		expect(calls).toBe(0);
	});

	it('missing board/specUrl are rejected before any model call', async () => {
		expect.assertions(3);
		let calls = 0;
		setModelTransport(async () => {
			calls += 1;
			return stubResultWith(stubBreakdown());
		});

		const form = validForm();
		form.delete('board');
		form.delete('specUrl');
		const { status, body } = await post(form);

		expect(status).toBe(400);
		expect(body.error?.code).toBe('MISSING_INPUT');
		expect(calls).toBe(0);
	});

	it('missing commandWord/flags warn instead of failing', async () => {
		expect.assertions(3);
		const bare = question();
		delete bare['commandWord'];
		delete bare['isCalculation'];
		setModelTransport(async () => stubResultWith(breakdownWith([bare], 2)));

		const { status, body } = await post(validForm());

		expect(status).toBe(200);
		expect(body.breakdown?.questions).toHaveLength(1);
		expect(body.warnings?.some((w) => w.code === 'INVALID_FIELD')).toBe(true);
	});

	it('non-PDF files are rejected before any model call', async () => {
		expect.assertions(3);
		let calls = 0;
		setModelTransport(async () => {
			calls += 1;
			return stubResultWith(stubBreakdown());
		});
		const form = validForm();
		form.set('assessmentPaper', new File(['x'], 'notes.txt', { type: 'text/plain' }));

		const { status, body } = await post(form);

		expect(status).toBe(400);
		expect(body.error?.code).toBe('INVALID_FILE_TYPE');
		expect(calls).toBe(0);
	});

	it('oversize files fail fatal with 413 before any model call', async () => {
		expect.assertions(3);
		let calls = 0;
		setModelTransport(async () => {
			calls += 1;
			return stubResultWith(stubBreakdown());
		});
		const form = validForm();
		form.set('assessmentPaper', pdf('big.pdf', MAX_FILE_BYTES + 1));

		const { status, body } = await post(form);

		expect(status).toBe(413);
		expect(body.error?.code).toBe('FILE_TOO_BIG');
		expect(calls).toBe(0);
	});

	it('missing API key fails fatal with 500 before any model call', async () => {
		expect.assertions(3);
		let calls = 0;
		setModelTransport(async () => {
			calls += 1;
			return stubResultWith(stubBreakdown());
		});
		delete process.env.OPENROUTER_API_KEY;

		const { status, body } = await post(validForm());

		expect(status).toBe(500);
		expect(body.error?.code).toBe('MISSING_API_KEY');
		expect(calls).toBe(0);
	});

	it('unparseable model output fails the run with 500', async () => {
		expect.assertions(2);
		setModelTransport(async () => ({ rawJson: 'not-json{{{', usage: stubUsage() }));

		const { status, body } = await post(validForm());

		expect(status).toBe(500);
		expect(body.error?.code).toBe('MALFORMED_MODEL_OUTPUT');
	});
});
