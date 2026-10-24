// The one server-side intake for multipart PDF uploads (`/api/parse` and
// `/api/match`): which fields count as uploads, the size and page caps, and
// the bytes and page count each route needs. Pure apart from reading the
// uploads; returns data or a typed failure, never a `Response`, so each route
// keeps its own status, codes and page-ceiling sentence.

import { countPdfPages } from './parse/pdf';

/** Per-file cap for uploaded PDFs, applied to each call's files. Fatal (413) when exceeded. */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

/** Page ceiling per call, across that call's uploaded PDFs. Fatal (413) when exceeded. */
export const MAX_TOTAL_PAGES = 100;

/** A file's type is not `application/pdf` (and its name does not end in `.pdf`). */
export const INVALID_FILE_TYPE_CODE = 'INVALID_FILE_TYPE';
/** An upload is over a byte cap or the shared page ceiling. */
export const FILE_TOO_BIG_CODE = 'FILE_TOO_BIG';
/** A PDF's bytes could not be read or its pages counted. */
export const PDF_UNREADABLE_CODE = 'PDF_UNREADABLE';

/** Sentences both routes word identically; the page-ceiling sentence stays with each route. */
export const PDF_UPLOAD_MESSAGES = {
	notPdf: 'Uploaded documents must be PDF files.',
	tooBig: (filename: string) => `File '${filename}' exceeds the 15MB per-file limit.`,
	unreadable:
		'The PDFs could not be read. Re-export them without password protection and try again.'
} as const;

/** A named field holding a PDF upload, type- and size-checked. */
export interface CheckedPdf {
	field: string;
	file: File;
}

/** A checked upload with the data the model call needs. */
export interface UploadedPdf {
	field: string;
	filename: string;
	pageCount: number;
	bytes: Uint8Array;
}

export type PdfUploadFailure =
	| { kind: 'missing'; fields: readonly string[] }
	| { kind: 'not-pdf'; field: string; filename: string }
	| { kind: 'too-big'; field: string; filename: string; size: number }
	| { kind: 'too-many-pages'; totalPages: number }
	| { kind: 'unreadable'; field: string; filename: string };

/**
 * Type- and size-check the named fields. A field counts only when it holds a
 * `File` with `size > 0`; anything else is absent. `any` accepts one or both
 * files; `all` needs every field present.
 */
export function checkPdfUploads(
	form: FormData,
	fields: readonly string[],
	required: 'any' | 'all'
): CheckedPdf[] | PdfUploadFailure {
	const checked: CheckedPdf[] = [];
	const missing: string[] = [];
	for (const field of fields) {
		const value = form.get(field);
		if (value instanceof File && value.size > 0) checked.push({ field, file: value });
		else missing.push(field);
	}

	if (missing.length > 0 && (required === 'all' || missing.length === fields.length)) {
		return { kind: 'missing', fields: missing };
	}

	for (const { field, file } of checked) {
		if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
			return { kind: 'not-pdf', field, filename: file.name };
		}
		if (file.size > MAX_FILE_BYTES) {
			return { kind: 'too-big', field, filename: file.name, size: file.size };
		}
	}

	return checked;
}

type ReadOutcome =
	{ ok: true; upload: UploadedPdf } | { ok: false; field: string; filename: string };

/**
 * Read bytes and count pages for every checked file, in field order. Any read
 * or page-count failure refuses the upload by field; the shared page ceiling
 * refuses it as a whole. No extraction happens here.
 */
export async function readPdfUploads(
	checked: readonly CheckedPdf[]
): Promise<UploadedPdf[] | PdfUploadFailure> {
	const outcomes = await Promise.all(
		checked.map(async ({ field, file }): Promise<ReadOutcome> => {
			let bytes: Uint8Array;
			try {
				bytes = new Uint8Array(await file.arrayBuffer());
			} catch {
				return { ok: false, field, filename: file.name };
			}

			let pageCount: number;
			try {
				pageCount = await countPdfPages(bytes);
			} catch {
				return { ok: false, field, filename: file.name };
			}

			return { ok: true, upload: { field, filename: file.name, pageCount, bytes } };
		})
	);

	const uploads: UploadedPdf[] = [];
	for (const outcome of outcomes) {
		if (!outcome.ok) {
			return { kind: 'unreadable', field: outcome.field, filename: outcome.filename };
		}
		uploads.push(outcome.upload);
	}

	const totalPages = uploads.reduce((sum, upload) => sum + upload.pageCount, 0);
	if (totalPages > MAX_TOTAL_PAGES) return { kind: 'too-many-pages', totalPages };

	return uploads;
}
