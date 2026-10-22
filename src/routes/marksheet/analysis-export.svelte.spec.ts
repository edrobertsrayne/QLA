import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { cleanup } from 'vitest-browser-svelte';
import { captureDownload } from '$lib/marksheet/download.spec-helpers.js';
import { confirmed, entry, seed, student } from '$lib/marksheet/fixtures.spec-helpers.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import { sentHtml, stubPdfFetch } from '../pdf.spec-helpers.js';
import { openPage } from '../spec-helpers.js';
import './marksheet.spec-helpers.js';
import AnalysisPage from './analysis/+page.svelte';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

/** Red (1a), green (1b), not scored (1c): every band the analysis shows. */
function seedAnalysis() {
	seed(
		confirmed({
			breakdown: {
				entries: [
					entry('entry-1', '1a', '1', {
						marks: 4,
						summary: 'Red question',
						specPoint: null,
						ao: null
					}),
					entry('entry-2', '1b', '1', {
						marks: 4,
						summary: 'Green question',
						specPoint: null,
						ao: null
					}),
					entry('entry-3', '1c', '1', {
						marks: 4,
						summary: 'Unmarked question',
						specPoint: null,
						ao: null
					})
				],
				warnings: [],
				aoDescriptions: {}
			},
			students: [student('s1', 'Ada', 'Lovelace'), student('s2', 'Grace', 'Hopper')],
			marks: { s1: { 'entry-1': 0, 'entry-2': 4 }, s2: { 'entry-1': 1, 'entry-2': 4 } }
		})
	);
	// The analysis route, as the router opens it.
	openPage(AnalysisPage, { data: { entry: null } });
}

async function openAnalysis() {
	await expect.element(page.getByTestId('analysis-view')).toBeInTheDocument();
}

describe('analysis export', () => {
	it('downloads the figures as a CSV and leaves the backup alone', async () => {
		seedAnalysis();
		await openAnalysis();
		const file = captureDownload();

		await page.getByRole('button', { name: 'Download CSV' }).click();

		expect(file.filename()).toMatch(/^qla-analysis-10x-ph1-\d{4}-\d\d-\d\d\.csv$/);
		const lines = (await file.text()).trim().split('\r\n');
		expect(lines).toHaveLength(4);
		expect(lines[1]).toBe('1a,1,Red question,4,,,13,0.50,red,2,2,no,0,');
		expect(lines[3]).toContain('Unmarked question');
		expect(lines[3]).toMatch(/,,,,0,2,no,0,Not marked yet$/);
		expect(marksheetStore().document?.lastExportedAt).toBeNull();
	});

	it('sends the whole analysis to the PDF route while green is folded away', async () => {
		seedAnalysis();
		const stub = stubPdfFetch();
		await openAnalysis();
		expect(document.querySelector('[data-entry-id="entry-2"]')).toBeNull();
		const file = captureDownload();

		await page.getByRole('button', { name: 'Download PDF' }).click();

		await vi.waitFor(() =>
			expect(file.filename()).toMatch(/^qla-analysis-10x-ph1-\d{4}-\d\d-\d\d\.pdf$/)
		);
		const [html] = sentHtml(stub);
		for (const summary of ['Red question', 'Green question', 'Unmarked question']) {
			expect(html).toContain(summary);
		}
		// What was open on screen is what it was before.
		expect(document.querySelector('[data-entry-id="entry-2"]')).toBeNull();
		expect(marksheetStore().document?.lastExportedAt).toBeNull();
	});
});
