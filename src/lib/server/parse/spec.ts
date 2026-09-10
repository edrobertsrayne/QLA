// Optional exam specification fetch for Phase 1 Parse.
//
// The teacher may supply any link; the server fetches it fresh on every run
// (no cache), verifies it is a real readable PDF, and forwards it to the
// model as extra grounding alongside the paper and markscheme. Any failure
// fails the run (400) — the spec is never silently ignored.
//
// Guardrails: http(s) only (no credentials forwarded), `SPEC_FETCH_TIMEOUT_MS`
// timeout, `MAX_FILE_BYTES` per-file cap enforced against the accumulated
// response body as it streams in (never buffered whole first), magic-byte +
// `parsePdfBytes` check so an HTML error page or corrupt file becomes
// `SPEC_UNREADABLE`, never model spend. Pages count toward the shared
// `MAX_TOTAL_PAGES` ceiling (enforced by the route).
//
// SSRF: the resolved address of the link — and of every redirect hop, each
// re-validated the same way, up to `MAX_SPEC_REDIRECTS` — is rejected if it
// is loopback, link-local, private, unique-local, or unspecified, so the
// server can never be used as a proxy into its own network. `localhost` and
// `*.localhost` are rejected on the hostname alone before any lookup. Every
// failure along this path — network error, blocked address, refused
// redirect, non-OK status — surfaces the same generic message, so a caller
// cannot use response differences to fingerprint internal ports.
//
// Tests inject behaviour via `setSpecFetch` and `setDnsLookup`; production
// uses global `fetch` and Node's resolver.

import { lookup as nodeDnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import {
	MAX_FILE_BYTES,
	SPEC_FETCH_TIMEOUT_MS,
	SPEC_UNREADABLE_CODE,
	INVALID_SPEC_URL_CODE
} from './schema';
import { parsePdfBytes } from './pdf';
import type { IngestedDocument } from './model';

/** Generic message for every network-level failure (blocked, unreachable, non-OK, bad redirect). */
const DOWNLOAD_FAILED_MESSAGE =
	'The specification could not be downloaded. Check the link and try again.';

/** Redirect hops followed before giving up; each hop is re-validated like the original link. */
const MAX_SPEC_REDIRECTS = 5;

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

/** DNS lookup seam for the SSRF guard (tests inject fake resolutions). */
export type SpecDnsLookup = (hostname: string) => Promise<{ address: string; family: number }[]>;

let specDnsLookup: SpecDnsLookup = (hostname) =>
	nodeDnsLookup(hostname, { all: true, verbatim: true });

/** Test seam: replace the DNS resolution used by the SSRF guard. */
export function setDnsLookup(fn: SpecDnsLookup): void {
	specDnsLookup = fn;
}

/** Restore the default Node resolver. */
export function resetDnsLookup(): void {
	specDnsLookup = (hostname) => nodeDnsLookup(hostname, { all: true, verbatim: true });
}

/** True for IPv4 loopback, link-local, RFC1918 private, CGNAT, or unspecified addresses. */
function isBlockedIpv4(address: string): boolean {
	const octets = address.split('.').map(Number);
	if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
		return true;
	const [a, b] = octets;
	if (a === 127) return true; // loopback
	if (a === 10) return true; // private
	if (a === 172 && b >= 16 && b <= 31) return true; // private
	if (a === 192 && b === 168) return true; // private
	if (a === 169 && b === 254) return true; // link-local
	if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
	if (a === 0) return true; // unspecified / "this network"
	return false;
}

/** True for IPv6 loopback, link-local, unique-local, unspecified, or v4-mapped-blocked addresses. */
function isBlockedIpv6(address: string): boolean {
	const lower = address.toLowerCase();
	if (lower === '::' || lower === '::1') return true; // unspecified / loopback
	const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
	if (mapped) return isBlockedIpv4(mapped[1]);
	if (/^fe[89ab][0-9a-f]:/.test(lower)) return true; // link-local fe80::/10
	if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true; // unique-local fc00::/7
	return false;
}

/**
 * Reject a spec URL (original or redirect target) whose hostname or resolved
 * address falls in loopback/link-local/private/unique-local/unspecified
 * space, before any connection is attempted. Throws the same generic
 * `SpecUnreadableError` as every other network-level failure so a caller
 * cannot tell a blocked address apart from an unreachable or erroring one.
 */
async function assertPublicAddress(url: URL): Promise<void> {
	const hostname = url.hostname.toLowerCase();
	const literalFamily = isIP(hostname);
	if (literalFamily) {
		const blocked = literalFamily === 6 ? isBlockedIpv6(hostname) : isBlockedIpv4(hostname);
		if (blocked) throw new SpecUnreadableError(DOWNLOAD_FAILED_MESSAGE);
		return;
	}
	if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
		throw new SpecUnreadableError(DOWNLOAD_FAILED_MESSAGE);
	}
	let resolved: { address: string; family: number }[];
	try {
		resolved = await specDnsLookup(hostname);
	} catch (error) {
		throw new SpecUnreadableError(DOWNLOAD_FAILED_MESSAGE, SPEC_UNREADABLE_CODE, { cause: error });
	}
	const blocked = resolved.some((r) =>
		r.family === 6 ? isBlockedIpv6(r.address) : isBlockedIpv4(r.address)
	);
	if (resolved.length === 0 || blocked) {
		throw new SpecUnreadableError(DOWNLOAD_FAILED_MESSAGE);
	}
}

/**
 * Fetch `url`, following redirects manually so each hop is re-validated
 * against the same SSRF guard before it is followed. Never lets the
 * underlying fetch implementation auto-follow a redirect.
 */
async function fetchValidated(url: URL): Promise<Response> {
	let current = url;
	for (let hop = 0; ; hop += 1) {
		await assertPublicAddress(current);

		let response: Response;
		try {
			response = await specFetch(current.toString(), {
				headers: { Accept: 'application/pdf' },
				redirect: 'manual',
				signal: AbortSignal.timeout(SPEC_FETCH_TIMEOUT_MS)
			});
		} catch (error) {
			throw new SpecUnreadableError(DOWNLOAD_FAILED_MESSAGE, SPEC_UNREADABLE_CODE, {
				cause: error
			});
		}

		if (response.status < 300 || response.status >= 400) return response;

		const location = response.headers.get('location');
		if (!location || hop >= MAX_SPEC_REDIRECTS) {
			throw new SpecUnreadableError(DOWNLOAD_FAILED_MESSAGE);
		}
		let next: URL;
		try {
			next = new URL(location, current);
		} catch (error) {
			throw new SpecUnreadableError(DOWNLOAD_FAILED_MESSAGE, SPEC_UNREADABLE_CODE, {
				cause: error
			});
		}
		if (next.protocol !== 'http:' && next.protocol !== 'https:') {
			throw new SpecUnreadableError(DOWNLOAD_FAILED_MESSAGE);
		}
		current = next;
	}
}

/**
 * Read `response`'s body up to `capBytes`, aborting the moment the
 * accumulated size exceeds it — the full body is never buffered first, so a
 * chunked response with no (or a lying) `content-length` cannot exhaust
 * memory.
 */
async function readBodyCapped(response: Response, capBytes: number): Promise<Uint8Array> {
	if (!response.body) {
		const buffer = new Uint8Array(await response.arrayBuffer());
		if (buffer.length > capBytes) {
			throw new SpecUnreadableError(
				`The specification exceeds the 15MB per-file limit.`,
				'FILE_TOO_BIG'
			);
		}
		return buffer;
	}

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > capBytes) {
			await reader.cancel().catch(() => {});
			throw new SpecUnreadableError(
				`The specification exceeds the 15MB per-file limit.`,
				'FILE_TOO_BIG'
			);
		}
		chunks.push(value);
	}
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
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
 * `useNativePdf` decides whether the raw bytes are also base64-encoded —
 * skipped on the text-only path, where the encoded copy is never used.
 * Throws `SpecUrlError` (bad URL) or `SpecUnreadableError` (fetch/verify fail).
 */
export async function fetchSpecPdf(
	url: URL,
	useNativePdf: boolean
): Promise<{ doc: IngestedDocument; pages: number }> {
	const response = await fetchValidated(url);

	if (!response.ok) {
		throw new SpecUnreadableError(DOWNLOAD_FAILED_MESSAGE);
	}

	const declared = response.headers.get('content-length');
	if (declared !== null && Number.isFinite(Number(declared)) && Number(declared) > MAX_FILE_BYTES) {
		throw new SpecUnreadableError(
			`The specification exceeds the 15MB per-file limit.`,
			'FILE_TOO_BIG'
		);
	}

	const bytes = await readBodyCapped(response, MAX_FILE_BYTES);

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
			pdfBase64: useNativePdf ? Buffer.from(bytes).toString('base64') : null
		},
		pages: parsed.pageCount
	};
}
