// `POST /api/parse` — single stateless server proxy for Phase 1 Parse (#7).
// Skeleton slice (#8): multipart in, `{ breakdown, specRef, warnings, usage }`
// out, with the model transport stubbed. Hybrid PDF ingestion (#9) plugs real
// per-page text extraction plus native PDF attach behind the same seam; the
// exam-specification fetch-parse-cache (#10) pins the catalogue version the
// breakdown is validated against. The live model call (#11) plugs in next
// without changing the contract.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	ASSESSMENT_PAPER_FIELD,
	BOARD_FIELD,
	MARKSCHEME_FIELD,
	MAX_FILE_BYTES,
	MAX_TOTAL_PAGES,
	MODEL_OVERRIDE_FIELD,
	SPEC_URL_FIELD,
	SUBJECT_FIELD,
	TIER_FIELD
} from '$lib/server/parse/schema';
import { validateBreakdown } from '$lib/server/parse/validate';
import { callModel } from '$lib/server/parse/model';
import {
	buildDiagramUnverifiedWarning,
	parsePdfBytes,
	resolveModelId,
	supportsNativePdf
} from '$lib/server/parse/pdf';
import {
	SPEC_FETCH_ERROR_CODE,
	getSpecCatalogue,
	specRefFor,
	type SpecCatalogueEntry
} from '$lib/server/parse/spec';

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
		case 'SPEC_FETCH_ERROR':
			return 502;
		case 'MISSING_API_KEY':
		case 'MALFORMED_MODEL_OUTPUT':
		case 'MODEL_ERROR':
			return 500;
		default:
			return 500;
	}
}

function isPdf(file: File): boolean {
	return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export const POST: RequestHandler = async ({ request }) => {
	// Fatal: server misconfiguration. Checked first — before any model call.
	if (!process.env.OPENROUTER_API_KEY) {
		return error(
			'MISSING_API_KEY',
			'Server is missing its OpenRouter API key. The problem is server-side, not with your inputs.'
		);
	}

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return error('MISSING_INPUT', 'Expected a multipart form with two PDFs and run fields.');
	}

	const paper = form.get(ASSESSMENT_PAPER_FIELD);
	const markscheme = form.get(MARKSCHEME_FIELD);
	const board = form.get(BOARD_FIELD);
	const subject = form.get(SUBJECT_FIELD);
	const tier = form.get(TIER_FIELD);
	const specUrl = form.get(SPEC_URL_FIELD);
	const modelOverride = form.get(MODEL_OVERRIDE_FIELD);

	// Missing inputs are rejected before any model call.
	const missing: string[] = [];
	if (!(paper instanceof File) || paper.size === 0) missing.push(ASSESSMENT_PAPER_FIELD);
	if (!(markscheme instanceof File) || markscheme.size === 0) missing.push(MARKSCHEME_FIELD);
	for (const [field, value] of [
		[BOARD_FIELD, board],
		[SUBJECT_FIELD, subject],
		[TIER_FIELD, tier],
		[SPEC_URL_FIELD, specUrl]
	] as const) {
		if (typeof value !== 'string' || value.trim() === '') missing.push(field);
	}
	if (missing.length > 0) {
		return error(
			'MISSING_INPUT',
			'Attach both PDFs and fill board, subject, tier and exam specification URL before running.',
			{
				missing
			}
		);
	}

	const paperFile = paper as File;
	const markschemeFile = markscheme as File;

	if (!isPdf(paperFile) || !isPdf(markschemeFile)) {
		return error(
			'INVALID_FILE_TYPE',
			'Both the assessment paper and the markscheme must be PDF files.'
		);
	}

	for (const file of [paperFile, markschemeFile]) {
		if (file.size > MAX_FILE_BYTES) {
			return error('FILE_TOO_BIG', `File '${file.name}' exceeds the 15MB per-file limit.`, {
				file: file.name,
				size: file.size,
				limit: MAX_FILE_BYTES
			});
		}
	}

	const boardValue = (board as string).trim();
	const subjectValue = (subject as string).trim();
	const tierValue = (tier as string).trim();
	const specUrlValue = (specUrl as string).trim();

	const override =
		typeof modelOverride === 'string' && modelOverride.trim() !== ''
			? modelOverride.trim()
			: undefined;
	const modelId = resolveModelId(override);
	const useNativePdf = supportsNativePdf(modelId);

	// Hybrid dual-input (#9): deterministic per-page text extraction plus the
	// original PDFs forwarded natively on the default model. Caps are enforced
	// before any model spend: per-file bytes above, total pages here.
	let paperBytes: Uint8Array;
	let markschemeBytes: Uint8Array;
	try {
		paperBytes = new Uint8Array(await paperFile.arrayBuffer());
		markschemeBytes = new Uint8Array(await markschemeFile.arrayBuffer());
	} catch {
		return error(
			'PDF_UNREADABLE',
			'The PDFs could not be read. Re-export them without password protection and try again.'
		);
	}

	let paperText: string;
	let markschemeText: string;
	let paperPages: number;
	let markschemePages: number;
	// Encode first: `unpdf` may detach the input buffers during extraction.
	const paperPdfBase64 = Buffer.from(paperBytes).toString('base64');
	const markschemePdfBase64 = Buffer.from(markschemeBytes).toString('base64');
	try {
		const [paperParsed, markschemeParsed] = await Promise.all([
			parsePdfBytes(paperBytes),
			parsePdfBytes(markschemeBytes)
		]);
		paperText = paperParsed.textWithMarkers;
		markschemeText = markschemeParsed.textWithMarkers;
		paperPages = paperParsed.pageCount;
		markschemePages = markschemeParsed.pageCount;
	} catch {
		return error(
			'PDF_UNREADABLE',
			'The PDFs could not be read. Re-export them without password protection and try again.'
		);
	}

	const totalPages = paperPages + markschemePages;
	if (totalPages > MAX_TOTAL_PAGES) {
		return error(
			'FILE_TOO_BIG',
			`The two PDFs total ${totalPages} pages, above the ${MAX_TOTAL_PAGES}-page ceiling. Split or compress them and try again.`,
			{ totalPages, limit: MAX_TOTAL_PAGES }
		);
	}

	// Exam specification fetch-parse-cache (#10): server-side only, fetched
	// from the teacher-supplied URL and validated against the pinned version.
	// Failure is retryable (502) and happens before any model spend.
	let specEntry: SpecCatalogueEntry;
	try {
		specEntry = await getSpecCatalogue({
			board: boardValue,
			specCode: subjectValue,
			tier: tierValue,
			specUrl: specUrlValue
		});
	} catch (fetchError) {
		const message =
			fetchError instanceof Error
				? fetchError.message
				: 'The exam specification could not be fetched. Check the URL and try again.';
		return error(SPEC_FETCH_ERROR_CODE, message, { retryable: true });
	}
	const specRef = specRefFor(specEntry);

	let rawJson: string;
	let usage;
	try {
		const result = await callModel({
			board: specRef.board,
			subject: specRef.specCode,
			tier: specRef.tier,
			specUrl: specUrlValue,
			modelOverride: override,
			modelId,
			useNativePdf,
			paper: {
				filename: paperFile.name,
				pageCount: paperPages,
				text: paperText,
				pdfBase64: paperPdfBase64
			},
			markscheme: {
				filename: markschemeFile.name,
				pageCount: markschemePages,
				text: markschemeText,
				pdfBase64: markschemePdfBase64
			}
		});
		rawJson = result.rawJson;
		usage = result.usage;
	} catch {
		// Skeleton mapping: any transport failure is fatal. #11 refines
		// transient (429/5xx) failures into retryable 502s with one silent retry.
		return error('MODEL_ERROR', 'The model call failed. Please try again.');
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(rawJson);
	} catch {
		return error(
			'MALFORMED_MODEL_OUTPUT',
			'The model returned output that could not be parsed. Please try again.'
		);
	}

	// Pin the specRef the breakdown was validated against, then validate.
	// Checked-against-the-cache means set-membership in the pinned catalogue
	// version. Warnings never block: the breakdown goes back intact with HTTP 200.
	if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
		(parsed as Record<string, unknown>)['specRef'] = specRef;
	}
	const warnings = validateBreakdown(parsed, specEntry.codes);

	// Text-only degradation: the override lacks native PDF support, so the
	// breakdown is grounded in extracted text alone. Surface it honestly —
	// never a silent paid-OCR fallback, never a silent hallucination.
	if (!useNativePdf) {
		warnings.push(buildDiagramUnverifiedWarning());
	}

	return json({ breakdown: parsed, specRef, warnings, usage }, { status: 200 });
};
