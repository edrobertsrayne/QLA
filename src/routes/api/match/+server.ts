// `POST /api/match` — one stateless call that proposes the questions printed
// in both tiers of an assessment.
//
// Multipart in (`tier1Document`, `tier2Document`, `tier1Entries`,
// `tier2Entries`, optional `model`), `{ pairs, usage }` out, as parse-label
// pairs (the client maps labels to entry ids). The route stores nothing,
// sends no student data, and refuses every unusable request before spend.
// The model's answer then passes the local pair checks before it is returned.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	MATCH_SCHEMA,
	MATCH_SCHEMA_NAME,
	MATCH_SYSTEM_PROMPT,
	TIER1_DOCUMENT_FIELD,
	TIER2_DOCUMENT_FIELD,
	localMatchPairs,
	readMatchPairs,
	validateMatchRequest,
	type MatchRequest
} from '$lib/server/match';
import { MISSING_API_KEY_CODE } from '$lib/server/openrouter';
import { getServerEnv } from '$lib/server/parse/env';
import { resolveModelId, supportsNativePdf } from '$lib/server/parse/pdf';
import type { ParseUsage } from '$lib/server/parse/schema';
import {
	FILE_TOO_BIG_CODE,
	INVALID_FILE_TYPE_CODE,
	MAX_TOTAL_PAGES,
	PDF_UPLOAD_MESSAGES,
	PDF_UNREADABLE_CODE,
	checkPdfUploads,
	readPdfUploads,
	type PdfUploadFailure
} from '$lib/server/pdf-upload';
import { InputError } from '$lib/server/request-fields';
import { askModel, failure, invalidOutput } from '$lib/server/structured-route';

const INVALID_REQUEST_CODE = 'INVALID_MATCH_REQUEST';
const MATCH_NEEDS_NATIVE_PDF_CODE = 'MATCH_NEEDS_NATIVE_PDF';

const MATCH_MAX_TOKENS = 16_000;
const MATCH_TIMEOUT_MS = 120_000;

const UNUSABLE_ANSWER_MESSAGE =
	'The model answer was not a usable list of common-question pairs. Please try again.';

const ZERO_USAGE: ParseUsage = {
	promptTokens: 0,
	completionTokens: 0,
	totalTokens: 0,
	estCost: 0
};

function invalidRequest(field: string, message: string): Response {
	return failure(400, { code: INVALID_REQUEST_CODE, message, retryable: false, field });
}

function unusableAnswer(): Response {
	return invalidOutput(UNUSABLE_ANSWER_MESSAGE, [
		{
			id: 'shape',
			message:
				'The model answer must be an object with a pairs list of tier1Id and tier2Id strings.'
		}
	]);
}

async function readForm(request: Request): Promise<FormData | Response> {
	try {
		return await request.formData();
	} catch {
		return invalidRequest(
			'',
			'Expected a multipart form with both tier documents and their entry lists.'
		);
	}
}

function validRequest(form: FormData): MatchRequest | Response {
	try {
		return validateMatchRequest(form);
	} catch (error) {
		if (error instanceof InputError) return invalidRequest(error.field, error.message);
		throw error;
	}
}

function uploadFailure(pdfFailure: PdfUploadFailure): Response {
	switch (pdfFailure.kind) {
		case 'missing':
			return invalidRequest(
				pdfFailure.fields[0],
				'Expected a multipart form with both tier documents and their entry lists.'
			);
		case 'not-pdf':
			return failure(400, {
				code: INVALID_FILE_TYPE_CODE,
				message: PDF_UPLOAD_MESSAGES.notPdf,
				retryable: false,
				field: pdfFailure.field
			});
		case 'too-big':
			return failure(413, {
				code: FILE_TOO_BIG_CODE,
				message: PDF_UPLOAD_MESSAGES.tooBig(pdfFailure.filename),
				retryable: false,
				field: pdfFailure.field
			});
		case 'too-many-pages':
			return failure(413, {
				code: FILE_TOO_BIG_CODE,
				message: `The PDFs total ${pdfFailure.totalPages} pages, above the ${MAX_TOTAL_PAGES}-page ceiling for matching. The run continues without proposed pairs; pair the common questions by hand at review.`,
				retryable: false
			});
		case 'unreadable':
			return failure(400, {
				code: PDF_UNREADABLE_CODE,
				message: PDF_UPLOAD_MESSAGES.unreadable,
				retryable: false
			});
	}
}

export const POST: RequestHandler = async ({ request }) => {
	if (!getServerEnv('OPENROUTER_API_KEY')) {
		return failure(500, {
			code: MISSING_API_KEY_CODE,
			message: 'Server is missing its OpenRouter API key.',
			retryable: false
		});
	}

	const form = await readForm(request);
	if (form instanceof Response) return form;

	const valid = validRequest(form);
	if (valid instanceof Response) return valid;

	const checked = checkPdfUploads(form, [TIER1_DOCUMENT_FIELD, TIER2_DOCUMENT_FIELD], 'all');
	if (!Array.isArray(checked)) return uploadFailure(checked);

	// An empty tier can produce no pair, and the model cannot change that:
	// answer without reading or sending either PDF.
	if (valid.tier1Entries.length === 0 || valid.tier2Entries.length === 0) {
		return json({ pairs: [], usage: ZERO_USAGE });
	}

	// The model capability check depends only on the requested id, so it runs
	// before either PDF is read: a text-only model never pays for ingestion.
	const modelId = resolveModelId(valid.model);
	if (!supportsNativePdf(modelId)) {
		return failure(400, {
			code: MATCH_NEEDS_NATIVE_PDF_CODE,
			message:
				'Common-question matching needs a model that reads PDFs natively. Choose another model.',
			retryable: false
		});
	}

	const uploads = await readPdfUploads(checked);
	if (!Array.isArray(uploads)) return uploadFailure(uploads);

	const [tier1, tier2] = uploads;
	const asked = await askModel(
		{
			modelId,
			systemPrompt: MATCH_SYSTEM_PROMPT,
			data: {
				tier1: { documents: [tier1.filename], entries: valid.tier1Entries },
				tier2: { documents: [tier2.filename], entries: valid.tier2Entries }
			},
			schemaName: MATCH_SCHEMA_NAME,
			schema: MATCH_SCHEMA,
			caller: { referer: 'https://qla.local/match', title: 'QLA Tiered Assessment Match' },
			maxTokens: MATCH_MAX_TOKENS,
			timeoutMs: MATCH_TIMEOUT_MS,
			files: [
				{ filename: tier1.filename, pdfBase64: Buffer.from(tier1.bytes).toString('base64') },
				{ filename: tier2.filename, pdfBase64: Buffer.from(tier2.bytes).toString('base64') }
			]
		},
		UNUSABLE_ANSWER_MESSAGE
	);
	if (asked instanceof Response) return asked;

	const pairs = readMatchPairs(asked.answer);
	if (pairs === null) return unusableAnswer();

	return json({
		pairs: localMatchPairs(pairs, valid.tier1Entries, valid.tier2Entries),
		usage: asked.usage
	});
};
