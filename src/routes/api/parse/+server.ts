// `POST /api/parse` — single stateless server proxy for Phase 1 Parse (#7).
// Skeleton slice (#8): multipart in, `{ breakdown, specRef, warnings, usage }`
// out, with the model transport stubbed. Real PDF ingestion (#9), the
// exam-specification cache (#10) and the live model call (#11) plug in behind
// this same seam without changing the contract.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	ASSESSMENT_PAPER_FIELD,
	BOARD_FIELD,
	MARKSCHEME_FIELD,
	MAX_FILE_BYTES,
	MODEL_OVERRIDE_FIELD,
	SPEC_URL_FIELD,
	STUB_SPEC_CATALOGUE,
	SUBJECT_FIELD,
	TIER_FIELD,
	buildStubSpecRef
} from '$lib/server/parse/schema';
import { validateBreakdown } from '$lib/server/parse/validate';
import { callModel } from '$lib/server/parse/model';

function error(code: string, message: string, extra: Record<string, unknown> = {}): Response {
	return json({ error: { code, message, ...extra } }, { status: statusFor(code) });
}

function statusFor(code: string): number {
	switch (code) {
		case 'MISSING_INPUT':
		case 'INVALID_FILE_TYPE':
			return 400;
		case 'FILE_TOO_BIG':
			return 413;
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

	const specRef = buildStubSpecRef(
		(board as string).trim(),
		(subject as string).trim(),
		(tier as string).trim(),
		(specUrl as string).trim()
	);

	let rawJson: string;
	let usage;
	try {
		const result = await callModel({
			board: specRef.board,
			subject: specRef.specCode,
			tier: specRef.tier,
			specUrl: (specUrl as string).trim(),
			modelOverride:
				typeof modelOverride === 'string' && modelOverride.trim() !== ''
					? modelOverride.trim()
					: undefined
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
	// Warnings never block: the breakdown goes back intact with HTTP 200.
	if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
		(parsed as Record<string, unknown>)['specRef'] = specRef;
	}
	const warnings = validateBreakdown(parsed, STUB_SPEC_CATALOGUE);

	return json({ breakdown: parsed, specRef, warnings, usage }, { status: 200 });
};
