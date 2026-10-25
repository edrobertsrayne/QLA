import { describe, expect, it } from 'vitest';
import { readCappedText } from './request-fields';

const CAP = 100;

function post(body: BodyInit, headers: Record<string, string> = {}): Request {
	return new Request('http://localhost/x', {
		method: 'POST',
		body,
		headers,
		duplex: 'half'
	} as RequestInit);
}

describe('readCappedText', () => {
	it('accepts a body exactly at the cap and refuses one byte over, counting bytes not characters', async () => {
		expect(await readCappedText(post('a'.repeat(CAP)), CAP)).toBe('a'.repeat(CAP));
		expect(await readCappedText(post('a'.repeat(CAP + 1)), CAP)).toBeNull();
		// 51 two-byte characters: 51 characters but 102 bytes.
		expect(await readCappedText(post('é'.repeat(51)), CAP)).toBeNull();
	});

	it('refuses a declared length over the cap without reading the body', async () => {
		let pulled = false;
		const stream = new ReadableStream<Uint8Array>(
			{
				pull(controller) {
					pulled = true;
					controller.close();
				}
			},
			{ highWaterMark: 0 }
		);

		const text = await readCappedText(post(stream, { 'content-length': String(CAP + 1) }), CAP);

		expect(text).toBeNull();
		expect(pulled).toBe(false);
	});

	it('cancels a stream that outgrows the cap rather than draining it', async () => {
		let sent = 0;
		let cancelled = false;
		const stream = new ReadableStream<Uint8Array>(
			{
				pull(controller) {
					sent += 1;
					controller.enqueue(new Uint8Array(60).fill(120));
					if (sent > 1000) controller.close();
				},
				cancel() {
					cancelled = true;
				}
			},
			{ highWaterMark: 0 }
		);

		expect(await readCappedText(post(stream), CAP)).toBeNull();
		expect(cancelled).toBe(true);
		expect(sent).toBeLessThan(10);
	});
});
