// Contract tests for `POST /api/parse` — the single Phase 1 seam (#7).
//
// These assert externally observable behaviour only (request shape in,
// `{ breakdown, specRef, warnings, usage }` / status-code mapping out).
// They use the stubbed model transport (#8) plus a mocked exam-specification
// fetch (#10): real ingestion (#9) and the live model call (#11) must keep
// them green.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST } from './+server';
import { MAX_FILE_BYTES, MAX_TOTAL_PAGES } from '$lib/server/parse/schema';
import { isBreakdown } from '$lib/server/parse/validate';
import { DIAGRAM_UNVERIFIED_CODE } from '$lib/server/parse/pdf';
import {
	clearSpecCache,
	resetSpecFetchTransport,
	setSpecFetchTransport,
	specCacheKeys,
	specCacheSize
} from '$lib/server/parse/spec';
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

function buildPdfBytes(pages: string[]): Uint8Array {
	const enc = new TextEncoder();
	let out = '%PDF-1.4\n';
	const offsets: number[] = [0];
	const count = pages.length;
	const pageIds: number[] = [];
	const contentIds: number[] = [];
	for (let i = 0; i < count; i++) {
		pageIds.push(3 + i * 2);
		contentIds.push(4 + i * 2);
	}
	const fontId = 3 + count * 2;
	const objects: string[] = [];
	objects.push('1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n');
	objects.push(
		`2 0 obj<</Type/Pages/Kids[${pageIds.map((id) => `${id} 0 R`).join(' ')}]/Count ${count}>>endobj\n`
	);
	for (let i = 0; i < count; i++) {
		objects.push(
			`${pageIds[i]} 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents ${contentIds[i]} 0 R/Resources<</Font<</F1 ${fontId} 0 R>>>>>>endobj\n`
		);
		const safe = pages[i].replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
		const stream = `BT /F1 12 Tf 72 720 Td (${safe}) Tj ET`;
		objects.push(
			`${contentIds[i]} 0 obj<</Length ${enc.encode(stream).length}>>stream\n${stream}\nendstream\nendobj\n`
		);
	}
	objects.push(`${fontId} 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n`);
	for (const obj of objects) {
		offsets.push(enc.encode(out).length);
		out += obj;
	}
	const xrefPos = enc.encode(out).length;
	const total = fontId + 1;
	out += `xref\n0 ${total}\n0000000000 65535 f \n`;
	for (let i = 1; i < total; i++) {
		out += `${String(offsets[i] ?? 0).padStart(10, '0')} 00000 n \n`;
	}
	out += `trailer<</Size ${total}/Root 1 0 R>>\nstartxref\n${xrefPos}\n%%EOF`;
	return enc.encode(out);
}

function pdf(name: string, text = 'QLA extraction probe'): File {
	return new File([buildPdfBytes([text]) as unknown as BlobPart], name, {
		type: 'application/pdf'
	});
}

function pdfWithPages(name: string, pageCount: number, textPrefix = 'QLA page'): File {
	const pages = Array.from({ length: pageCount }, (_, i) => `${textPrefix} ${i + 1}`);
	return new File([buildPdfBytes(pages) as unknown as BlobPart], name, {
		type: 'application/pdf'
	});
}

// --- Exam specification fixture (issue #10) ---
//
// 119-code GCSE Physics 8463 v1.1 shape: the five stub codes the breakdown
// fixture uses, plus generated dotted codes to reach the reference size.
// Parsed by reusing the shared `parsePdfBytes` extraction — the test proves
// set-membership through the seam, not the parser internals.

const STUB_CODES = ['4.6.1.1', '4.6.2.2', '4.6.3.1', '4.6.1.2', '4.1.1.1'];

function buildSpecCodes119(): string[] {
	const codes = new Set<string>(STUB_CODES);
	outer: for (let topic = 1; topic <= 8; topic++) {
		for (let sub = 1; sub <= 5; sub++) {
			for (let point = 1; point <= 4; point++) {
				codes.add(`4.${topic}.${sub}.${point}`);
				if (codes.size >= 119) break outer;
			}
		}
	}
	return [...codes].slice(0, 119);
}

const SPEC_CODES_119 = buildSpecCodes119();

function specPdfBytes(codes: string[] = SPEC_CODES_119, version = '1.1'): Uint8Array {
	const header = `GCSE Physics Specification Version ${version} 30 September 2019`;
	// The minimal-PDF builder places one `Tj` per page: keep each stream short
	// so `unpdf` extraction stays complete. Header on its own page, then two
	// codes per page — mirrors the real multi-page spec shape.
	const perPage = 2;
	const pages: string[] = [header];
	for (let i = 0; i < codes.length; i += perPage) {
		const chunk = codes.slice(i, i + perPage);
		const body = chunk
			.map((code, index) => {
				const globalIndex = i + index;
				const flag =
					globalIndex % 3 === 0 ? ' (HT only)' : globalIndex % 5 === 0 ? ' physics only' : '';
				return `Section ${code} Content ${code}${flag}`;
			})
			.join(' ');
		pages.push(body);
	}
	return buildPdfBytes(pages);
}

function specPdfResponse(
	codes: string[] = SPEC_CODES_119,
	version = '1.1',
	etag = 'spec-etag-1'
): Response {
	return new Response(specPdfBytes(codes, version) as unknown as BodyInit, {
		status: 200,
		headers: { 'content-type': 'application/pdf', etag }
	});
}

/** Default spec mock: 119-code v1.1 catalogue, cacheable under `spec-etag-1`. */
function mockDefaultSpec(): void {
	setSpecFetchTransport(async () => specPdfResponse());
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
		clearSpecCache();
		mockDefaultSpec();
	});

	afterEach(() => {
		if (savedKey === undefined) {
			delete process.env.OPENROUTER_API_KEY;
		} else {
			process.env.OPENROUTER_API_KEY = savedKey;
		}
		resetModelTransport();
		resetSpecFetchTransport();
		clearSpecCache();
	});

	it('happy path returns schema-valid breakdown with pinned specRef and usage', async () => {
		expect.assertions(14);
		const { status, body } = await post(validForm());

		expect(status).toBe(200);
		expect(body.warnings).toEqual([]);
		expect(isBreakdown(body.breakdown)).toBe(true);
		expect(body.breakdown?.paperId).toBe('STUB-PAPER-1');
		expect(body.breakdown?.paperTitle).toBe('Stub assessment paper');
		expect(body.breakdown?.year).toBe(2023);
		expect(body.breakdown?.totalMarks).toBe(9);
		expect(body.specRef).toMatchObject({ board: 'AQA', specCode: '8463', tier: 'H' });
		expect(body.specRef?.version).toBe('1.1');
		expect(body.specRef?.urlHash).toMatch(/^[0-9a-f]{12}$/);
		expect(body.breakdown?.specRef).toEqual(body.specRef);
		expect(body.usage?.totalTokens).toBeDefined();
		expect(body.usage?.estCost).toBeDefined();
		expect(specCacheSize()).toBe(1);
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
		// Size is checked before parsing, so the payload need not be a valid PDF.
		form.set(
			'assessmentPaper',
			new File([new Uint8Array(MAX_FILE_BYTES + 1)], 'big.pdf', { type: 'application/pdf' })
		);

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

	it('real-PDF happy path forwards hybrid dual-input to the model', async () => {
		expect.assertions(10);
		let seen: ModelInput | undefined;
		setModelTransport(async (input) => {
			seen = input;
			return stubResultWith(stubBreakdown());
		});

		const form = validForm();
		form.set('assessmentPaper', pdf('paper.pdf', 'Transverse wave oscillation Figure 3'));
		form.set('markscheme', pdf('markscheme.pdf', 'Emboldening underlining marking table'));
		const { status, body } = await post(form);

		expect(status).toBe(200);
		expect(body.warnings).toEqual([]);
		expect(seen?.useNativePdf).toBe(true);
		expect(seen?.modelId).toMatch(/gemini/i);
		expect(seen?.paper.pageCount).toBe(1);
		expect(seen?.markscheme.pageCount).toBe(1);
		expect(seen?.paper.text).toContain('[p.1]');
		expect(seen?.paper.text).toContain('Transverse wave oscillation');
		expect(seen?.markscheme.text).toContain('Emboldening underlining');
		expect(seen?.paper.pdfBase64.length).toBeGreaterThan(100);
	});

	it('total page ceiling fails fatal with 413 before any model call', async () => {
		expect.assertions(4);
		let calls = 0;
		setModelTransport(async () => {
			calls += 1;
			return stubResultWith(stubBreakdown());
		});
		const over = Math.ceil((MAX_TOTAL_PAGES + 1) / 2);
		const form = validForm();
		form.set('assessmentPaper', pdfWithPages('paper.pdf', over));
		form.set('markscheme', pdfWithPages('markscheme.pdf', over));

		const { status, body } = await post(form);

		expect(status).toBe(413);
		expect(body.error?.code).toBe('FILE_TOO_BIG');
		expect(calls).toBe(0);
		expect((body.error as unknown as { totalPages?: number })?.totalPages).toBeGreaterThan(
			MAX_TOTAL_PAGES
		);
	});

	it('override without native support degrades to text-only with a warning', async () => {
		expect.assertions(5);
		let seen: ModelInput | undefined;
		setModelTransport(async (input) => {
			seen = input;
			return stubResultWith(stubBreakdown());
		});

		const form = validForm();
		form.append('modelOverride', 'openai/text-only-model');
		const { status, body } = await post(form);

		expect(status).toBe(200);
		expect(body.breakdown?.paperId).toBe('STUB-PAPER-1');
		expect(seen?.useNativePdf).toBe(false);
		expect(seen?.modelId).toBe('openai/text-only-model');
		expect(body.warnings?.some((w) => w.code === DIAGRAM_UNVERIFIED_CODE)).toBe(true);
	});

	it('unreadable PDFs fail fatal with 400 before any model call', async () => {
		expect.assertions(3);
		let calls = 0;
		setModelTransport(async () => {
			calls += 1;
			return stubResultWith(stubBreakdown());
		});
		const form = validForm();
		form.set(
			'assessmentPaper',
			new File(['not a pdf at all'], 'paper.pdf', { type: 'application/pdf' })
		);

		const { status, body } = await post(form);

		expect(status).toBe(400);
		expect(body.error?.code).toBe('PDF_UNREADABLE');
		expect(calls).toBe(0);
	});

	it('cache hit reuses the pinned catalogue without re-parsing (304 refresh)', async () => {
		expect.assertions(7);
		const seenHeaders: Array<string | null> = [];
		let fetches = 0;
		setSpecFetchTransport(async (_url, init) => {
			fetches += 1;
			const headers = new Headers(init?.headers as HeadersInit | undefined);
			seenHeaders.push(headers.get('If-None-Match'));
			if (fetches === 1) return specPdfResponse(SPEC_CODES_119, '1.1', 'spec-etag-1');
			return new Response(null, { status: 304 });
		});

		const first = await post(validForm());
		const second = await post(validForm());

		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		expect(fetches).toBe(2);
		expect(seenHeaders[1]).toBe('spec-etag-1');
		expect(second.body.specRef).toEqual(first.body.specRef);
		expect(second.body.warnings).toEqual([]);
		expect(specCacheSize()).toBe(1);
	});

	it('a new spec URL yields a new cache entry with its own urlHash', async () => {
		expect.assertions(5);
		const first = await post(validForm());

		const secondForm = validForm();
		secondForm.set('specUrl', 'https://example.invalid/spec-revised.pdf');
		const second = await post(secondForm);

		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		expect(specCacheSize()).toBe(2);
		expect(second.body.specRef?.urlHash).not.toBe(first.body.specRef?.urlHash);
		expect(specCacheKeys().filter((key) => key.startsWith('spec:AQA:8463:H:'))).toHaveLength(2);
	});

	it('a spec revision becomes a new cache entry, never an overwrite', async () => {
		expect.assertions(5);
		setSpecFetchTransport(async (_url, init) => {
			const headers = new Headers(init?.headers as HeadersInit | undefined);
			if (headers.get('If-None-Match') === 'spec-etag-1') {
				return new Response(specPdfBytes(SPEC_CODES_119, '1.2') as unknown as BodyInit, {
					status: 200,
					headers: { 'content-type': 'application/pdf', etag: 'spec-etag-2' }
				});
			}
			return specPdfResponse(SPEC_CODES_119, '1.1', 'spec-etag-1');
		});

		const first = await post(validForm());
		const second = await post(validForm());

		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		expect(first.body.specRef?.version).toBe('1.1');
		expect(second.body.specRef?.version).toBe('1.2');
		expect(specCacheSize()).toBe(2);
	});

	it('spec-fetch failure returns 502 retryable before any model call', async () => {
		expect.assertions(4);
		let calls = 0;
		setModelTransport(async () => {
			calls += 1;
			return stubResultWith(stubBreakdown());
		});
		setSpecFetchTransport(async () => new Response('not found', { status: 404 }));

		const { status, body } = await post(validForm());

		expect(status).toBe(502);
		expect(body.error?.code).toBe('SPEC_FETCH_ERROR');
		expect((body.error as unknown as { retryable?: boolean })?.retryable).toBe(true);
		expect(calls).toBe(0);
	});

	it('non-PDF spec content-type returns 502 retryable', async () => {
		expect.assertions(2);
		setSpecFetchTransport(
			async () =>
				new Response('<html>not a pdf</html>', {
					status: 200,
					headers: { 'content-type': 'text/html' }
				})
		);

		const { status, body } = await post(validForm());

		expect(status).toBe(502);
		expect(body.error?.code).toBe('SPEC_FETCH_ERROR');
	});
});
