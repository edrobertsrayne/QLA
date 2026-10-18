import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { markCount } from '$lib/marksheet/document.js';
import type { MarksheetDocument } from '$lib/marksheet/document.js';
import {
	NOW,
	confirmed,
	entry,
	seed,
	storedDocument,
	student
} from '$lib/marksheet/fixtures.spec-helpers.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import BreakdownPage from './breakdown/+page.svelte';
import MarksheetPage from './marksheet/+page.svelte';

const goto = vi.hoisted(() => vi.fn());

vi.mock('$app/navigation', () => ({ goto }));

/** A confirmed marksheet with one mark entered: the state a teacher unlocks from. */
function confirmedDocument(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
	return confirmed({
		paper: {
			label: '10X Ph1',
			className: '10C1',
			sourceFilenames: ['10X Ph1.pdf'],
			parsedAt: NOW
		},
		breakdown: {
			entries: [
				entry('entry-1', '2bii', '2', {
					summary: 'Explain the process shown',
					commandWord: 'Explain',
					ao: 'AO1'
				}),
				entry('entry-2', '2biii', '2', {
					marks: 3,
					summary: 'Name the gas produced',
					specPoint: null,
					commandWord: 'Name',
					ao: null
				})
			],
			warnings: []
		},
		students: [student('student-1', 'Ada', 'Lovelace'), student('student-2', 'Grace', 'Hopper')],
		marks: {
			'student-1': { 'entry-1': 3, 'entry-2': 1 },
			'student-2': { 'entry-1': 2 }
		},
		...overrides
	});
}

/** The route's load guard reads storage before the page renders. */
function openMarksheetPage() {
	marksheetStore().load();
	return render(MarksheetPage);
}

function openBreakdownPage() {
	marksheetStore().load();
	return render(BreakdownPage);
}

beforeEach(() => {
	// A fresh surface: the store keeps changes the tab has not written, so a
	// previous test's document is wiped rather than carried into this one.
	marksheetStore().wipe();
	localStorage.clear();
	goto.mockClear();
});

describe('editing the breakdown after confirming it', () => {
	it('unlocks it behind a warning, and re-confirming keeps the marks that survive', async () => {
		seed(confirmedDocument());
		const marksheet = openMarksheetPage();

		await page.getByRole('button', { name: 'Edit breakdown' }).click();

		// What the click is bought with: the marks are keyed against the entries.
		await expect
			.element(page.getByRole('dialog'))
			.toHaveTextContent('can affect marks already entered');
		await page.getByRole('button', { name: 'Unlock and edit' }).click();

		await vi.waitFor(() => {
			expect(goto).toHaveBeenCalledWith('/breakdown');
			expect(storedDocument().breakdownConfirmedAt).toBeNull();
		});
		// An unlock changes nothing but the lock: the marks are exactly as they were.
		expect(storedDocument().marks).toEqual({
			'student-1': { 'entry-1': 3, 'entry-2': 1 },
			'student-2': { 'entry-1': 2 }
		});
		expect(storedDocument().students).toHaveLength(2);
		expect(marksheetStore().route()).toBe('/breakdown');

		// The wrong entry is deleted on the review page — which asks first, since two
		// marks are entered against it — and the breakdown confirmed again.
		marksheet.unmount();
		const breakdown = openBreakdownPage();
		await page.getByRole('button', { name: 'Delete 2bii', exact: true }).click();
		await expect
			.element(page.getByTestId('delete-loss'))
			.toHaveTextContent('2 marks are entered against it');
		await page.getByRole('button', { name: 'Delete 2bii and 2 marks' }).click();
		await page.getByRole('button', { name: 'Confirm and build marksheet' }).click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/marksheet'));
		await vi.waitFor(() => {
			const reconfirmed = storedDocument();
			expect(reconfirmed.breakdownConfirmedAt).not.toBeNull();
			expect(reconfirmed.breakdown.entries.map((one) => one.label)).toEqual(['2biii']);
			// The class survives whole, and so do the marks the deleted entry never
			// held: only what was entered against it went with it.
			expect(reconfirmed.students.map(({ firstName }) => firstName)).toEqual(['Ada', 'Grace']);
			expect(markCount(reconfirmed)).toBe(1);
			expect(reconfirmed.marks['student-1']).toEqual({ 'entry-2': 1 });
		});

		// And the surviving mark is in its cell on the marksheet it was entered on.
		breakdown.unmount();
		const screen = openMarksheetPage();
		const cell = screen.container.querySelector<HTMLElement>(
			'[data-testid="mark-cell"][data-student-id="student-1"][data-entry-id="entry-2"]'
		);
		expect(cell?.textContent?.trim()).toBe('1');
	});

	it('leaves the breakdown confirmed when the teacher changes their mind', async () => {
		seed(confirmedDocument());
		openMarksheetPage();

		await page.getByRole('button', { name: 'Edit breakdown' }).click();
		await page.getByRole('button', { name: 'Keep marking' }).click();

		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		expect(storedDocument().breakdownConfirmedAt).toBe(NOW);
		expect(marksheetStore().route()).toBe('/marksheet');
		expect(goto).not.toHaveBeenCalled();
	});
});
