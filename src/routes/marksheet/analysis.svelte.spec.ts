import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import type { MarksheetDocument } from '$lib/marksheet/document.js';
import { confirmed, entry, seed, student } from '$lib/marksheet/fixtures.spec-helpers.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import { goto } from '$app/navigation';
import { openPage } from '../spec-helpers.js';
import { markCell } from './marksheet.spec-helpers.js';
import MarksheetPage from './+page.svelte';
import AnalysisPage from './analysis/+page.svelte';
import { load } from './analysis/+page.ts';

describe('analysis', () => {
	/** A marksheet with figures worth reading: two entries over two students. */
	function openAnalysisSheet(overrides: Partial<MarksheetDocument> = {}) {
		seed(
			confirmed({
				breakdown: {
					entries: [
						entry('entry-1', '1a', '1', { marks: 4 }),
						entry('entry-2', '1b', '1', { marks: 4 })
					],
					warnings: [],
					aoDescriptions: {}
				},
				students: [
					student('student-1', 'Ada', 'Lovelace'),
					student('student-2', 'Grace', 'Hopper')
				],
				marks: { 'student-1': { 'entry-1': 1 }, 'student-2': { 'entry-1': 3 } },
				...overrides
			})
		);
		return openPage(MarksheetPage);
	}

	/** The analysis route for a URL, as the router opens it: load first, then the page. */
	function openAnalysisAt(search = '') {
		const data = load({ url: new URL(`http://localhost/marksheet/analysis${search}`) });
		return openPage(AnalysisPage, { data });
	}

	/** The figure under one entry's column, or nothing where the row has no cell for it. */
	function rowCell(
		screen: { container: HTMLElement },
		testid: 'facility-cell' | 'coverage-cell',
		entryId: string
	): HTMLElement {
		const cell = screen.container.querySelector<HTMLElement>(
			`[data-testid="${testid}"][data-entry-id="${entryId}"]`
		);
		if (!cell) throw new Error(`no ${testid} for ${entryId}`);
		return cell;
	}

	function rowText(
		screen: { container: HTMLElement },
		testid: 'facility-cell' | 'coverage-cell',
		entryId: string
	): string {
		return rowCell(screen, testid, entryId).textContent?.trim() ?? '';
	}

	/** What the Hardest strip names, in the order it names them. */
	function hardestNames(screen: { container: HTMLElement }): string[] {
		return [
			...screen.container.querySelectorAll<HTMLElement>('[data-testid="hardest"] button')
		].map((button) => (button.textContent ?? '').replace(/\s+/g, ' ').trim());
	}

	/** One entry's row in the analysis view, so a test can ask whether it is there and outlined. */
	function analysisRow(entryId: string): HTMLElement | null {
		return document.querySelector<HTMLElement>(
			`[data-testid="analysis-row"][data-entry-id="${entryId}"]`
		);
	}

	it('shows a facility row under the grid that follows the marks as they are entered', async () => {
		const screen = openAnalysisSheet();

		expect(rowText(screen, 'facility-cell', 'entry-1')).toBe('50%');
		expect(rowText(screen, 'facility-cell', 'entry-2')).toBe('—');

		await userEvent.click(markCell(screen, 'student-1', 'entry-1'));
		await userEvent.keyboard('3');
		await userEvent.keyboard('{Enter}');

		await vi.waitFor(() => expect(rowText(screen, 'facility-cell', 'entry-1')).toBe('75%'));
	});

	it('gives a part-marked entry its coverage in the row beneath', async () => {
		const screen = openAnalysisSheet({ marks: { 'student-1': { 'entry-1': 4 } } });

		expect(rowText(screen, 'facility-cell', 'entry-1')).toBe('100%');
		expect(rowText(screen, 'coverage-cell', 'entry-1')).toBe('1/2');
		expect(rowText(screen, 'coverage-cell', 'entry-2')).toBe('');
	});

	it('names the hardest entries in the toolbar, worst first', async () => {
		const screen = openAnalysisSheet({
			breakdown: {
				entries: [
					entry('entry-1', '1a', '1', { marks: 10 }),
					entry('entry-2', '1b', '1', { marks: 10 }),
					entry('entry-3', '1c', '1', { marks: 10 })
				],
				warnings: [],
				aoDescriptions: {}
			},
			marks: { 'student-1': { 'entry-1': 1, 'entry-2': 2, 'entry-3': 3 } }
		});

		expect(hardestNames(screen)).toEqual(['1a 10%', '1b 20%', '1c 30%']);
	});

	it('opens the analysis grouped by band, with Green folded and the rest scored worst first', async () => {
		openAnalysisSheet({
			breakdown: {
				entries: [
					entry('entry-green', '1a', '1', { marks: 10 }),
					entry('entry-amber', '1b', '1', { marks: 10 }),
					entry('entry-red', '1c', '1', { marks: 10 }),
					entry('entry-unmarked', '1d', '1', { marks: 10 })
				],
				warnings: [],
				aoDescriptions: {}
			},
			marks: { 'student-1': { 'entry-green': 9, 'entry-amber': 5, 'entry-red': 2 } }
		});

		await page.getByRole('button', { name: 'View analysis' }).click();
		expect(goto).toHaveBeenCalledWith('/marksheet/analysis');
		openAnalysisAt();

		await expect
			.element(page.getByRole('heading', { name: 'Red — below 40%' }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('heading', { name: 'Amber — 40% to below 70%' }))
			.toBeInTheDocument();
		expect(analysisRow('entry-red')).not.toBeNull();
		expect(analysisRow('entry-green')).toBeNull();

		const green = page.getByRole('button', { name: 'Green — 70% and above' });
		await expect.element(green).toHaveAttribute('aria-expanded', 'false');
		await green.click();
		await expect.element(page.getByRole('heading', { name: 'Not scored' })).toBeInTheDocument();
		await vi.waitFor(() => expect(analysisRow('entry-green')).not.toBeNull());

		// What the figures rest on, beside them: who was counted, what was left out.
		await expect.element(page.getByTestId('analysis-view')).toHaveTextContent('2 students counted');
		await expect.element(page.getByTestId('analysis-view')).toHaveTextContent('0 absent excluded');
		await expect.element(page.getByTestId('analysis-view')).toHaveTextContent('3 marks counted');
		await expect.element(page.getByTestId('analysis-view')).toHaveTextContent('Not marked yet');
	});

	it('opens the analysis at an entry with no figure too, from its facility cell', async () => {
		const screen = openAnalysisSheet();

		await userEvent.click(rowCell(screen, 'facility-cell', 'entry-2'));
		expect(goto).toHaveBeenCalledWith('/marksheet/analysis?entry=entry-2');
		screen.unmount();

		openAnalysisAt('?entry=entry-2');
		expect(analysisRow('entry-2')?.dataset.highlighted).toBe('true');
	});

	it('opens the analysis at the entry a facility cell names, unfolding Green to reveal it', async () => {
		const entries = Array.from({ length: 40 }, (_, index) =>
			entry(`entry-${index + 1}`, `1${index}`, '1', { marks: 4 })
		);
		seed(
			confirmed({
				breakdown: { entries, warnings: [], aoDescriptions: {} },
				students: [student('student-1', 'Ada', 'Lovelace')],
				marks: { 'student-1': { 'entry-40': 4 } }
			})
		);
		const screen = openPage(MarksheetPage);

		await userEvent.click(rowCell(screen, 'facility-cell', 'entry-40'));
		expect(goto).toHaveBeenCalledWith('/marksheet/analysis?entry=entry-40');
		screen.unmount();

		// Reloading the URL does the same: the entry is in the query, not in page state.
		openAnalysisAt('?entry=entry-40');

		const row = analysisRow('entry-40');
		if (!row) throw new Error('the analysis did not open at the entry');
		expect(row.dataset.highlighted).toBe('true');
		const box = row.getBoundingClientRect();
		expect(box.top).toBeGreaterThanOrEqual(0);
		expect(box.bottom).toBeLessThanOrEqual(window.innerHeight);

		await page.getByRole('button', { name: 'Back to marksheet' }).click();
		expect(goto).toHaveBeenLastCalledWith('/marksheet');
	});

	it('opens the analysis without a highlight for an unknown entry id', async () => {
		openAnalysisSheet();
		openAnalysisAt('?entry=nope');

		await expect.element(page.getByTestId('analysis-view')).toBeInTheDocument();
		expect(document.querySelector('[data-highlighted]')).toBeNull();
	});

	it('names the analysis in the page title', async () => {
		openAnalysisSheet();
		marksheetStore().setClassName('10C1');
		openAnalysisAt();

		await vi.waitFor(() => expect(document.title).toBe('10C1 · Analysis · QLA'));
	});

	it('opens the analysis at the entry a Hardest item names', async () => {
		const screen = openAnalysisSheet({
			marks: { 'student-1': { 'entry-1': 1, 'entry-2': 4 } }
		});

		await page.getByTestId('hardest').getByRole('button', { name: '1a 25%' }).click();
		expect(goto).toHaveBeenCalledWith('/marksheet/analysis?entry=entry-1');
		screen.unmount();

		openAnalysisAt('?entry=entry-1');
		expect(analysisRow('entry-1')?.dataset.highlighted).toBe('true');
		expect(document.body.textContent).toContain('Red — below 40%');
	});
});
