import { unzipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { cleanup } from 'vitest-browser-svelte';
import { captureDownload } from '$lib/marksheet/download.spec-helpers.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import { seed } from '$lib/marksheet/fixtures.spec-helpers.js';
import { sentHtml, stubPdfFetch } from '../pdf.spec-helpers.js';
import { openPage } from '../spec-helpers.js';
import ReportsPage from './+page.svelte';
import { plain, writeFor } from './reports.spec-helpers.js';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

/** The students' ids a posted document holds a page for, in page order. */
function pagesOf(html: string): string[] {
	return [...html.matchAll(/data-report-id="([^"]+)"/g)].map((match) => match[1]);
}

function openWritten(ids: string[]) {
	const doc = plain();
	writeFor(doc, ids);
	seed(doc);
	const stub = stubPdfFetch();
	openPage(ReportsPage);
	return stub;
}

describe('report PDF downloads', () => {
	it('downloads one report as a PDF of just that page', async () => {
		const stub = openWritten(['ada', 'bo']);
		await expect.element(page.getByRole('button', { name: 'Print all 2' })).toBeInTheDocument();
		const file = captureDownload();

		await page.getByRole('button', { name: 'Download PDF' }).first().click();

		await vi.waitFor(() =>
			expect(file.filename()).toMatch(/^qla-report-10x-ph1-ada-lovelace-\d{4}-\d\d-\d\d\.pdf$/)
		);
		const [html] = sentHtml(stub);
		expect(pagesOf(html)).toEqual(['ada']);
		expect(html).toContain('Lovelace');
		expect(html).not.toContain('Brown');
		// The print stylesheet travels with the markup, so the PDF is laid out as Print is.
		expect(html).toContain('print-color-adjust');
		expect(await file.text()).toBe('%PDF-1.4 stub');
		// A download is not a backup.
		expect(marksheetStore().document?.lastExportedAt).toBeNull();
	});

	it('downloads every visible report as one PDF in review order', async () => {
		const doc = plain();
		writeFor(doc, ['ada', 'bo', 'fay']);
		// Fay's report is kept with her edits but hidden once she is absent, and never sent.
		const fay = doc.students.find((candidate) => candidate.id === 'fay');
		if (fay) fay.absent = true;
		seed(doc);
		const stub = stubPdfFetch();
		openPage(ReportsPage);
		await expect.element(page.getByRole('button', { name: 'Print all 2' })).toBeInTheDocument();
		const file = captureDownload();

		await page.getByRole('button', { name: 'Download all 2' }).click();
		await page.getByRole('button', { name: 'One PDF' }).click();

		await vi.waitFor(() =>
			expect(file.filename()).toMatch(/^qla-reports-10x-ph1-\d{4}-\d\d-\d\d\.pdf$/)
		);
		expect(sentHtml(stub)).toHaveLength(1);
		expect(pagesOf(sentHtml(stub)[0])).toEqual(['ada', 'bo']);
	});

	it('downloads separate PDFs in a zip, one correctly named file per student', async () => {
		const stub = openWritten(['ada', 'bo']);
		await expect.element(page.getByRole('button', { name: 'Print all 2' })).toBeInTheDocument();
		const file = captureDownload();

		await page.getByRole('button', { name: 'Download all 2' }).click();
		await page.getByRole('button', { name: 'Separate PDFs (zip)' }).click();

		await vi.waitFor(() =>
			expect(file.filename()).toMatch(/^qla-reports-10x-ph1-\d{4}-\d\d-\d\d\.zip$/)
		);
		expect(sentHtml(stub).map(pagesOf)).toEqual([['ada'], ['bo']]);
		const zip = unzipSync(new Uint8Array(await (await blobOf()).arrayBuffer()));
		expect(Object.keys(zip).map((name) => name.replace(/\d{4}-\d\d-\d\d/, 'DAY'))).toEqual([
			'qla-report-10x-ph1-ada-lovelace-DAY.pdf',
			'qla-report-10x-ph1-bo-brown-DAY.pdf'
		]);
	});

	it('inlines the fonts once for a whole zip, not once per student', async () => {
		const stub = openWritten(['ada', 'bo']);
		await expect.element(page.getByRole('button', { name: 'Print all 2' })).toBeInTheDocument();
		const file = captureDownload();

		await page.getByRole('button', { name: 'Download all 2' }).click();
		await page.getByRole('button', { name: 'Separate PDFs (zip)' }).click();

		await vi.waitFor(() => expect(file.filename()).toMatch(/\.zip$/));
		expect(sentHtml(stub)).toHaveLength(2);
		const fonts = stub.mock.calls
			.map(([url]) => String(url))
			.filter((url) => /\.woff2?(\?|$)/.test(url));
		expect(fonts.length).toBeGreaterThan(0);
		expect(new Set(fonts).size).toBe(fonts.length);
	});

	it('asks first, as Print does, when a report is out of date', async () => {
		const doc = plain();
		writeFor(doc, ['ada']);
		doc.marks['ada'] = { 'entry-1': 1, 'entry-2': 1 };
		seed(doc);
		const stub = stubPdfFetch();
		openPage(ReportsPage);
		await expect.element(page.getByRole('button', { name: 'Print all 1' })).toBeInTheDocument();
		captureDownload();

		await page.getByRole('button', { name: 'Download PDF' }).click();

		const dialog = page.getByRole('dialog', { name: 'Out-of-date reports' });
		await expect.element(dialog).toBeInTheDocument();
		await expect.element(dialog).toHaveTextContent('Download anyway?');
		expect(sentHtml(stub)).toHaveLength(0);

		await dialog.getByRole('button', { name: 'Download anyway' }).click();
		await vi.waitFor(() => expect(sentHtml(stub)).toHaveLength(1));
	});

	it('shows progress, then an error toast and an unchanged page when the server fails', async () => {
		const doc = plain();
		writeFor(doc, ['ada']);
		seed(doc);
		let release: () => void = () => undefined;
		const gate = new Promise<void>((resolve) => (release = resolve));
		stubPdfFetch(async () => {
			await gate;
			return Response.json(
				{ error: { code: 'PDF_RENDER_TIMEOUT', message: 'The PDF took too long to render.' } },
				{ status: 504 }
			);
		});
		openPage(ReportsPage);
		await expect.element(page.getByRole('button', { name: 'Print all 1' })).toBeInTheDocument();
		const file = captureDownload();

		await page.getByRole('button', { name: 'Download PDF' }).click();
		await expect.element(page.getByRole('button', { name: 'Preparing PDF…' })).toBeDisabled();
		release();

		await expect.element(page.getByRole('button', { name: 'Download PDF' })).toBeEnabled();
		expect(file.filename()).toBe('');
	});
});

/** The blob the last download handed the browser. */
async function blobOf(): Promise<Blob> {
	const calls = vi.mocked(URL.createObjectURL).mock.calls;
	const blob = calls[0]?.[0];
	if (!(blob instanceof Blob)) throw new Error('nothing was handed to the browser');
	return blob;
}
