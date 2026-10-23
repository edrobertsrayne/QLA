// The two-tier analysis the analysis specs open: four pairs whose gap, pooled
// figure and paper order each read in a different order, one pair with no
// Foundation mark, and one off-tier mark that must never reach a figure.
// Test-only: nothing in the app imports this.

import type { MarksheetDocument } from '$lib/marksheet/document.js';
import { confirmed, entry, seed, student, tier } from '$lib/marksheet/fixtures.spec-helpers.js';
import { load } from './analysis/+page.js';
import { openPage } from '../spec-helpers.js';
import AnalysisPage from './analysis/+page.svelte';

/** A class of two present students and one absent student on each tier. */
export function twoTierAnalysisDocument(): MarksheetDocument {
	return confirmed({
		label: '10X Ph1',
		tiers: [
			tier({
				tierName: 'Higher',
				breakdown: {
					entries: [
						entry('e-a', '1a', '1', { marks: 10, summary: 'Shared one' }),
						entry('e-b', '1b', '1', { marks: 10, summary: 'Shared two' }),
						entry('e-c', '1c', '1', { marks: 10, summary: 'Shared three' }),
						entry('e-d', '1d', '1', { marks: 10, summary: 'Higher only' })
					],
					warnings: []
				}
			}),
			tier({
				tierName: 'Foundation',
				breakdown: {
					entries: [
						entry('f-a', '8a', '8', { marks: 10, summary: 'Foundation one' }),
						entry('f-b', '8b', '8', { marks: 10, summary: 'Foundation two' }),
						entry('f-c', '8c', '8', { marks: 10, summary: 'Foundation three' }),
						entry('f-d', '8d', '8', { marks: 10, summary: 'Foundation only' })
					],
					warnings: []
				}
			})
		],
		students: [
			student('h1', 'Ada', 'Lovelace', false, 0),
			student('h2', 'Grace', 'Hopper', false, 0),
			student('h3', 'Cher', 'Absent', true, 0),
			student('f1', 'Flo', 'Found', false, 1),
			student('f2', 'Fred', 'Firth', false, 1),
			student('f3', 'Fay', 'Gone', true, 1)
		],
		marks: {
			h1: { 'e-a': 7, 'e-b': 1, 'e-c': 5, 'e-d': 4 },
			h2: { 'e-a': 7, 'e-b': 1, 'e-c': 5, 'e-d': 4 },
			// A mark on the tier Flo is not on: kept in the sheet, never counted.
			f1: { 'f-a': 5, 'f-b': 8, 'f-c': 5, 'e-a': 10 },
			f2: { 'f-a': 5, 'f-b': 8, 'f-c': 5 }
		},
		commonQuestions: [
			{ tier1EntryId: 'e-a', tier2EntryId: 'f-a' },
			{ tier1EntryId: 'e-b', tier2EntryId: 'f-b' },
			{ tier1EntryId: 'e-c', tier2EntryId: 'f-c' },
			{ tier1EntryId: 'e-d', tier2EntryId: 'f-d' }
		]
	});
}

export function seedTwoTierAnalysis(): void {
	seed(twoTierAnalysisDocument());
}

/** The analysis route for a URL, as the router opens it: load first, then the page. */
export function openAnalysisAt(search = '') {
	const data = load({ url: new URL(`http://localhost/marksheet/analysis${search}`) });
	return openPage(AnalysisPage, { data });
}

/** One entry's line on a tier tab. */
export function tierRow(container: HTMLElement, entryId: string): HTMLElement {
	const row = container.querySelector<HTMLElement>(
		`[data-testid="analysis-row"][data-entry-id="${entryId}"]`
	);
	if (!row) throw new Error(`no analysis row for ${entryId}`);
	return row;
}

/** One pair's line on the common tab. */
export function commonRow(container: HTMLElement, tier1EntryId: string): HTMLElement {
	const row = container.querySelector<HTMLElement>(
		`[data-testid="common-row"][data-tier1-entry-id="${tier1EntryId}"]`
	);
	if (!row) throw new Error(`no common row for ${tier1EntryId}`);
	return row;
}

/** What one figure inside a line reads. */
export function figureText(row: HTMLElement, testid: string): string {
	const cell = row.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
	if (!cell) throw new Error(`no ${testid} in the row`);
	return cell.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

/** One figure the track carries: a percentage, or empty where the dot or bar is absent. */
export function trackValue(row: HTMLElement, dot: 'tier1' | 'tier2' | 'pooled'): string {
	const track = row.querySelector<HTMLElement>('[data-testid="track"]');
	if (!track) throw new Error('the row has no track');
	return track.dataset[dot] ?? '';
}

/** The common rows' Tier 1 ids, in the order the view shows them. */
export function commonOrder(container: HTMLElement): string[] {
	return [...container.querySelectorAll<HTMLElement>('[data-testid="common-row"]')].map(
		(row) => row.dataset.tier1EntryId ?? ''
	);
}

/** The tier rows' entry ids, in the order the view shows them. */
export function tierOrder(container: HTMLElement): string[] {
	return [...container.querySelectorAll<HTMLElement>('[data-testid="analysis-row"]')].map(
		(row) => row.dataset.entryId ?? ''
	);
}

/** A CSV body as cells, honouring the quotes a summary or header may carry. */
export function parseCsv(text: string): string[][] {
	return text
		.trim()
		.split('\r\n')
		.map((line) => {
			const cells: string[] = [];
			let value = '';
			let quoted = false;
			for (let index = 0; index < line.length; index += 1) {
				const char = line[index];
				if (quoted) {
					if (char === '"' && line[index + 1] === '"') {
						value += '"';
						index += 1;
					} else if (char === '"') {
						quoted = false;
					} else {
						value += char;
					}
				} else if (char === '"') {
					quoted = true;
				} else if (char === ',') {
					cells.push(value);
					value = '';
				} else {
					value += char;
				}
			}
			cells.push(value);
			return cells;
		});
}
