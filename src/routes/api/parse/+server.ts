// `POST /api/parse` — single stateless server proxy for the v1 prototype.
//
// Multipart in, `{ breakdown, warnings, usage }` out. Accepts an assessment
// paper and/or a markscheme PDF (at least one required). No exam
// specification input, no spec fetch/cache/validation. The live model call
// goes through the real configurable OpenRouter model (Gemini Flash default,
// per-run override) with max_tokens 4000, a 120s timeout, usage on every
// response, one silent retry on malformed JSON, and 429/5xx → 502 mapping.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	ASSESSMENT_PAPER_FIELD,
	MARKSCHEME_FIELD,
	MAX_FILE_BYTES,
	MAX_TOTAL_PAGES,
	MODEL_OVERRIDE_FIELD
} from '$lib/server/parse/schema';
import { validateBreakdown } from '$lib/server/parse/validate';
import {
	MODEL_ERROR_CODE,
	MODEL_RETRYABLE_CODE,
	ModelRetryableError,
	callModel,
	type IngestedDocument
} from '$lib/server/parse/model';
import {
	buildDiagramUnverifiedWarning,
	parsePdfBytes,
	resolveModelId,
	supportsNativePdf
} from '$lib/server/parse/pdf';
import { getApiKey } from '$lib/server/parse/env';

function error(code: string, message: string, extra: Record<string, unknown> = {}): Response {
	return json({ error: { code, message, ...extra } }, { status: statusFor(code) });
}

function statusFor(code: string): number {
	switch (code) {
		case 'MISSING_INPUT':
		case 'INVALID_FILE_TYPE':
		case 'PDF_UNREADABLE':
			return 400;
		case 'FILE_TOO_BIG':
			return 413;
		case MODEL_RETRYABLE_CODE:
			return 502;
		case 'MISSING_API_KEY':
		case 'MALFORMED_MODEL_OUTPUT':
		case 'MODEL_ERROR':
		case MODEL_ERROR_CODE:
			return 500;
		default:
			return 500;
	}
}

function isPdf(file: File): boolean {
	return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export const POST: RequestHandler = async ({ request }) => {
	if (!getApiKey()) {
		return error(
			'MISSING_API_KEY',
			'Server is missing its OpenRouter API key. The problem is server-side, not with your inputs.'
		);
	}

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return error('MISSING_INPUT', 'Expected a multipart form with at least one PDF.');
	}

	const paper = form.get(ASSESSMENT_PAPER_FIELD);
	const markscheme = form.get(MARKSCHEME_FIELD);
	const modelOverride = form.get(MODEL_OVERRIDE_FIELD);

	const hasPaper = paper instanceof File && paper.size > 0;
	const hasMarkscheme = markscheme instanceof File && markscheme.size > 0;
	if (!hasPaper && !hasMarkscheme) {
		return error('MISSING_INPUT', 'Attach an assessment paper and/or its markscheme PDF.', {
			missing: [ASSESSMENT_PAPER_FIELD, MARKSCHEME_FIELD]
		});
	}

	const paperFile = hasPaper ? (paper as File) : null;
	const markschemeFile = hasMarkscheme ? (markscheme as File) : null;

	for (const file of [paperFile, markschemeFile]) {
		if (!file) continue;
		if (!isPdf(file)) {
			return error('INVALID_FILE_TYPE', 'Assessment paper and markscheme must be PDF files.');
		}
		if (file.size > MAX_FILE_BYTES) {
			return error('FILE_TOO_BIG', `File '${file.name}' exceeds the 15MB per-file limit.`, {
				file: file.name,
				size: file.size,
				limit: MAX_FILE_BYTES
			});
		}
	}

	const override =
		typeof modelOverride === 'string' && modelOverride.trim() !== ''
			? modelOverride.trim()
			: undefined;
	const modelId = resolveModelId(override);
	const useNativePdf = supportsNativePdf(modelId);

	// Ingest whichever PDFs were provided: deterministic per-page text plus
	// the originals forwarded natively on supporting models. Caps enforced
	// before any model spend.
	async function ingest(file: File): Promise<{
		doc: IngestedDocument;
		pages: number;
	}> {
		let bytes: Uint8Array;
		try {
			bytes = new Uint8Array(await file.arrayBuffer());
		} catch {
			throw new Error('unreadable');
		}
		const base64 = Buffer.from(bytes).toString('base64');
		let parsed;
		try {
			parsed = await parsePdfBytes(bytes);
		} catch {
			throw new Error('unreadable');
		}
		return {
			doc: {
				filename: file.name,
				pageCount: parsed.pageCount,
				text: parsed.textWithMarkers,
				pdfBase64: base64
			},
			pages: parsed.pageCount
		};
	}

	let paperDoc: IngestedDocument | undefined;
	let markschemeDoc: IngestedDocument | undefined;
	let totalPages = 0;
	try {
		if (paperFile) {
			const ingested = await ingest(paperFile);
			paperDoc = ingested.doc;
			totalPages += ingested.pages;
		}
		if (markschemeFile) {
			const ingested = await ingest(markschemeFile);
			markschemeDoc = ingested.doc;
			totalPages += ingested.pages;
		}
	} catch {
		return error(
			'PDF_UNREADABLE',
			'The PDFs could not be read. Re-export them without password protection and try again.'
		);
	}

	if (totalPages > MAX_TOTAL_PAGES) {
		return error(
			'FILE_TOO_BIG',
			`The PDFs total ${totalPages} pages, above the ${MAX_TOTAL_PAGES}-page ceiling. Split or compress them and try again.`,
			{ totalPages, limit: MAX_TOTAL_PAGES }
		);
	}

	let rawJson: string | undefined;
	let usage;
	const modelBase = {
		modelOverride: override,
		modelId,
		useNativePdf,
		...(paperDoc ? { paper: paperDoc } : {}),
		...(markschemeDoc ? { markscheme: markschemeDoc } : {})
	};
	for (let attempt = 1; attempt <= 2; attempt++) {
		let result;
		try {
			result = await callModel(modelBase);
		} catch (transportError) {
			if (
				transportError instanceof ModelRetryableError ||
				(transportError !== null &&
					typeof transportError === 'object' &&
					(transportError as { retryable?: unknown }).retryable === true) ||
				(transportError !== null &&
					typeof transportError === 'object' &&
					(transportError as { code?: unknown }).code === MODEL_RETRYABLE_CODE)
			) {
				const status =
					transportError instanceof ModelRetryableError ? transportError.status : undefined;
				return error(
					MODEL_RETRYABLE_CODE,
					'The model provider is temporarily unavailable. Please try again.',
					{ retryable: true, ...(status !== undefined ? { status } : {}) }
				);
			}
			return error(MODEL_ERROR_CODE, 'The model call failed. Please try again.');
		}
		try {
			JSON.parse(result.rawJson);
			rawJson = result.rawJson;
			usage = result.usage;
			break;
		} catch {
			if (attempt === 2) {
				return error(
					'MALFORMED_MODEL_OUTPUT',
					'The model returned output that could not be parsed. Please try again.'
				);
			}
		}
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(rawJson as string);
	} catch {
		return error(
			'MALFORMED_MODEL_OUTPUT',
			'The model returned output that could not be parsed. Please try again.'
		);
	}

	// Warnings never block: the breakdown goes back intact with HTTP 200.
	const warnings = validateBreakdown(parsed);

	if (!useNativePdf) {
		warnings.push(buildDiagramUnverifiedWarning());
	}

	return json({ breakdown: parsed, warnings, usage }, { status: 200 });
};
