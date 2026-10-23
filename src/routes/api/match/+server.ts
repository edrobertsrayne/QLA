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
import { MAX_ENTRIES, MAX_LABEL_LENGTH, MAX_SUMMARY_LENGTH } from '$lib/marksheet/report-limits';
import {
	MATCH_SCHEMA,
	MATCH_SCHEMA_NAME,
	MATCH_SYSTEM_PROMPT,
	localMatchPairs,
	readMatchPairs,
	type MatchEntry
} from '$lib/server/match';
import { MISSING_API_KEY_CODE } from '$lib/server/openrouter';
import { getServerEnv } from '$lib/server/parse/env';
import { MAX_FILE_BYTES, MAX_TOTAL_PAGES } from '$lib/server/parse/schema';
import { countPdfPages, resolveModelId, supportsNativePdf } from '$lib/server/parse/pdf';
import {
	InputError,
	fail,
	readList,
	readNullableString,
	readRecord,
	readString,
	rejectUnknownKeys
} from '$lib/server/request-fields';
import { askModel, failure, invalidOutput } from '$lib/server/structured-route';

const TIER1_DOCUMENT_FIELD = 'tier1Document';
const TIER2_DOCUMENT_FIELD = 'tier2Document';
const TIER1_ENTRIES_FIELD = 'tier1Entries';
const TIER2_ENTRIES_FIELD = 'tier2Entries';
const MODEL_FIELD = 'model';

const INVALID_REQUEST_CODE = 'INVALID_MATCH_REQUEST';
const INVALID_FILE_TYPE_CODE = 'INVALID_FILE_TYPE';
const FILE_TOO_BIG_CODE = 'FILE_TOO_BIG';
const PDF_UNREADABLE_CODE = 'PDF_UNREADABLE';
const MATCH_NEEDS_NATIVE_PDF_CODE = 'MATCH_NEEDS_NATIVE_PDF';

const MATCH_MAX_TOKENS = 16_000;
const MATCH_TIMEOUT_MS = 120_000;

const UNUSABLE_ANSWER_MESSAGE =
	'The model answer was not a usable list of common-question pairs. Please try again.';

const ENTRY_KEYS = new Set([
	'id',
	'questionNumber',
	'marks',
	'summary',
	'specPoint',
	'commandWord'
]);

interface MatchRequest {
	tier1Document: File;
	tier2Document: File;
	tier1Entries: MatchEntry[];
	tier2Entries: MatchEntry[];
	model?: string;
}

interface IngestedDocument {
	filename: string;
	pdfBase64: string;
	pageCount: number;
}

class UnreadablePdfError extends Error {
	constructor(filename: string, options: { cause: unknown }) {
		super(`PDF '${filename}' could not be read.`, options);
		this.name = 'UnreadablePdfError';
	}
}

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

function readDocument(form: FormData, field: string): File {
	const value = form.get(field);
	if (value instanceof File && value.size > 0) return value;
	fail(field, 'Must be a PDF file.');
}

function readJson(text: string, field: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		fail(field, 'Must be valid JSON.');
	}
}

function readMarks(value: unknown, field: string): number | null {
	if (value === null) return null;
	if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
	fail(field, 'Must be a positive whole number of marks or null.');
}

function readEntries(form: FormData, field: string): MatchEntry[] {
	const raw = form.get(field);
	if (typeof raw !== 'string') fail(field, 'Must be a JSON list of entries.');
	const list = readList(readJson(raw, field), field, {
		min: 0,
		max: MAX_ENTRIES,
		notList: 'Must be a list of entries.',
		size: `Must hold at most ${MAX_ENTRIES} entries.`
	});

	return list.map((item, index) => {
		const entryField = `${field}[${index}]`;
		const record = readRecord(item, entryField);
		rejectUnknownKeys(record, ENTRY_KEYS, entryField);
		return {
			id: readString(record['id'], `${entryField}.id`, {
				nonBlank: 'Must be a non-blank id.',
				max: MAX_LABEL_LENGTH
			}),
			questionNumber: readString(record['questionNumber'], `${entryField}.questionNumber`, {
				nonBlank: 'Must be a non-blank question number.',
				max: MAX_LABEL_LENGTH
			}),
			marks: readMarks(record['marks'], `${entryField}.marks`),
			summary: readString(record['summary'], `${entryField}.summary`, {
				max: MAX_SUMMARY_LENGTH
			}),
			specPoint: readNullableString(
				record['specPoint'],
				`${entryField}.specPoint`,
				MAX_LABEL_LENGTH
			),
			commandWord: readNullableString(
				record['commandWord'],
				`${entryField}.commandWord`,
				MAX_LABEL_LENGTH
			)
		};
	});
}

function readModel(form: FormData): string | undefined {
	const value = form.get(MODEL_FIELD);
	if (value === null) return undefined;
	if (value instanceof File) fail(MODEL_FIELD, 'Must be a string.');
	const model = readString(value, MODEL_FIELD, { max: MAX_LABEL_LENGTH }).trim();
	return model === '' ? undefined : model;
}

function validateMatchRequest(form: FormData): MatchRequest {
	const model = readModel(form);
	return {
		tier1Document: readDocument(form, TIER1_DOCUMENT_FIELD),
		tier2Document: readDocument(form, TIER2_DOCUMENT_FIELD),
		tier1Entries: readEntries(form, TIER1_ENTRIES_FIELD),
		tier2Entries: readEntries(form, TIER2_ENTRIES_FIELD),
		...(model === undefined ? {} : { model })
	};
}

function validRequest(form: FormData): MatchRequest | Response {
	try {
		return validateMatchRequest(form);
	} catch (error) {
		if (error instanceof InputError) return invalidRequest(error.field, error.message);
		throw error;
	}
}

function isPdf(file: File): boolean {
	return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

async function ingestDocument(file: File): Promise<IngestedDocument> {
	let bytes: Uint8Array;
	try {
		bytes = new Uint8Array(await file.arrayBuffer());
	} catch (error) {
		throw new UnreadablePdfError(file.name, { cause: error });
	}
	// Encode first: unpdf detaches the buffer while extracting text.
	const pdfBase64 = Buffer.from(bytes).toString('base64');
	let pageCount: number;
	try {
		pageCount = await countPdfPages(bytes);
	} catch (error) {
		throw new UnreadablePdfError(file.name, { cause: error });
	}
	return { filename: file.name, pdfBase64, pageCount };
}

async function readDocuments(
	request: MatchRequest
): Promise<{ tier1: IngestedDocument; tier2: IngestedDocument } | Response> {
	try {
		const [tier1, tier2] = await Promise.all([
			ingestDocument(request.tier1Document),
			ingestDocument(request.tier2Document)
		]);
		return { tier1, tier2 };
	} catch (error) {
		if (error instanceof UnreadablePdfError) {
			return failure(400, {
				code: PDF_UNREADABLE_CODE,
				message:
					'The PDFs could not be read. Re-export them without password protection and try again.',
				retryable: false
			});
		}
		throw error;
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

	const documents = [
		{ field: TIER1_DOCUMENT_FIELD, file: valid.tier1Document },
		{ field: TIER2_DOCUMENT_FIELD, file: valid.tier2Document }
	];
	for (const { field, file } of documents) {
		if (!isPdf(file)) {
			return failure(400, {
				code: INVALID_FILE_TYPE_CODE,
				message: 'Both tier documents must be PDF files.',
				retryable: false,
				field
			});
		}
		if (file.size > MAX_FILE_BYTES) {
			return failure(413, {
				code: FILE_TOO_BIG_CODE,
				message: `File '${file.name}' exceeds the 15MB per-file limit.`,
				retryable: false,
				field
			});
		}
	}

	const ingested = await readDocuments(valid);
	if (ingested instanceof Response) return ingested;

	const totalPages = ingested.tier1.pageCount + ingested.tier2.pageCount;
	if (totalPages > MAX_TOTAL_PAGES) {
		return failure(413, {
			code: FILE_TOO_BIG_CODE,
			message: `The PDFs total ${totalPages} pages, above the ${MAX_TOTAL_PAGES}-page ceiling. Split or compress them and try again.`,
			retryable: false
		});
	}

	const modelId = resolveModelId(valid.model);
	if (!supportsNativePdf(modelId)) {
		return failure(400, {
			code: MATCH_NEEDS_NATIVE_PDF_CODE,
			message:
				'Common-question matching needs a model that reads PDFs natively. Choose another model.',
			retryable: false
		});
	}

	const asked = await askModel(
		{
			modelId,
			systemPrompt: MATCH_SYSTEM_PROMPT,
			data: {
				tier1: { documents: [ingested.tier1.filename], entries: valid.tier1Entries },
				tier2: { documents: [ingested.tier2.filename], entries: valid.tier2Entries }
			},
			schemaName: MATCH_SCHEMA_NAME,
			schema: MATCH_SCHEMA,
			caller: { referer: 'https://qla.local/match', title: 'QLA Tiered Assessment Match' },
			maxTokens: MATCH_MAX_TOKENS,
			timeoutMs: MATCH_TIMEOUT_MS,
			files: [
				{ filename: ingested.tier1.filename, pdfBase64: ingested.tier1.pdfBase64 },
				{ filename: ingested.tier2.filename, pdfBase64: ingested.tier2.pdfBase64 }
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
