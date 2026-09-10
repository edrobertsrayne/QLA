// Contract tests for `POST /api/parse` — the v1 prototype seam.
//
// Externally observable behaviour only: multipart in (paper and/or
// markscheme, optional specification link), `{ breakdown: { questions },
// warnings, usage }` out. Uses the stubbed model transport; the spec fetch
// is mocked via `setSpecFetch` — no network, no spec validation of
// `specPoint` (verbatim lift rule unchanged).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST } from './+server';
import { MAX_TOTAL_PAGES, SPEC_URL_FIELD, type Breakdown } from '$lib/server/parse/schema';
import { isBreakdown, validateBreakdown } from '$lib/server/parse/validate';
import {
	DIAGRAM_UNVERIFIED_CODE,
	buildHybridPayload,
	buildPromptText
} from '$lib/server/parse/pdf';
import {
	MODEL_RETRYABLE_CODE,
	ModelRetryableError,
	setModelTransport,
	resetModelTransport,
	setStubTransport,
	stubBreakdown,
	stubUsage,
	type ModelInput,
	type ModelResult
} from '$lib/server/parse/model';
import { clearApiKeyForTests, setApiKeyForTests } from '$lib/server/parse/env';
import { resetSpecFetch, setSpecFetch } from '$lib/server/parse/spec';

const API_KEY = 'test-key';

interface SeamWarning {
	code?: string;
	questionId?: string | null;
	message?: string;
}

interface SeamBody {
	breakdown?: {
		questions?: Array<Record<string, unknown>>;
	};
	warnings?: SeamWarning[];
	usage?: {
		totalTokens?: number;
		estCost?: number;
	};
	error?: {
		code?: string;
		message?: string;
		retryable?: boolean;
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

function paperOnlyForm(): FormData {
	const form = new FormData();
	form.append('assessmentPaper', pdf('paper.pdf'));
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
		id: '1a',
		marks: 2,
		summary: 'Transverse wave oscillation direction',
		specPoint: '4.6.1.1',
		commandWord: 'Complete',
		ao: 'AO1',
		...overrides
	};
}

describe('POST /api/parse v1 prototype (stubbed model)', () => {
	beforeEach(() => {
		setApiKeyForTests(API_KEY);
		setStubTransport();
	});

	afterEach(() => {
		clearApiKeyForTests();
		resetModelTransport();
		resetSpecFetch();
	});

	it('happy path returns the stub breakdown with no warnings', async () => {
		const { status, body } = await post(paperOnlyForm());

		expect(status).toBe(200);
		expect(body.warnings).toEqual([]);
		expect(isBreakdown(body.breakdown)).toBe(true);
		expect(body.breakdown?.questions).toHaveLength(3);
		expect(body.usage?.totalTokens).toBeDefined();
	});

	it('accepts paper-only input', async () => {
		let seen: ModelInput | undefined;
		setModelTransport(async (input) => {
			seen = input;
			return stubResultWith(stubBreakdown());
		});

		const { status } = await post(paperOnlyForm());

		expect(status).toBe(200);
		expect(seen?.paper?.pageCount).toBe(1);
		expect(seen?.markscheme).toBeUndefined();
	});

	it('accepts markscheme-only input', async () => {
		let seen: ModelInput | undefined;
		setModelTransport(async (input) => {
			seen = input;
			return stubResultWith(stubBreakdown());
		});

		const form = new FormData();
		form.append('markscheme', pdf('markscheme.pdf'));
		const { status } = await post(form);

		expect(status).toBe(200);
		expect(seen?.paper).toBeUndefined();
		expect(seen?.markscheme?.pageCount).toBe(1);
	});

	it('accepts both inputs and forwards both documents', async () => {
		let seen: ModelInput | undefined;
		setModelTransport(async (input) => {
			seen = input;
			return stubResultWith(stubBreakdown());
		});

		const form = new FormData();
		form.set('assessmentPaper', pdf('paper.pdf', 'Transverse wave oscillation Figure 3'));
		form.set('markscheme', pdf('markscheme.pdf', 'Emboldening underlining marking table'));
		const { status, body } = await post(form);

		expect(status).toBe(200);
		expect(body.warnings).toEqual([]);
		expect(seen?.paper?.text).toContain('Transverse wave oscillation');
		expect(seen?.markscheme?.text).toContain('Emboldening underlining');
	});

	it('rejects empty input with 400 before any model call', async () => {
		let calls = 0;
		setModelTransport(async () => {
			calls += 1;
			return stubResultWith(stubBreakdown());
		});

		const { status, body } = await post(new FormData());

		expect(status).toBe(400);
		expect(body.error?.code).toBe('MISSING_INPUT');
		expect(calls).toBe(0);
	});

	it('rejects non-PDF files with 400', async () => {
		const form = new FormData();
		form.append('assessmentPaper', new File(['hello'], 'paper.txt', { type: 'text/plain' }));

		const { status, body } = await post(form);

		expect(status).toBe(400);
		expect(body.error?.code).toBe('INVALID_FILE_TYPE');
	});

	it('missing API key fails with 500 before any model call', async () => {
		let calls = 0;
		setModelTransport(async () => {
			calls += 1;
			return stubResultWith(stubBreakdown());
		});
		setApiKeyForTests('');

		const { status, body } = await post(paperOnlyForm());

		expect(status).toBe(500);
		expect(body.error?.code).toBe('MISSING_API_KEY');
		expect(calls).toBe(0);
	});

	it('unparseable model output retries once then fails with 500', async () => {
		let calls = 0;
		setModelTransport(async () => {
			calls += 1;
			return { rawJson: 'not-json{{{', usage: stubUsage() };
		});

		const { status, body } = await post(paperOnlyForm());

		expect(status).toBe(500);
		expect(body.error?.code).toBe('MALFORMED_MODEL_OUTPUT');
		expect(calls).toBe(2);
	});

	it('retryable transport errors map to 502', async () => {
		setModelTransport(async () => {
			throw new ModelRetryableError('busy');
		});

		const { status, body } = await post(paperOnlyForm());

		expect(status).toBe(502);
		expect(body.error?.code).toBe(MODEL_RETRYABLE_CODE);
	});

	it('total page ceiling fails with 413 before any model call', async () => {
		let calls = 0;
		setModelTransport(async () => {
			calls += 1;
			return stubResultWith(stubBreakdown());
		});
		const over = Math.ceil((MAX_TOTAL_PAGES + 1) / 2);
		const form = new FormData();
		form.set('assessmentPaper', pdfWithPages('paper.pdf', over));
		form.set('markscheme', pdfWithPages('markscheme.pdf', over));

		const { status, body } = await post(form);

		expect(status).toBe(413);
		expect(body.error?.code).toBe('FILE_TOO_BIG');
		expect(calls).toBe(0);
	});

	it('override without native support degrades to text-only with a warning', async () => {
		let seen: ModelInput | undefined;
		setModelTransport(async (input) => {
			seen = input;
			return stubResultWith(stubBreakdown());
		});

		const form = paperOnlyForm();
		form.append('modelOverride', 'openai/text-only-model');
		const { status, body } = await post(form);

		expect(status).toBe(200);
		expect(seen?.useNativePdf).toBe(false);
		expect(body.warnings?.some((w) => w.code === DIAGRAM_UNVERIFIED_CODE)).toBe(true);
	});

	it('unreadable PDFs fail with 400 before any model call', async () => {
		let calls = 0;
		setModelTransport(async () => {
			calls += 1;
			return stubResultWith(stubBreakdown());
		});
		const form = new FormData();
		form.set(
			'assessmentPaper',
			new File(['not a pdf at all'], 'paper.pdf', { type: 'application/pdf' })
		);

		const { status, body } = await post(form);

		expect(status).toBe(400);
		expect(body.error?.code).toBe('PDF_UNREADABLE');
		expect(calls).toBe(0);
	});

	it('validator warns on duplicate ids but returns the breakdown intact', async () => {
		setModelTransport(async () =>
			stubResultWith({
				questions: [question({ id: '1a', marks: 1 }), question({ id: '1a', marks: 1 })]
			})
		);

		const { status, body } = await post(paperOnlyForm());

		expect(status).toBe(200);
		expect(body.breakdown?.questions).toHaveLength(2);
		expect(body.warnings?.some((w) => w.code === 'DUPLICATE_ID')).toBe(true);
	});

	it('omitted spec link behaves exactly as before', async () => {
		let seen: ModelInput | undefined;
		setModelTransport(async (input) => {
			seen = input;
			return stubResultWith(stubBreakdown());
		});

		const { status, body } = await post(paperOnlyForm());

		expect(status).toBe(200);
		expect(body.warnings).toEqual([]);
		expect(seen?.spec).toBeUndefined();
	});

	it('malformed spec link fails with 400 before any model call', async () => {
		let calls = 0;
		setModelTransport(async () => {
			calls += 1;
			return stubResultWith(stubBreakdown());
		});

		const form = paperOnlyForm();
		form.append(SPEC_URL_FIELD, 'not a url at all');
		const { status, body } = await post(form);

		expect(status).toBe(400);
		expect(body.error?.code).toBe('INVALID_SPEC_URL');
		expect(calls).toBe(0);
	});

	it('non-http spec link fails with 400 before any model call', async () => {
		let calls = 0;
		setModelTransport(async () => {
			calls += 1;
			return stubResultWith(stubBreakdown());
		});

		const form = paperOnlyForm();
		form.append(SPEC_URL_FIELD, 'ftp://example.com/spec.pdf');
		const { status, body } = await post(form);

		expect(status).toBe(400);
		expect(body.error?.code).toBe('INVALID_SPEC_URL');
		expect(calls).toBe(0);
	});

	it('unreachable spec link fails with 400 before any model call', async () => {
		let calls = 0;
		setModelTransport(async () => {
			calls += 1;
			return stubResultWith(stubBreakdown());
		});
		setSpecFetch(async () => {
			throw new Error('socket hang up');
		});

		const form = paperOnlyForm();
		form.append(SPEC_URL_FIELD, 'https://example.com/spec.pdf');
		const { status, body } = await post(form);

		expect(status).toBe(400);
		expect(body.error?.code).toBe('SPEC_UNREADABLE');
		expect(calls).toBe(0);
	});

	it('spec link with error status fails with 400 before any model call', async () => {
		let calls = 0;
		setModelTransport(async () => {
			calls += 1;
			return stubResultWith(stubBreakdown());
		});
		setSpecFetch(async () => new Response('gone', { status: 404 }));

		const form = paperOnlyForm();
		form.append(SPEC_URL_FIELD, 'https://example.com/spec.pdf');
		const { status, body } = await post(form);

		expect(status).toBe(400);
		expect(body.error?.code).toBe('SPEC_UNREADABLE');
		expect(calls).toBe(0);
	});

	it('spec link to a non-PDF fails with 400 before any model call', async () => {
		let calls = 0;
		setModelTransport(async () => {
			calls += 1;
			return stubResultWith(stubBreakdown());
		});
		setSpecFetch(
			async () =>
				new Response('<html>not a pdf</html>', {
					status: 200,
					headers: { 'content-type': 'text/html' }
				})
		);

		const form = paperOnlyForm();
		form.append(SPEC_URL_FIELD, 'https://example.com/spec');
		const { status, body } = await post(form);

		expect(status).toBe(400);
		expect(body.error?.code).toBe('SPEC_UNREADABLE');
		expect(calls).toBe(0);
	});

	it('valid spec PDF is forwarded to the model as extra grounding', async () => {
		let seen: ModelInput | undefined;
		setModelTransport(async (input) => {
			seen = input;
			return stubResultWith(stubBreakdown());
		});
		setSpecFetch(
			async () =>
				new Response(buildPdfBytes(['Specification topic code 4.6.1']) as unknown as BodyInit, {
					status: 200
				})
		);

		const form = paperOnlyForm();
		form.append(SPEC_URL_FIELD, 'https://example.com/spec.pdf');
		const { status, body } = await post(form);

		expect(status).toBe(200);
		expect(body.warnings).toEqual([]);
		expect(seen?.spec?.pageCount).toBe(1);
		expect(seen?.spec?.text).toContain('Specification topic code');
	});

	it('spec pages count toward the total page ceiling', async () => {
		let calls = 0;
		setModelTransport(async () => {
			calls += 1;
			return stubResultWith(stubBreakdown());
		});
		setSpecFetch(
			async () => new Response(buildPdfBytes(['spec page']) as unknown as BodyInit, { status: 200 })
		);

		const form = new FormData();
		form.set('assessmentPaper', pdfWithPages('paper.pdf', MAX_TOTAL_PAGES));
		form.append(SPEC_URL_FIELD, 'https://example.com/spec.pdf');
		const { status, body } = await post(form);

		expect(status).toBe(413);
		expect(body.error?.code).toBe('FILE_TOO_BIG');
		expect(calls).toBe(0);
	});
});

describe('validateBreakdown v1 rules', () => {
	it('accepts a minimal valid breakdown with zero warnings', () => {
		const breakdown: Breakdown = {
			questions: [
				{
					id: '2bii',
					marks: 4,
					summary: 'Balanced equation for combustion reaction',
					specPoint: '4.1.2.3',
					commandWord: 'Explain',
					ao: 'AO2'
				},
				{
					id: '3a',
					marks: null,
					summary: 'Internal test without published marks',
					specPoint: null,
					commandWord: null,
					ao: null
				}
			]
		};
		expect(validateBreakdown(breakdown)).toEqual([]);
	});

	it('warns on bad marks, summary length and bad AO', () => {
		const warnings = validateBreakdown({
			questions: [
				question({ marks: 0 }),
				question({ id: 'x2', summary: 'Too short' }),
				question({ id: 'x3', ao: 'AO9' }),
				question({ id: 'x4', specPoint: 42 })
			]
		});
		const codes = warnings.map((w) => w.code);
		expect(codes).toContain('INVALID_MARKS');
		expect(codes).toContain('SUMMARY_LENGTH');
		expect(codes).toContain('INVALID_AO');
		expect(codes).toContain('INVALID_FIELD');
	});

	it('warns on empty and duplicate ids', () => {
		const warnings = validateBreakdown({
			questions: [question({ id: '' }), question({ id: '1a' }), question({ id: '1a' })]
		});
		const codes = warnings.map((w) => w.code);
		expect(codes).toContain('EMPTY_ID');
		expect(codes).toContain('DUPLICATE_ID');
	});
});

describe('buildPromptText v1', () => {
	it('instructs the v1 shape with either-input handling', () => {
		const both = buildPromptText({
			paperText: 'paper',
			markschemeText: 'scheme',
			useNativePdf: true
		});
		expect(both).toContain('3-8 word');
		expect(both).toContain('NEVER infer');
		expect(both).toContain('AO1, AO2, AO3');
		expect(both).toContain('--- specification text ---');
		expect(both).toContain('(no specification provided)');

		const withSpec = buildPromptText({
			paperText: 'paper',
			markschemeText: 'scheme',
			specText: 'specification topic code',
			useNativePdf: true
		});
		expect(withSpec).toContain('specification topic code');
		expect(withSpec).toContain('extra grounding only');

		const paperOnly = buildPromptText({
			paperText: 'paper',
			markschemeText: null,
			useNativePdf: false
		});
		expect(paperOnly).toContain('(no markscheme provided)');

		const payload = buildHybridPayload({
			modelId: 'google/gemini-flash-1.5',
			useNativePdf: true,
			paperText: 'paper',
			markschemeText: null,
			paperFilename: 'paper.pdf',
			markschemeFilename: null,
			paperPdfBase64: 'AAA',
			markschemePdfBase64: null
		});
		expect(payload.plugins).toEqual([{ id: 'file-parser', pdf: { engine: 'native' } }]);

		const specPayload = buildHybridPayload({
			modelId: 'google/gemini-2.5-flash',
			useNativePdf: true,
			paperText: 'paper',
			markschemeText: null,
			specText: 'specification topic code',
			paperFilename: 'paper.pdf',
			markschemeFilename: null,
			specFilename: 'specification.pdf',
			paperPdfBase64: 'AAA',
			markschemePdfBase64: null,
			specPdfBase64: 'BBB'
		});
		const fileParts = (
			specPayload.messages[0] as { content: Array<{ type: string }> }
		).content.filter((part) => part.type === 'file');
		expect(fileParts).toHaveLength(2);
	});
});
