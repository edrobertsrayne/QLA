import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { cleanup } from 'vitest-browser-svelte';
import { captureDownload } from '$lib/marksheet/download.spec-helpers.js';
import { confirmed, entry, seed, student, tier } from '$lib/marksheet/fixtures.spec-helpers.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import { sentHtml, stubPdfFetch } from '../pdf.spec-helpers.js';
import { openAnalysisAt, parseCsv, seedTwoTierAnalysis } from './analysis.spec-helpers.js';
import './marksheet.spec-helpers.js';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

/** Red (1a), green (1b), not scored (1c): every band the single-tier analysis shows. */
function seedSingleTierExport(): void {
	seed(
		confirmed({
			tiers: [
				tier({
					breakdown: {
						entries: [
							entry('entry-red', '1a', '1', {
								marks: 4,
								summary: 'Red question',
								specPoint: null,
								ao: null
							}),
							entry('entry-green', '1b', '1', {
								marks: 4,
								summary: 'Green question',
								specPoint: null,
								ao: null
							}),
							entry('entry-unmarked', '1c', '1', {
								marks: 4,
								summary: 'Unmarked question',
								specPoint: null,
								ao: null
							})
						],
						warnings: []
					}
				})
			],
			students: [student('s1', 'Ada', 'Lovelace'), student('s2', 'Grace', 'Hopper')],
			marks: { s1: { 'entry-red': 0, 'entry-green': 4 }, s2: { 'entry-red': 1, 'entry-green': 4 } }
		})
	);
}

async function openAnalysis() {
	await expect.element(page.getByTestId('analysis-view')).toBeInTheDocument();
}

describe('analysis export', () => {
	it('follows the open tier tab with today’s analysis CSV', async () => {
		seedTwoTierAnalysis();
		openAnalysisAt();
		await openAnalysis();

		const tier1 = captureDownload();
		await page.getByRole('button', { name: 'Download CSV' }).click();

		expect(tier1.filename()).toMatch(/^qla-analysis-10x-ph1-\d{4}-\d\d-\d\d\.csv$/);
		const higher = parseCsv(await tier1.text());
		expect(higher.map((row) => row[0]).slice(1)).toEqual(['1a', '1b', '1c', '1d']);
		expect(higher[2][0]).toBe('1b');
		expect(higher[2][6]).toBe('10');
		expect(higher[2][8]).toBe('red');
		expect(await tier1.text()).not.toContain('8a');

		await page.getByRole('radio', { name: 'Tier 2 · Foundation' }).click();
		await vi.waitFor(() => expect(document.querySelector('[data-entry-id="f-a"]')).not.toBeNull());
		const tier2 = captureDownload();
		await page.getByRole('button', { name: 'Download CSV' }).click();

		const foundation = parseCsv(await tier2.text());
		expect(foundation.map((row) => row[0]).slice(1)).toEqual(['8a', '8b', '8c', '8d']);
		expect(foundation[1][6]).toBe('50');
		expect(await tier2.text()).not.toContain('1a');

		// A data export leaves the backup's age alone.
		expect(marksheetStore().document?.lastExportedAt).toBeNull();
	});

	it('exports the common questions in Tier 1 paper order with the fixed columns', async () => {
		seedTwoTierAnalysis();
		const screen = openAnalysisAt('?tier=common');
		await openAnalysis();

		// The view opens by biggest gap, so the first line shown is not the first row exported.
		expect(screen.container.querySelector('[data-testid="common-row"]')?.textContent).toContain(
			'1b ↔ 8b'
		);

		const file = captureDownload();
		await page.getByRole('button', { name: 'Download CSV' }).click();

		expect(file.filename()).toMatch(/^qla-common-questions-10x-ph1-\d{4}-\d\d-\d\d\.csv$/);
		const rows = parseCsv(await file.text());
		expect(rows[0]).toEqual([
			'Higher question',
			'Foundation question',
			'Summary',
			'Available marks',
			'Spec point',
			'AO',
			'Higher facility %',
			'Higher band',
			'Higher marked',
			'Higher of',
			'Foundation facility %',
			'Foundation band',
			'Foundation marked',
			'Foundation of',
			'Pooled facility %',
			'Pooled band',
			'Gap (Higher − Foundation, points)',
			'Part-marked'
		]);
		expect(rows.slice(1).map((row) => row[0])).toEqual(['1a', '1b', '1c', '1d']);
		expect(rows[1]).toEqual([
			'1a',
			'8a',
			'Shared one',
			'10',
			'3.2.1.4',
			'AO2',
			'70',
			'green',
			'2',
			'2',
			'50',
			'amber',
			'2',
			'2',
			'60',
			'amber',
			'20',
			'no'
		]);
		// Foundation has no mark on the pair: its figures, the pooled figure and the gap are empty.
		expect(rows[4]).toEqual([
			'1d',
			'8d',
			'Higher only',
			'10',
			'3.2.1.4',
			'AO2',
			'40',
			'amber',
			'2',
			'2',
			'',
			'',
			'0',
			'2',
			'',
			'',
			'',
			'no'
		]);
		expect(marksheetStore().document?.lastExportedAt).toBeNull();
	});

	it('prints the open tab with green unfolded, then folds it back', async () => {
		seedSingleTierExport();
		openAnalysisAt();
		await openAnalysis();
		expect(document.querySelector('[data-entry-id="entry-green"]')).toBeNull();

		let printed = '';
		const print = vi.spyOn(window, 'print').mockImplementation(() => {
			printed = document.body.textContent ?? '';
		});

		await page.getByRole('button', { name: 'Print' }).click();

		await vi.waitFor(() => expect(print).toHaveBeenCalledTimes(1));
		expect(printed).toContain('Green question');
		// What was folded on screen is folded again once the print is handed over.
		expect(document.querySelector('[data-entry-id="entry-green"]')).toBeNull();
	});

	it('sends the open tier tab to the PDF route, green unfolded and no other tier', async () => {
		seedTwoTierAnalysis();
		const stub = stubPdfFetch();
		openAnalysisAt('?tier=0');
		await openAnalysis();
		expect(document.querySelector('[data-entry-id="e-a"]')).toBeNull();
		const file = captureDownload();

		await page.getByRole('button', { name: 'Download PDF' }).click();

		await vi.waitFor(() =>
			expect(file.filename()).toMatch(/^qla-analysis-10x-ph1-\d{4}-\d\d-\d\d\.pdf$/)
		);
		const [html] = sentHtml(stub);
		expect(html).toContain('Shared one');
		expect(html).toContain('Shared two');
		expect(html).not.toContain('Foundation one');
		// The screen is left as the teacher had it.
		expect(document.querySelector('[data-entry-id="e-a"]')).toBeNull();
		expect(marksheetStore().document?.lastExportedAt).toBeNull();
	});

	it('sends the common tab, not a tier, to the PDF route', async () => {
		seedTwoTierAnalysis();
		const stub = stubPdfFetch();
		openAnalysisAt('?tier=common');
		await openAnalysis();
		const file = captureDownload();

		await page.getByRole('button', { name: 'Download PDF' }).click();

		await vi.waitFor(() =>
			expect(file.filename()).toMatch(/^qla-analysis-10x-ph1-\d{4}-\d\d-\d\d\.pdf$/)
		);
		const [html] = sentHtml(stub);
		expect(html).toContain('Common questions — Higher and Foundation');
		expect(html).toContain('1a ↔ 8a');
		expect(html).toContain('Gap = Higher − Foundation, points.');
		expect(html).not.toContain('Red — below 40%');
	});

	it('gives a single-tier assessment today’s analysis CSV and PDF', async () => {
		seedSingleTierExport();
		openAnalysisAt();
		await openAnalysis();

		const csv = captureDownload();
		await page.getByRole('button', { name: 'Download CSV' }).click();

		expect(csv.filename()).toMatch(/^qla-analysis-10x-ph1-\d{4}-\d\d-\d\d\.csv$/);
		const rows = parseCsv(await csv.text());
		expect(rows).toHaveLength(4);
		expect(rows[1]).toEqual([
			'1a',
			'1',
			'Red question',
			'4',
			'',
			'',
			'13',
			'0.50',
			'red',
			'2',
			'2',
			'no',
			'0',
			''
		]);
		expect(rows[3][0]).toBe('1c');
		expect(rows[3][13]).toBe('Not marked yet');

		const stub = stubPdfFetch();
		const pdf = captureDownload();
		await page.getByRole('button', { name: 'Download PDF' }).click();

		await vi.waitFor(() =>
			expect(pdf.filename()).toMatch(/^qla-analysis-10x-ph1-\d{4}-\d\d-\d\d\.pdf$/)
		);
		const [html] = sentHtml(stub);
		for (const summary of ['Red question', 'Green question', 'Unmarked question']) {
			expect(html).toContain(summary);
		}
	});
});
