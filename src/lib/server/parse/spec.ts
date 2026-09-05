// Exam specification fetch, parse and cache for Phase 1 Parse (issue #10).
//
// A classroom teacher supplies an exam specification URL once. The server
// fetches and caches its catalogue, and every emitted spec code in the
// breakdown is checked against that cached version — with the breakdown
// pinning which version applied. Repeat runs reuse the cache instead of
// re-parsing a 100+ page syllabus, a stray code warns instead of trashing
// the run, and a spec revision becomes a new cache entry rather than
// overwriting history.
//
// Design (from the Phase 1 spec #7 + research `research/spec-cache`):
// - Fetch server-side only (never from the browser): validate PDF
//   content-type, enforce a ~10MB cap, follow official filestore/CDN URLs.
//   Any fetch problem throws `SpecFetchError` → the route maps it to a 502
//   retryable error.
// - Parse by reusing the shared extraction approach from the ingestion slice
//   (`parsePdfBytes`): deterministic per-page text, then dotted-code
//   extraction. No model call — the spec is text-extractable (8463 v1.1:
//   104pp/~2MB, 119 dotted `4.x.y.z` codes with HT-only/physics-only flags).
// - Cache server-side under the immutable key
//   `spec:{board}:{specCode}:{tier}:{version}:{urlHash}` carrying
//   version/fetchedAt/sourceUrl/etag. A new revision or URL creates a new
//   entry, never an overwrite. No TTL; per-run conditional-GET refresh
//   (`If-None-Match`/`If-Modified-Since` → 304 reuses the cached entry
//   without re-parsing).

import { createHash } from 'node:crypto';
import { SPEC_CODE_PATTERN, type SpecRef } from './schema';
import { parsePdfBytes } from './pdf';

/** Size cap for the fetched exam specification PDF (~10MB; the 8463 spec is ~2MB). */
export const MAX_SPEC_BYTES = 10 * 1024 * 1024;

/** Fatal-but-retryable error code when the spec URL cannot be fetched/parsed. */
export const SPEC_FETCH_ERROR_CODE = 'SPEC_FETCH_ERROR';

/** Fallback version when the PDF cover stamp cannot be found. */
export const FALLBACK_SPEC_VERSION = 'v1';

export interface SpecFlags {
	htOnly: boolean;
	physicsOnly: boolean;
}

export interface SpecCatalogueEntry {
	/** Immutable key `spec:{board}:{specCode}:{tier}:{version}:{urlHash}`. */
	key: string;
	board: string;
	specCode: string;
	tier: string;
	version: string;
	urlHash: string;
	sourceUrl: string;
	fetchedAt: string;
	etag: string | null;
	lastModified: string | null;
	/** Dotted content codes pinned for this version. */
	codes: Set<string>;
	/** Per-code tier/scope flags (HT-only / physics-only). */
	flags: Map<string, SpecFlags>;
}

/** Transport seam for tests: `(url, init) => Response`. Defaults to global fetch. */
export type SpecFetchTransport = (url: string, init?: RequestInit) => Promise<Response>;

let fetchTransport: SpecFetchTransport = (url, init) => fetch(url, init);

/** Test seam: replace the spec fetch transport. */
export function setSpecFetchTransport(fn: SpecFetchTransport): void {
	fetchTransport = fn;
}

/** Restore the default global-fetch transport. */
export function resetSpecFetchTransport(): void {
	fetchTransport = (url, init) => fetch(url, init);
}

// --- Pure helpers (no I/O) ---

/** Short hash of the spec URL, stable with `buildStubSpecRef` (12 hex chars). */
export function urlHashFor(specUrl: string): string {
	return createHash('sha256').update(specUrl).digest('hex').slice(0, 12);
}

/** Immutable cache key. A revision or URL change yields a different key. */
export function buildSpecKey(
	board: string,
	specCode: string,
	tier: string,
	version: string,
	urlHash: string
): string {
	return `spec:${board}:${specCode}:${tier}:${version}:${urlHash}`;
}

/**
 * Extract the cover version stamp (e.g. `Version 1.1 30 September 2019`
 * → `1.1`). Falls back to `v1` so the cache key stays deterministic for
 * specs without a recognisable stamp.
 */
export function extractSpecVersion(text: string): string {
	const match = /version\s+(\d+(?:\.\d+)*)/i.exec(text);
	if (match?.[1]) return match[1];
	return FALLBACK_SPEC_VERSION;
}

/**
 * Extract dotted content codes from spec text. Matches the validator's
 * `SPEC_CODE_PATTERN` grammar (`4.6`, `4.6.1`, `4.6.1.1`) and dedupes.
 * Tier/scope flags are detected from the surrounding context window:
 * `HT only` and `physics only` markers near each occurrence.
 */
export function extractSpecCodes(text: string): {
	codes: Set<string>;
	flags: Map<string, SpecFlags>;
} {
	const codes = new Set<string>();
	const flags = new Map<string, SpecFlags>();
	const pattern = /\b(\d+\.\d+(?:\.\d+){0,2})\b/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(text)) !== null) {
		const code = match[1];
		if (!SPEC_CODE_PATTERN.test(code)) continue;
		const windowStart = Math.max(0, (match.index ?? 0) - 160);
		const windowEnd = Math.min(text.length, (match.index ?? 0) + code.length + 160);
		const context = text.slice(windowStart, windowEnd);
		const htOnly = /\(?\bHT\s*only\b\)?/i.test(context);
		const physicsOnly = /\bphysics\s*only\b/i.test(context);
		if (!codes.has(code)) {
			codes.add(code);
			flags.set(code, { htOnly, physicsOnly });
		} else {
			// Merge flags across occurrences: once flagged, stays flagged.
			const existing = flags.get(code);
			if (existing && (htOnly || physicsOnly)) {
				flags.set(code, {
					htOnly: existing.htOnly || htOnly,
					physicsOnly: existing.physicsOnly || physicsOnly
				});
			}
		}
	}
	return { codes, flags };
}

/** Parse raw spec PDF bytes into a version + code catalogue (shared extraction). */
export async function parseSpecPdfBytes(bytes: Uint8Array): Promise<{
	version: string;
	codes: Set<string>;
	flags: Map<string, SpecFlags>;
	pageCount: number;
	text: string;
}> {
	const parsed = await parsePdfBytes(bytes);
	const version = extractSpecVersion(parsed.textWithMarkers);
	const { codes, flags } = extractSpecCodes(parsed.textWithMarkers);
	return { version, codes, flags, pageCount: parsed.pageCount, text: parsed.textWithMarkers };
}

// --- Fetch ---

export class SpecFetchError extends Error {
	readonly code = SPEC_FETCH_ERROR_CODE;
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = 'SpecFetchError';
	}
}

interface FetchedSpec {
	bytes: Uint8Array | null;
	etag: string | null;
	lastModified: string | null;
	notModified: boolean;
}

function headerValue(headers: Headers, name: string): string | null {
	const value = headers.get(name);
	if (value === null) return null;
	const trimmed = value.trim();
	return trimmed === '' ? null : trimmed;
}

/**
 * Fetch the teacher-supplied spec URL server-side. Validates PDF
 * content-type and enforces the ~10MB cap (via `content-length` pre-check
 * plus actual byte length). Supports conditional refresh: when `known` is
 * given, sends `If-None-Match`/`If-Modified-Since` so an unchanged spec
 * returns `{ notModified: true }` without re-downloading.
 */
async function fetchSpecPdf(
	specUrl: string,
	known?: { etag: string | null; lastModified: string | null }
): Promise<FetchedSpec> {
	let parsed: URL;
	try {
		parsed = new URL(specUrl);
	} catch {
		throw new SpecFetchError(`The exam specification URL is not a valid URL: '${specUrl}'.`);
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new SpecFetchError('The exam specification URL must use http or https.');
	}

	const headers: Record<string, string> = { Accept: 'application/pdf' };
	if (known?.etag) headers['If-None-Match'] = known.etag;
	else if (known?.lastModified) headers['If-Modified-Since'] = known.lastModified;

	let response: Response;
	try {
		response = await fetchTransport(specUrl, { headers });
	} catch (error) {
		throw new SpecFetchError(
			'The exam specification could not be fetched. Check the URL and try again.',
			{ cause: error }
		);
	}

	if (response.status === 304) {
		return {
			bytes: null,
			etag: known?.etag ?? null,
			lastModified: known?.lastModified ?? null,
			notModified: true
		};
	}

	if (!response.ok) {
		throw new SpecFetchError(
			`The exam specification fetch failed with status ${response.status}. Check the URL and try again.`
		);
	}

	const contentType = headerValue(response.headers, 'content-type') ?? '';
	if (!/application\/pdf/i.test(contentType)) {
		throw new SpecFetchError(
			`The exam specification URL did not return a PDF (content-type '${contentType || 'unknown'}'). Link the official spec PDF and try again.`
		);
	}

	const lengthHeader = headerValue(response.headers, 'content-length');
	if (lengthHeader !== null) {
		const declared = Number(lengthHeader);
		if (Number.isFinite(declared) && declared > MAX_SPEC_BYTES) {
			throw new SpecFetchError(
				`The exam specification PDF exceeds the ${MAX_SPEC_BYTES / (1024 * 1024)}MB cap. Link a smaller file and try again.`
			);
		}
	}

	const etag = headerValue(response.headers, 'etag');
	const lastModified = headerValue(response.headers, 'last-modified');

	let buffer: ArrayBuffer;
	try {
		buffer = await response.arrayBuffer();
	} catch (error) {
		throw new SpecFetchError(
			'The exam specification could not be read. Check the URL and try again.',
			{ cause: error }
		);
	}
	if (buffer.byteLength === 0) {
		throw new SpecFetchError('The exam specification PDF is empty. Check the URL and try again.');
	}
	if (buffer.byteLength > MAX_SPEC_BYTES) {
		throw new SpecFetchError(
			`The exam specification PDF exceeds the ${MAX_SPEC_BYTES / (1024 * 1024)}MB cap. Link a smaller file and try again.`
		);
	}
	return { bytes: new Uint8Array(buffer), etag, lastModified, notModified: false };
}

// --- Cache (server-side, in-memory; no TTL) ---

const cache = new Map<string, SpecCatalogueEntry>();

/** Test seam: drop every cached entry. */
export function clearSpecCache(): void {
	cache.clear();
}

/** Inspect cache size in seam tests (entries are never overwritten). */
export function specCacheSize(): number {
	return cache.size;
}

/** Inspect cached keys in seam tests. */
export function specCacheKeys(): string[] {
	return [...cache.keys()];
}

function findCachedForUrl(
	board: string,
	specCode: string,
	tier: string,
	urlHash: string
): SpecCatalogueEntry | undefined {
	let latest: SpecCatalogueEntry | undefined;
	for (const entry of cache.values()) {
		if (
			entry.board === board &&
			entry.specCode === specCode &&
			entry.tier === tier &&
			entry.urlHash === urlHash
		) {
			if (!latest || entry.fetchedAt > latest.fetchedAt) latest = entry;
		}
	}
	return latest;
}

export interface GetSpecInput {
	board: string;
	specCode: string;
	tier: string;
	specUrl: string;
}

/**
 * Fetch-or-cache the exam specification catalogue for a run.
 *
 * - First run for a URL: full fetch → parse (shared extraction) → new entry.
 * - Repeat runs: conditional-GET refresh; `304 Not Modified` reuses the
 *   cached entry without re-parsing. A changed PDF is parsed once and stored
 *   as a new entry when its cover version differs (never an overwrite); the
 *   same version reuses the existing entry.
 * - Refresh-transport failure with a cached entry reuses the stale entry so
 *   a transient blip never trashes a runnable breakdown; without any cache
 *   the failure throws `SpecFetchError` (route → 502 retryable).
 */
export async function getSpecCatalogue(input: GetSpecInput): Promise<SpecCatalogueEntry> {
	const board = input.board.trim();
	const specCode = input.specCode.trim();
	const tier = input.tier.trim();
	const specUrl = input.specUrl.trim();
	const urlHash = urlHashFor(specUrl);

	const cached = findCachedForUrl(board, specCode, tier, urlHash);

	if (!cached) {
		const fetched = await fetchSpecPdf(specUrl);
		if (fetched.notModified || !fetched.bytes) {
			throw new SpecFetchError('The exam specification could not be fetched. Try again.');
		}
		let parsed: Awaited<ReturnType<typeof parseSpecPdfBytes>>;
		try {
			parsed = await parseSpecPdfBytes(fetched.bytes);
		} catch (error) {
			throw new SpecFetchError(
				'The exam specification PDF could not be read. Re-export it without password protection and try again.',
				{ cause: error }
			);
		}
		const key = buildSpecKey(board, specCode, tier, parsed.version, urlHash);
		const entry: SpecCatalogueEntry = {
			key,
			board,
			specCode,
			tier,
			version: parsed.version,
			urlHash,
			sourceUrl: specUrl,
			fetchedAt: new Date().toISOString(),
			etag: fetched.etag,
			lastModified: fetched.lastModified,
			codes: parsed.codes,
			flags: parsed.flags
		};
		cache.set(key, entry);
		return entry;
	}

	// Repeat run: conditional-GET refresh — 304 avoids re-parsing entirely.
	let refreshed: FetchedSpec;
	try {
		refreshed = await fetchSpecPdf(specUrl, {
			etag: cached.etag,
			lastModified: cached.lastModified
		});
	} catch {
		// Transient refresh failure with a cached entry: reuse the stale pin
		// rather than failing a runnable breakdown. First-run failures (no
		// cache) throw above and map to 502.
		return cached;
	}

	if (refreshed.notModified || !refreshed.bytes) return cached;

	let parsed: Awaited<ReturnType<typeof parseSpecPdfBytes>>;
	try {
		parsed = await parseSpecPdfBytes(refreshed.bytes);
	} catch (error) {
		throw new SpecFetchError(
			'The exam specification PDF could not be read. Re-export it without password protection and try again.',
			{ cause: error }
		);
	}

	// Same cover version → same immutable entry (no duplicate, no overwrite).
	if (parsed.version === cached.version) return cached;

	const key = buildSpecKey(board, specCode, tier, parsed.version, urlHash);
	const existing = cache.get(key);
	if (existing) return existing;
	const entry: SpecCatalogueEntry = {
		key,
		board,
		specCode,
		tier,
		version: parsed.version,
		urlHash,
		sourceUrl: specUrl,
		fetchedAt: new Date().toISOString(),
		etag: refreshed.etag,
		lastModified: refreshed.lastModified,
		codes: parsed.codes,
		flags: parsed.flags
	};
	cache.set(key, entry);
	return entry;
}

/** Build the `specRef` a breakdown pins (which catalogue version applied). */
export function specRefFor(entry: SpecCatalogueEntry): SpecRef {
	return {
		board: entry.board,
		specCode: entry.specCode,
		tier: entry.tier,
		version: entry.version,
		urlHash: entry.urlHash
	};
}
