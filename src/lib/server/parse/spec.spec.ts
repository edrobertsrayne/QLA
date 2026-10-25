// The spec download connects to the address the SSRF guard checked: a host
// that answers the guard with a public address and anything later with
// loopback (DNS rebinding) is never reached on loopback.

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
	fetchSpecPdf,
	resetDnsLookup,
	resetSpecFetch,
	setDnsLookup,
	setSpecFetch,
	SpecUnreadableError
} from './spec';
import { pinnedFetch, type CheckedAddress } from './spec-fetch';

const PUBLIC: CheckedAddress = { address: '93.184.216.34', family: 4 };
const LOOPBACK: CheckedAddress = { address: '127.0.0.1', family: 4 };

afterEach(() => {
	resetDnsLookup();
	resetSpecFetch();
});

/** A resolver that answers each host with `first` once, then loopback. */
function rebindingLookup() {
	const lookups: string[] = [];
	setDnsLookup(async (hostname) => {
		const seen = lookups.filter((host) => host === hostname).length;
		lookups.push(hostname);
		return [seen === 0 ? PUBLIC : LOOPBACK];
	});
	return lookups;
}

describe('fetchSpecPdf address pinning', () => {
	it('connects every hop to the address it checked and never resolves the host again', async () => {
		const lookups = rebindingLookup();
		const connected: [string, CheckedAddress][] = [];
		setSpecFetch(async (url, { address }) => {
			connected.push([url, address]);
			return connected.length === 1
				? new Response(null, { status: 302, headers: { location: 'http://b.example/spec.pdf' } })
				: new Response('gone', { status: 404 });
		});

		await expect(fetchSpecPdf(new URL('http://a.example/spec.pdf'), false)).rejects.toBeInstanceOf(
			SpecUnreadableError
		);

		expect(connected).toEqual([
			['http://a.example/spec.pdf', PUBLIC],
			['http://b.example/spec.pdf', PUBLIC]
		]);
		expect(lookups).toEqual(['a.example', 'b.example']);
	});
});

describe('pinnedFetch', () => {
	let server: Server | undefined;
	afterEach(() => new Promise<void>((done) => (server ? server.close(() => done()) : done())));

	async function listen(handler: Parameters<typeof createServer>[1]): Promise<number> {
		server = createServer(handler);
		await new Promise<void>((ready) => server!.listen(0, '127.0.0.1', ready));
		return (server.address() as AddressInfo).port;
	}

	it('connects to the given address whatever the hostname resolves to, keeping the hostname as Host', async () => {
		let host: string | undefined;
		const port = await listen((request, response) => {
			host = request.headers.host;
			response.end('spec bytes');
		});

		// `spec.invalid` cannot resolve: only the pinned address can be connected to.
		const response = await pinnedFetch(`http://spec.invalid:${port}/spec.pdf`, {
			address: LOOPBACK,
			headers: { Accept: 'application/pdf' },
			signal: AbortSignal.timeout(5000)
		});

		expect(response.status).toBe(200);
		expect(await response.text()).toBe('spec bytes');
		expect(host).toBe(`spec.invalid:${port}`);
	});

	it('hands a redirect back instead of following it', async () => {
		const port = await listen((_request, response) => {
			response.writeHead(302, { location: 'http://elsewhere.invalid/' }).end();
		});

		const response = await pinnedFetch(`http://spec.invalid:${port}/`, {
			address: LOOPBACK,
			headers: {},
			signal: AbortSignal.timeout(5000)
		});

		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('http://elsewhere.invalid/');
	});
});
