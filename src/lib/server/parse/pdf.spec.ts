import { describe, expect, it } from 'vitest';
import { countPdfPages } from './pdf';
import { buildPdfBytes } from './pdf.spec-helpers';

describe('countPdfPages', () => {
	it('counts pages and leaves the caller’s bytes attached', async () => {
		const bytes = buildPdfBytes(['one', 'two', 'three']);
		const original = bytes.slice();

		expect(await countPdfPages(bytes)).toBe(3);

		// pdf.js detaches the buffer it parses, so the copy must happen inside.
		expect(bytes.byteLength).toBe(original.byteLength);
		expect(Array.from(bytes)).toEqual(Array.from(original));
	});

	it('counts a Node Buffer without detaching its backing storage', async () => {
		// Buffer#slice returns a view, so a copy must not dispatch through the
		// caller's subclass or pdf.js would detach the caller's buffer.
		const bytes = Buffer.from(buildPdfBytes(['one', 'two']));

		expect(await countPdfPages(bytes)).toBe(2);
		expect(bytes.byteLength).toBeGreaterThan(0);
	});

	it('rejects a file that is not a readable PDF', async () => {
		await expect(countPdfPages(new TextEncoder().encode('not a pdf'))).rejects.toThrow(
			'PDF could not be read'
		);
	});
});
