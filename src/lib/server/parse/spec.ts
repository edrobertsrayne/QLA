// Optional exam specification fetch for Phase 1 Parse.
//
// The teacher may supply any link; the server fetches it fresh on every run
// (no cache), verifies it is a real readable PDF, and forwards it to the
// model as extra grounding alongside the paper and markscheme. Any failure
// fails the run (400) — the spec is never silently ignored.
//
// Guardrails: http(s) only (no credentials forwarded), `SPEC_FETCH_TIMEOUT_MS`
// timeout, `MAX_FILE_BYTES` per-file cap, magic-byte + `parsePdfBytes` check
// so an HTML error page or corrupt file becomes `SPEC_UNREADABLE`, never
// model spend. Pages count toward the shared `MAX_TOTAL_PAGES` ceiling
// (enforced by the route).
//
// Tests inject behaviour via `setSpecFetch`; production uses global fetch.

import {
	MAX_FILE_BYTES,
	SPEC_FETCH_TIMEOUT_MS,
	SPEC_UNREADABLE_CODE,
	INVALID_SPEC_URL_CODE
} from './schema';
import { parsePdfBytes } from './pdf';
import type { IngestedDocument } from './model';

/** Spec URL is malformed or not http(s) → route maps to 400. */
export class SpecUrlError extends Error {
	readonly code = INVALID_SPEC_URL_CODE;
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = 'SpecUrlError';
	}
}

/** Spec fetch failed, non-OK, oversized, or not a readable PDF → route maps to 400/413. */
export class SpecUnreadableError extends Error {
	readonly code: string;
	constructor(message: string, code: string = SPEC_UNREADABLE_CODE, options?: { cause?: unknown }) {
		super(message, options);
		this.name = 'SpecUnreadableError';
		this.code = code;
	}
}

/** Fetch seam for the spec download (tests inject a mocked fetch). */
export type SpecFetch = (url: string, init?: RequestInit) => Promise<Response>;

let specFetch: SpecFetch = (url, init) => fetch(url, init);

/** Test seam: replace the spec fetch implementation. */
export function setSpecFetch(fn: SpecFetch): void {
	specFetch = fn;
}

/** Restore the default global-fetch implementation. */
export function resetSpecFetch(): void {
	specFetch = (url, init) => fetch(url, init);
}

/** Parse and validate the raw spec URL string. Throws `SpecUrlError`. */
export function parseSpecUrl(raw: string): URL {
	const trimmed = raw.trim();
	let url: URL;
	try {
		url = new URL(trimmed);
	} catch (error) {
		throw new SpecUrlError('The specification link is not a valid URL.', { cause: error });
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new SpecUrlError('The specification link must be an http(s) URL.');
	}
	return url;
}

function filenameFor(url: URL): string {
	const last = url.pathname.split('/').filter(Boolean).pop();
	return last && last.toLowerCase().endsWith('.pdf') ? last : 'specification.pdf';
}

function isPdfMagic(bytes: Uint8Array): boolean {
	return (
		bytes.length >= 4 &&
		bytes[0] === 0x25 && // %
		bytes[1] === 0x50 && // P
		bytes[2] === 0x44 && // D
		bytes[3] === 0x46 // F
	);
}

/**
 * Fetch, verify and ingest the specification PDF at `url`.
 * Returns the ingested document plus its page count for the shared ceiling.
 * Throws `SpecUrlError` (bad URL) or `SpecUnreadableError` (fetch/verify fail).
 */
export async function fetchSpecPdf(url: URL): Promise<{ doc: IngestedDocument; pages: number }> {
	let response: Response;
	try {
		response = await specFetch(url.toString(), {
			headers: { Accept: 'application/pdf' },
			signal: AbortSignal.timeout(SPEC_FETCH_TIMEOUT_MS)
		});
	} catch (error) {
		throw new SpecUnreadableError(
			'The specification could not be downloaded. Check the link and try again.',
			SPEC_UNREADABLE_CODE,
			{ cause: error }
		);
	}

	if (!response.ok) {
		throw new SpecUnreadableError(
			`The specification link returned status ${response.status}. Check the link and try again.`
		);
	}

	const declared = response.headers.get('content-length');
	if (declared !== null && Number.isFinite(Number(declared)) && Number(declared) > MAX_FILE_BYTES) {
		throw new SpecUnreadableError(
			`The specification exceeds the 15MB per-file limit.`,
			'FILE_TOO_BIG'
		);
	}

	let bytes: Uint8Array;
	try {
		bytes = new Uint8Array(await response.arrayBuffer());
	} catch (error) {
		throw new SpecUnreadableError(
			'The specification could not be read. Check the link and try again.',
			SPEC_UNREADABLE_CODE,
			{ cause: error }
		);
	}

	if (bytes.length > MAX_FILE_BYTES) {
		throw new SpecUnreadableError(
			`The specification exceeds the 15MB per-file limit.`,
			'FILE_TOO_BIG'
		);
	}

	if (!isPdfMagic(bytes)) {
		throw new SpecUnreadableError(
			'The specification link is not a PDF file. Link directly to the specification PDF and try again.'
		);
	}

	let parsed;
	try {
		parsed = await parsePdfBytes(bytes);
	} catch (error) {
		throw new SpecUnreadableError(
			'The specification PDF could not be read. Re-export it without password protection and try again.',
			SPEC_UNREADABLE_CODE,
			{ cause: error }
		);
	}

	return {
		doc: {
			filename: filenameFor(url),
			pageCount: parsed.pageCount,
			text: parsed.textWithMarkers,
			pdfBase64: Buffer.from(bytes).toString('base64')
		},
		pages: parsed.pageCount
	};
}
