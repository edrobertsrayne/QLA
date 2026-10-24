// Contract tests for the shared PDF intake: the branches the parse and match
// routes cannot reach because their own request validation answers first.

import { describe, expect, it } from 'vitest';
import {
	MAX_TOTAL_PAGES,
	checkPdfUploads,
	readPdfUploads,
	type CheckedPdf,
	type PdfUploadFailure,
	type UploadedPdf
} from './pdf-upload';
import { buildPdfBytes } from './parse/pdf.spec-helpers';

function pdfFile(name: string, pageCount: number, textPrefix = 'QLA page'): File {
	const pages = Array.from({ length: pageCount }, (_, i) => `${textPrefix} ${i + 1}`);
	return new File([buildPdfBytes(pages) as unknown as BlobPart], name, { type: 'application/pdf' });
}

function expectChecked(result: CheckedPdf[] | PdfUploadFailure): CheckedPdf[] {
	if (!Array.isArray(result)) throw new Error(`expected checked uploads, got '${result.kind}'`);
	return result;
}

function expectUploads(result: UploadedPdf[] | PdfUploadFailure): UploadedPdf[] {
	if (!Array.isArray(result)) throw new Error(`expected uploads, got '${result.kind}'`);
	return result;
}

describe('checkPdfUploads', () => {
	it('treats a field holding a string as absent under any', () => {
		const form = new FormData();
		form.set('paper', 'hello');

		expect(checkPdfUploads(form, ['paper'], 'any')).toEqual({
			kind: 'missing',
			fields: ['paper']
		});
	});

	it('names the absent field under all', () => {
		const form = new FormData();
		form.set('paper', 'hello');
		form.set('markscheme', pdfFile('markscheme.pdf', 1));

		expect(checkPdfUploads(form, ['paper', 'markscheme'], 'all')).toEqual({
			kind: 'missing',
			fields: ['paper']
		});
	});

	it('treats a zero-byte file as absent', () => {
		const form = new FormData();
		form.set('paper', new File([], 'empty.pdf', { type: 'application/pdf' }));

		expect(checkPdfUploads(form, ['paper'], 'any')).toEqual({
			kind: 'missing',
			fields: ['paper']
		});
	});

	it('accepts one file under any and both under all', () => {
		const form = new FormData();
		form.set('paper', pdfFile('paper.pdf', 1));
		form.set('markscheme', pdfFile('markscheme.pdf', 1));

		const any = expectChecked(checkPdfUploads(form, ['paper'], 'any'));
		expect(any.map(({ field }) => field)).toEqual(['paper']);

		const all = expectChecked(checkPdfUploads(form, ['paper', 'markscheme'], 'all'));
		expect(all.map(({ field }) => field)).toEqual(['paper', 'markscheme']);
	});
});

describe('readPdfUploads', () => {
	it('accepts a page count exactly at the ceiling', async () => {
		const form = new FormData();
		form.set('paper', pdfFile('paper.pdf', MAX_TOTAL_PAGES));

		const uploads = expectUploads(
			await readPdfUploads(expectChecked(checkPdfUploads(form, ['paper'], 'any')))
		);

		expect(uploads.map(({ pageCount }) => pageCount)).toEqual([MAX_TOTAL_PAGES]);
	});

	it('refuses a total one page over the ceiling', async () => {
		const form = new FormData();
		form.set('paper', pdfFile('paper.pdf', MAX_TOTAL_PAGES + 1));

		const result = await readPdfUploads(expectChecked(checkPdfUploads(form, ['paper'], 'any')));

		expect(result).toEqual({ kind: 'too-many-pages', totalPages: MAX_TOTAL_PAGES + 1 });
	});

	it('returns uploads in the field list order', async () => {
		const form = new FormData();
		form.set('second', pdfFile('second.pdf', 1, 'second'));
		form.set('first', pdfFile('first.pdf', 2, 'first'));

		const uploads = expectUploads(
			await readPdfUploads(expectChecked(checkPdfUploads(form, ['first', 'second'], 'any')))
		);

		expect(uploads.map(({ field, filename }) => [field, filename])).toEqual([
			['first', 'first.pdf'],
			['second', 'second.pdf']
		]);
	});

	it('names the field of an unreadable file', async () => {
		const form = new FormData();
		form.set('paper', pdfFile('paper.pdf', 1));
		form.set('markscheme', new File(['not a pdf'], 'fake.pdf', { type: 'application/pdf' }));

		const result = await readPdfUploads(
			expectChecked(checkPdfUploads(form, ['paper', 'markscheme'], 'all'))
		);

		expect(result).toEqual({ kind: 'unreadable', field: 'markscheme', filename: 'fake.pdf' });
	});
});
