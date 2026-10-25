// What counts as an unreadable upload: only pdf.js refusing the bytes. Anything
// else that goes wrong during intake is a bug and must reach the server 500 path.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const pdfjs = vi.hoisted(() => ({
	getDocumentProxy: vi.fn(),
	extractText: vi.fn()
}));
vi.mock('unpdf', () => pdfjs);

import { readPdfUploads } from '../pdf-upload';
import { countPdfPages, parsePdfBytes, PdfUnreadableError } from './pdf';

const bytes = new Uint8Array([37, 80, 68, 70]);
const checked = [{ field: 'assessmentPaper', file: new File([bytes], 'paper.pdf') }];

beforeEach(() => {
	pdfjs.getDocumentProxy.mockReset();
	pdfjs.extractText.mockReset();
});

describe('PdfUnreadableError', () => {
	it('is what pdf.js refusing the bytes becomes, at both stages, keeping the cause', async () => {
		const cause = new Error('Invalid PDF structure.');
		pdfjs.getDocumentProxy.mockRejectedValue(cause);
		pdfjs.extractText.mockRejectedValue(cause);

		await expect(countPdfPages(bytes)).rejects.toMatchObject({
			constructor: PdfUnreadableError,
			cause
		});
		await expect(parsePdfBytes(bytes)).rejects.toMatchObject({
			constructor: PdfUnreadableError,
			cause
		});
	});

	it('refuses the upload as unreadable', async () => {
		pdfjs.getDocumentProxy.mockRejectedValue(new Error('Invalid PDF structure.'));

		expect(await readPdfUploads(checked)).toMatchObject({
			kind: 'unreadable',
			field: 'assessmentPaper'
		});
	});
});

describe('an unexpected failure during intake', () => {
	it('is not reported as an unreadable upload', async () => {
		const bug = new TypeError('cleanup is broken');
		pdfjs.getDocumentProxy.mockResolvedValue({
			numPages: 1,
			loadingTask: { destroy: () => Promise.reject(bug) }
		});

		await expect(readPdfUploads(checked)).rejects.toBe(bug);
	});
});
