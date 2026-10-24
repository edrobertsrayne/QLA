// `POST /api/parse` — single stateless server proxy for the v1 prototype.
//
// Multipart in, `{ breakdown, warnings, usage }` out. Accepts an assessment
// paper and/or a markscheme PDF (at least one required), plus an optional
// exam specification URL fetched server-side per run (no cache). The live
// model (GPT-6 Luna default, per-run override) with max_tokens 4000, the
// shared OpenRouter transport's timeout, usage on every response, one silent
// retry on malformed JSON, and the shared status map for transport failures
// (401/402/408/429/5xx). Every failure body says explicitly whether it is
// retryable. Spec failures fail the run (400) before any model spend; the
// spec never changes the verbatim specPoint rule.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	ASSESSMENT_PAPER_FIELD,
	MARKSCHEME_FIELD,
	MODEL_ERROR_CODE,
	MODEL_OVERRIDE_FIELD,
	SPEC_URL_FIELD,
	INVALID_SPEC_URL_CODE,
	SPEC_UNREADABLE_CODE
} from '$lib/server/parse/schema';
import {
	applyAoDescriptionChecks,
	applyQuestionNumberFallback,
	applyTierNameCheck,
	validateBreakdown
} from '$lib/server/parse/validate';
import { callModel, type IngestedDocument } from '$lib/server/parse/model';
import { StructuredModelError } from '$lib/server/openrouter';
import { modelErrorResponse } from '$lib/server/structured-route';
import {
	buildDiagramUnverifiedWarning,
	parsePdfBytes,
	resolveModelId,
	supportsNativePdf
} from '$lib/server/parse/pdf';
import {
	FILE_TOO_BIG_CODE,
	INVALID_FILE_TYPE_CODE,
	MAX_FILE_BYTES,
	MAX_TOTAL_PAGES,
	PDF_UPLOAD_MESSAGES,
	PDF_UNREADABLE_CODE,
	checkPdfUploads,
	readPdfUploads,
	type PdfUploadFailure
} from '$lib/server/pdf-upload';
import {
	fetchSpecPdf,
	parseSpecUrl,
	SpecUnreadableError,
	SpecUrlError
} from '$lib/server/parse/spec';
import { getServerEnv } from '$lib/server/parse/env';

/** The only failures the client may retry; every other code fails the run. */
const RETRYABLE_CODES: Record<string, true> = {
	[MODEL_ERROR_CODE]: true,
	MALFORMED_MODEL_OUTPUT: true
};

function error(code: string, message: string, extra: Record<string, unknown> = {}): Response {
	return json(
		{ error: { code, message, ...extra, retryable: RETRYABLE_CODES[code] === true } },
		{ status: statusFor(code) }
	);
}

function statusFor(code: string): number {
	switch (code) {
		case 'MISSING_INPUT':
		case 'INVALID_FILE_TYPE':
		case 'PDF_UNREADABLE':
		case INVALID_SPEC_URL_CODE:
		case SPEC_UNREADABLE_CODE:
			return 400;
		case 'FILE_TOO_BIG':
			return 413;
		case 'MISSING_API_KEY':
		case 'MALFORMED_MODEL_OUTPUT':
			return 500;
		default:
			return 500;
	}
}

function uploadFailure(pdfFailure: PdfUploadFailure): Response {
	switch (pdfFailure.kind) {
		case 'missing':
			return error('MISSING_INPUT', 'Attach an assessment paper and/or its markscheme PDF.', {
				missing: pdfFailure.fields
			});
		case 'not-pdf':
			return error(INVALID_FILE_TYPE_CODE, PDF_UPLOAD_MESSAGES.notPdf);
		case 'too-big':
			return error(FILE_TOO_BIG_CODE, PDF_UPLOAD_MESSAGES.tooBig(pdfFailure.filename), {
				file: pdfFailure.filename,
				size: pdfFailure.size,
				limit: MAX_FILE_BYTES
			});
		case 'too-many-pages':
			return error(
				FILE_TOO_BIG_CODE,
				`The PDFs total ${pdfFailure.totalPages} pages, above the ${MAX_TOTAL_PAGES}-page ceiling. Split or compress them and try again.`,
				{ totalPages: pdfFailure.totalPages, limit: MAX_TOTAL_PAGES }
			);
		case 'unreadable':
			return error(PDF_UNREADABLE_CODE, PDF_UPLOAD_MESSAGES.unreadable);
	}
}

export const POST: RequestHandler = async ({ request }) => {
	if (!getServerEnv('OPENROUTER_API_KEY')) {
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

	const modelOverride = form.get(MODEL_OVERRIDE_FIELD);
	const specUrlRaw = form.get(SPEC_URL_FIELD);

	const checked = checkPdfUploads(form, [ASSESSMENT_PAPER_FIELD, MARKSCHEME_FIELD], 'any');
	if (!Array.isArray(checked)) return uploadFailure(checked);

	const override =
		typeof modelOverride === 'string' && modelOverride.trim() !== ''
			? modelOverride.trim()
			: undefined;
	const modelId = resolveModelId(override);
	// Custom ids outside the drop-down's native-PDF set degrade to text-only
	// with a visible warning (the route attaches `engine: 'native'` only via
	// `useNativePdf`, so there is no silent paid-OCR fallback).
	const useNativePdf = supportsNativePdf(modelId);

	// Bytes and page counts come from the shared intake, which refuses the page
	// ceiling before any text is extracted or the spec is fetched.
	const uploads = await readPdfUploads(checked);
	if (!Array.isArray(uploads)) return uploadFailure(uploads);

	let paperDoc: IngestedDocument | undefined;
	let markschemeDoc: IngestedDocument | undefined;
	let specDoc: IngestedDocument | undefined;
	for (const upload of uploads) {
		// pdf.js detaches the buffer it reads, so encode the native copy first.
		const pdfBase64 = useNativePdf ? Buffer.from(upload.bytes).toString('base64') : null;
		let parsed;
		try {
			parsed = await parsePdfBytes(upload.bytes);
		} catch {
			return error(PDF_UNREADABLE_CODE, PDF_UPLOAD_MESSAGES.unreadable);
		}
		const document: IngestedDocument = {
			filename: upload.filename,
			pageCount: upload.pageCount,
			text: parsed.textWithMarkers,
			pdfBase64
		};
		if (upload.field === ASSESSMENT_PAPER_FIELD) paperDoc = document;
		if (upload.field === MARKSCHEME_FIELD) markschemeDoc = document;
	}

	// Optional specification link: fetched fresh per run (no cache) and
	// verified as a readable PDF. Any failure fails the run before model spend.
	// The paper+markscheme page ceiling is checked first so an already-oversize
	// upload never pays for a spec download; the spec has its own byte and page
	// caps (`MAX_SPEC_BYTES`, `MAX_SPEC_PAGES`) enforced in `fetchSpecPdf`.
	const specUrlText =
		typeof specUrlRaw === 'string' && specUrlRaw.trim() !== '' ? specUrlRaw.trim() : undefined;
	if (specUrlText !== undefined) {
		let specUrl: URL;
		try {
			specUrl = parseSpecUrl(specUrlText);
		} catch (specError) {
			if (specError instanceof SpecUrlError) return error(specError.code, specError.message);
			return error(INVALID_SPEC_URL_CODE, 'The specification link is not a valid URL.');
		}
		try {
			specDoc = await fetchSpecPdf(specUrl, useNativePdf);
		} catch (specError) {
			if (specError instanceof SpecUnreadableError) return error(specError.code, specError.message);
			return error(SPEC_UNREADABLE_CODE, 'The specification could not be downloaded.');
		}
	}

	let rawJson: string | undefined;
	let usage;
	const modelBase = {
		modelOverride: override,
		modelId,
		useNativePdf,
		...(paperDoc ? { paper: paperDoc } : {}),
		...(markschemeDoc ? { markscheme: markschemeDoc } : {}),
		...(specDoc ? { spec: specDoc } : {})
	};
	for (let attempt = 1; attempt <= 2; attempt++) {
		let result;
		try {
			result = await callModel(modelBase);
		} catch (transportError) {
			if (transportError instanceof StructuredModelError) return modelErrorResponse(transportError);
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
	applyQuestionNumberFallback(parsed);
	applyAoDescriptionChecks(parsed, specDoc !== undefined);
	applyTierNameCheck(parsed);

	if (!useNativePdf) {
		warnings.push(buildDiagramUnverifiedWarning());
	}

	return json({ breakdown: parsed, warnings, usage }, { status: 200 });
};
