// Contract tests for `POST /api/pdf`, against the real headless Chromium.
//
// HTML in, a PDF out. The route's hardening is what is asserted: the payload
// cannot reach the network (a local server counts every request that does),
// cannot run scripts, and an oversized body is refused before it is rendered.

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getDocumentProxy, extractText } from 'unpdf';
import { POST } from './+server';
import { MAX_CONCURRENT_PDF_RENDERS, MAX_PDF_HTML_BYTES, closePdfBrowser } from '$lib/server/pdf';

function post(html: string | ReadableStream<Uint8Array>): Promise<Response> {
	const request = new Request('http://localhost/api/pdf', {
		method: 'POST',
		headers: { 'Content-Type': 'text/html' },
		body: html,
		// @ts-expect-error Node's fetch requires half duplex for a streamed body.
		duplex: 'half'
	});
	return POST({ request } as Parameters<typeof POST>[0]) as Promise<Response>;
}

async function textOf(response: Response): Promise<{ pages: number; text: string }> {
	const pdf = await getDocumentProxy(new Uint8Array(await response.arrayBuffer()));
	const { totalPages, text } = await extractText(pdf, { mergePages: true });
	return { pages: totalPages, text };
}

afterAll(closePdfBrowser);
afterEach(() => vi.restoreAllMocks());

describe('POST /api/pdf', () => {
	it('renders selectable text, one A4 page per print page', async () => {
		const response = await post(
			`<style>@page{size:A4;margin:0}body{margin:0}.p{height:297mm;break-after:page}.p:last-child{break-after:auto}</style>
			 <div class="p">First page text</div><div class="p">Second page text</div>`
		);

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('application/pdf');
		const { pages, text } = await textOf(response);
		expect(pages).toBe(2);
		expect(text).toContain('First page text');
		expect(text).toContain('Second page text');
	});

	it('applies print-media CSS', async () => {
		const response = await post(
			'<style>@media print{.hide{display:none}}</style><p class="hide">screen only</p><p>shown</p>'
		);

		const { text } = await textOf(response);
		expect(text).toContain('shown');
		expect(text).not.toContain('screen only');
	});

	it('refuses renders beyond the concurrency limit with a retryable 503, and serves them again after', async () => {
		const extra = 2;
		const responses = await Promise.all(
			Array.from({ length: MAX_CONCURRENT_PDF_RENDERS + extra }, () => post('<p>busy</p>'))
		);

		const statuses = responses.map((response) => response.status).sort();
		expect(statuses).toEqual([
			...Array<number>(MAX_CONCURRENT_PDF_RENDERS).fill(200),
			...Array<number>(extra).fill(503)
		]);
		const refused = responses.find((response) => response.status === 503);
		expect(await refused?.json()).toMatchObject({
			error: { code: 'PDF_BUSY', retryable: true }
		});
		expect((await post('<p>again</p>')).status).toBe(200);
	});

	describe('hardening', () => {
		let external: Server;
		let origin: string;
		const hits: string[] = [];

		beforeAll(async () => {
			external = createServer((request, response) => {
				hits.push(request.url ?? '');
				response.writeHead(200, { 'Content-Type': 'text/css' }).end('p{color:red}');
			});
			await new Promise<void>((resolve) => external.listen(0, '127.0.0.1', resolve));
			origin = `http://127.0.0.1:${(external.address() as AddressInfo).port}`;
		});
		afterAll(() => new Promise((resolve) => external.close(resolve)));

		it('makes no outbound request for an external image, stylesheet or frame', async () => {
			hits.length = 0;
			const response = await post(
				`<link rel="stylesheet" href="${origin}/style.css">
				 <img src="${origin}/pixel.png">
				 <iframe src="${origin}/frame.html"></iframe>
				 <p style="background:url(${origin}/bg.png)">still renders</p>`
			);

			expect(response.status).toBe(200);
			expect((await textOf(response)).text).toContain('still renders');
			expect(hits).toEqual([]);
		});

		it('does not run scripts in the payload', async () => {
			hits.length = 0;
			const response = await post(
				`<p id="out">before</p><script>document.getElementById('out').textContent='after';fetch('${origin}/beacon')</script>`
			);

			const { text } = await textOf(response);
			expect(text).toContain('before');
			expect(text).not.toContain('after');
			expect(hits).toEqual([]);
		});

		it('refuses an oversized body without rendering it', async () => {
			const response = await post('x'.repeat(MAX_PDF_HTML_BYTES + 1));

			expect(response.status).toBe(413);
			expect((await response.json()).error.code).toBe('INVALID_PDF_INPUT');
		});

		it('stops reading a body that outgrows the cap whatever it declares', async () => {
			const chunk = new Uint8Array(1024 * 1024).fill(120);
			let sent = 0;
			const stream = new ReadableStream<Uint8Array>({
				pull(controller) {
					sent += 1;
					controller.enqueue(chunk);
					if (sent > 64) controller.close();
				}
			});

			const response = await post(stream);

			expect(response.status).toBe(413);
			expect(sent).toBeLessThan(64);
		});

		it('refuses an empty body', async () => {
			expect((await post('  ')).status).toBe(400);
		});

		it('never logs the body', async () => {
			const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
				vi.spyOn(console, method)
			);

			await post('<p>secret student feedback</p>');
			await post('x'.repeat(MAX_PDF_HTML_BYTES + 1));

			for (const spy of spies) {
				expect(JSON.stringify(spy.mock.calls)).not.toContain('secret student feedback');
			}
		});
	});
});
