// The spec download's one real connection: an http(s) GET that connects to the
// address the SSRF guard already checked, never to one it resolves itself.
//
// `fetch` resolves the hostname again on its own, so a hostile DNS server could
// answer the guard with a public address and the connection with loopback
// (DNS rebinding). Here the checked address is handed to the socket as its
// `lookup`, so resolution and connection cannot disagree, while the URL's
// hostname still drives SNI, certificate verification and the Host header.
// Redirects are never followed: the caller re-checks each hop's address.

import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import { Readable } from 'node:stream';

/** An address that passed the SSRF guard. */
export interface CheckedAddress {
	address: string;
	family: number;
}

/** What one hop of the spec download needs: where to connect, what to send and when to give up. */
export interface SpecFetchInit {
	address: CheckedAddress;
	headers: Record<string, string>;
	signal: AbortSignal;
}

/** Fetch seam for the spec download: tests inject a mocked fetch. */
export type SpecFetch = (url: string, init: SpecFetchInit) => Promise<Response>;

/** Statuses a `Response` may not carry a body for. */
const NO_BODY_STATUSES = new Set([101, 204, 205, 304]);

function toResponse(message: http.IncomingMessage): Response {
	const headers = new Headers();
	for (const [name, value] of Object.entries(message.headers)) {
		if (value === undefined) continue;
		for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
	}
	const status = message.statusCode ?? 502;
	const body = NO_BODY_STATUSES.has(status)
		? null
		: (Readable.toWeb(message) as ReadableStream<Uint8Array>);
	return new Response(body, { status, headers });
}

export const pinnedFetch: SpecFetch = (url, { address, headers, signal }) => {
	const target = new URL(url);
	const lookup: LookupFunction = (_hostname, options, callback) => {
		if (options.all) callback(null, [address]);
		else callback(null, address.address, address.family);
	};
	return new Promise((resolve, reject) => {
		const request = (target.protocol === 'https:' ? https : http).request(
			target,
			{ headers, signal, lookup },
			(message) => resolve(toResponse(message))
		);
		request.on('error', reject);
		request.end();
	});
};
