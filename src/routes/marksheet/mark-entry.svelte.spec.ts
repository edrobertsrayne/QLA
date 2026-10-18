import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { confirmed, entry, seed, student } from '$lib/marksheet/fixtures.spec-helpers.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import { openPage } from '../spec-helpers.js';
import {
	markCell,
	cellText,
	progressText,
	tabbableCells,
	focusedCell
} from './marksheet.spec-helpers.js';
import MarksheetPage from './+page.svelte';

describe('mark entry', () => {
	/** Two students against two entries: a grid with a row to wrap and a column to walk. */
	function openGrid(marks: Record<string, Record<string, number>> = {}) {
		seed(
			confirmed({
				breakdown: {
					entries: [entry('entry-1', '1a', '1'), entry('entry-2', '1b', '1')],
					warnings: []
				},
				students: [
					student('student-1', 'Ada', 'Lovelace'),
					student('student-2', 'Grace', 'Hopper')
				],
				marks
			})
		);
		return openPage(MarksheetPage);
	}

	it('stores a mark typed into a cell, and Enter takes the cursor down the column', async () => {
		const screen = openGrid();

		await userEvent.click(markCell(screen, 'student-1', 'entry-1'));
		await userEvent.keyboard('3');

		// A digit starts an edit rather than committing on the spot: Enter is what
		// commits it.
		await expect.element(page.getByTestId('mark-editor')).toHaveValue('3');

		await userEvent.keyboard('{Enter}');

		expect(marksheetStore().document?.marks).toEqual({ 'student-1': { 'entry-1': 3 } });
		expect(page.getByTestId('mark-editor').query()).toBeNull();
		expect(focusedCell()).toBe(markCell(screen, 'student-2', 'entry-1'));
	});

	it('counts a student’s progress as marks are entered', async () => {
		const screen = openGrid();

		expect(progressText(screen, 0)).toBe('0/2');

		await userEvent.click(markCell(screen, 'student-1', 'entry-1'));
		await userEvent.keyboard('3');
		await userEvent.keyboard('{Enter}');

		expect(progressText(screen, 0)).toBe('1/2');
		expect(progressText(screen, 1)).toBe('0/2');
	});

	it('keeps one cell in the tab order, and moves it with the cursor', async () => {
		const screen = openGrid();

		expect(tabbableCells(screen)).toEqual([markCell(screen, 'student-1', 'entry-1')]);

		await userEvent.click(markCell(screen, 'student-2', 'entry-2'));

		expect(tabbableCells(screen)).toEqual([markCell(screen, 'student-2', 'entry-2')]);
	});

	it('commits on Tab and moves right, wrapping to the next row', async () => {
		const screen = openGrid();

		await userEvent.click(markCell(screen, 'student-1', 'entry-1'));
		await userEvent.keyboard('2');
		await userEvent.keyboard('{Tab}');

		expect(marksheetStore().document?.marks).toEqual({ 'student-1': { 'entry-1': 2 } });
		expect(focusedCell()).toBe(markCell(screen, 'student-1', 'entry-2'));

		await userEvent.keyboard('4');
		await userEvent.keyboard('{Tab}');

		// Past the last column the row wraps, so one student's paper is one pass.
		expect(marksheetStore().document?.marks).toEqual({
			'student-1': { 'entry-1': 2, 'entry-2': 4 }
		});
		expect(focusedCell()).toBe(markCell(screen, 'student-2', 'entry-1'));

		// And Tab backwards steps the way it came, wrapping to the row above.
		await userEvent.keyboard('{Shift>}{Tab}{/Shift}');

		expect(focusedCell()).toBe(markCell(screen, 'student-1', 'entry-2'));
	});

	it('moves the cursor with the arrow keys, entering nothing', async () => {
		const screen = openGrid();

		await userEvent.click(markCell(screen, 'student-1', 'entry-1'));
		await userEvent.keyboard('{ArrowDown}');
		expect(focusedCell()).toBe(markCell(screen, 'student-2', 'entry-1'));

		// Left reaches the name column, and right comes back into the marks.
		await userEvent.keyboard('{ArrowLeft}');
		expect(focusedCell()).toBe(
			screen.container.querySelector('[data-testid="name-cell"][data-student-id="student-2"]')
		);
		await userEvent.keyboard('{ArrowRight}');
		expect(focusedCell()).toBe(markCell(screen, 'student-2', 'entry-1'));

		await userEvent.keyboard('{ArrowRight}');
		expect(focusedCell()).toBe(markCell(screen, 'student-2', 'entry-2'));

		await userEvent.keyboard('{ArrowUp}');
		expect(focusedCell()).toBe(markCell(screen, 'student-1', 'entry-2'));

		// Down the name column walks the class, the way it does anywhere else.
		await userEvent.keyboard('{ArrowLeft}');
		await userEvent.keyboard('{ArrowLeft}');
		await userEvent.keyboard('{ArrowDown}');
		expect(focusedCell()).toBe(
			screen.container.querySelector('[data-testid="name-cell"][data-student-id="student-2"]')
		);
		await userEvent.keyboard('{ArrowUp}');
		expect(focusedCell()).toBe(
			screen.container.querySelector('[data-testid="name-cell"][data-student-id="student-1"]')
		);

		expect(marksheetStore().document?.marks).toEqual({});
	});

	it('edits a mark already there on F2, and on a double-click', async () => {
		const screen = openGrid({ 'student-1': { 'entry-1': 3 } });

		await userEvent.click(markCell(screen, 'student-1', 'entry-1'));
		await userEvent.keyboard('{F2}');

		const editor = page.getByTestId('mark-editor');
		await expect.element(editor).toHaveValue('3');

		await editor.fill('4');
		await userEvent.keyboard('{Enter}');

		expect(marksheetStore().document?.marks).toEqual({ 'student-1': { 'entry-1': 4 } });

		await userEvent.dblClick(markCell(screen, 'student-1', 'entry-1'));

		await expect.element(editor).toHaveValue('4');
	});

	it('clears a cell to unmarked on Delete or Backspace, keeping zero a mark', async () => {
		const screen = openGrid({ 'student-1': { 'entry-1': 3, 'entry-2': 0 } });

		expect(cellText(screen, 'student-1', 'entry-2')).toBe('0');

		await userEvent.click(markCell(screen, 'student-1', 'entry-1'));
		await userEvent.keyboard('{Delete}');

		expect(cellText(screen, 'student-1', 'entry-1')).toBe('');
		expect(marksheetStore().document?.marks).toEqual({ 'student-1': { 'entry-2': 0 } });

		await userEvent.click(markCell(screen, 'student-1', 'entry-2'));
		await userEvent.keyboard('{Backspace}');

		expect(cellText(screen, 'student-1', 'entry-2')).toBe('');
		expect(marksheetStore().document?.marks).toEqual({});
	});

	it('drops what was typed on Escape, leaving the mark as it was', async () => {
		const screen = openGrid({ 'student-1': { 'entry-1': 3 } });

		await userEvent.click(markCell(screen, 'student-1', 'entry-1'));
		await userEvent.keyboard('{F2}');
		await page.getByTestId('mark-editor').fill('9');
		await userEvent.keyboard('{Escape}');

		expect(page.getByTestId('mark-editor').query()).toBeNull();
		expect(cellText(screen, 'student-1', 'entry-1')).toBe('3');
		expect(marksheetStore().document?.marks).toEqual({ 'student-1': { 'entry-1': 3 } });
	});

	it('takes what was typed when the teacher clicks away, refusing it the same way', async () => {
		const screen = openGrid({ 'student-1': { 'entry-1': 3 } });

		// Clicking another cell keeps what the editor held.
		await userEvent.click(markCell(screen, 'student-1', 'entry-1'));
		await userEvent.keyboard('{F2}');
		await page.getByTestId('mark-editor').fill('4');
		await userEvent.click(markCell(screen, 'student-2', 'entry-2'));

		expect(marksheetStore().document?.marks).toEqual({ 'student-1': { 'entry-1': 4 } });
		expect(focusedCell()).toBe(markCell(screen, 'student-2', 'entry-2'));

		// A value that is not a whole number is refused, and the message stays up for
		// the teacher who has already moved on to the next cell.
		await userEvent.click(markCell(screen, 'student-1', 'entry-1'));
		await userEvent.keyboard('{F2}');
		await page.getByTestId('mark-editor').fill('4.5');
		await userEvent.click(markCell(screen, 'student-2', 'entry-2'));

		await expect.element(page.getByRole('status')).toHaveTextContent('4.5');
		expect(marksheetStore().document?.marks).toEqual({ 'student-1': { 'entry-1': 4 } });
		expect(focusedCell()).toBe(markCell(screen, 'student-2', 'entry-2'));
	});

	it('takes the caret as the mark is typed, so the next digit joins the first', async () => {
		const screen = openGrid();
		const cell = markCell(screen, 'student-1', 'entry-1');
		await userEvent.click(cell);

		// A keystroke as the browser delivers it: the editor has to be in the DOM and
		// hold the caret before this returns, or the next digit of a fast-typed mark
		// lands on the cell and reads as a mark of its own.
		cell.dispatchEvent(new KeyboardEvent('keydown', { key: '4', bubbles: true, cancelable: true }));
		expect(focusedCell()).toBe(screen.container.querySelector('[data-testid="mark-editor"]'));

		await userEvent.keyboard('0');
		await userEvent.keyboard('{Enter}');

		expect(marksheetStore().document?.marks).toEqual({ 'student-1': { 'entry-1': 40 } });
	});

	it('walks the grid when the keyboard arrives without a click', async () => {
		const screen = openGrid();

		// Tab order rather than a click: the cell in the tab order holds the keyboard
		// with no cursor set anywhere yet.
		tabbableCells(screen)[0].focus();
		await userEvent.keyboard('{ArrowDown}');

		expect(focusedCell()).toBe(markCell(screen, 'student-2', 'entry-1'));
	});

	it('keeps the keyboard on the cell when the grid runs out', async () => {
		const screen = openGrid();

		await userEvent.click(markCell(screen, 'student-2', 'entry-2'));
		await userEvent.keyboard('1');
		await userEvent.keyboard('{Enter}');

		// The last cell there is: the mark is taken and the cursor stays on it,
		// rather than the keyboard falling out of the grid mid-entry.
		expect(marksheetStore().document?.marks).toEqual({ 'student-2': { 'entry-2': 1 } });
		expect(focusedCell()).toBe(markCell(screen, 'student-2', 'entry-2'));
	});

	it.each(['2.5', '2.000', '-1', 'two'])(
		'refuses “%s”, which is not a whole number, leaving the cell unchanged',
		async (refused) => {
			const screen = openGrid({ 'student-1': { 'entry-1': 3 } });

			await userEvent.click(markCell(screen, 'student-1', 'entry-1'));
			await userEvent.keyboard('{F2}');
			await page.getByTestId('mark-editor').fill(refused);
			await userEvent.keyboard('{Enter}');

			await expect.element(page.getByRole('status')).toHaveTextContent(refused);
			expect(page.getByTestId('mark-editor').query()).toBeNull();
			expect(cellText(screen, 'student-1', 'entry-1')).toBe('3');
			expect(marksheetStore().document?.marks).toEqual({ 'student-1': { 'entry-1': 3 } });
			// The keyboard stays on the cell that was refused, ready to be corrected.
			expect(focusedCell()).toBe(markCell(screen, 'student-1', 'entry-1'));
		}
	);

	it('keeps a mark above the available marks, shown as the typo it is', async () => {
		const screen = openGrid();

		await userEvent.click(markCell(screen, 'student-1', 'entry-1'));
		await userEvent.keyboard('{F2}');
		await page.getByTestId('mark-editor').fill('40');
		await userEvent.keyboard('{Enter}');

		// Never clamped into a mark the teacher did not give, and never hidden.
		expect(marksheetStore().document?.marks).toEqual({ 'student-1': { 'entry-1': 40 } });
		const cell = markCell(screen, 'student-1', 'entry-1');
		expect(cellText(screen, 'student-1', 'entry-1')).toBe('40');
		expect(cell.getAttribute('aria-invalid')).toBe('true');
	});

	it('leaves the keyboard one cell to land on when the cursor row is removed', async () => {
		seed(
			confirmed({
				students: [student('student-1', 'Ada', 'Lovelace'), student('student-2', 'Grace', 'Hopper')]
			})
		);
		const screen = openPage(MarksheetPage);

		await userEvent.click(markCell(screen, 'student-2', 'entry-1'));
		await page.getByRole('button', { name: 'Remove Grace Hopper' }).click();

		expect(tabbableCells(screen)).toHaveLength(1);
	});

	it('scrolls the cursor into view, clear of the frozen columns', async () => {
		seed(
			confirmed({
				breakdown: {
					entries: Array.from({ length: 24 }, (_, index) =>
						entry(`entry-${index + 1}`, `${index + 1}`, `${index + 1}`)
					),
					warnings: []
				},
				students: [student('student-1', 'Ada', 'Lovelace')]
			})
		);

		const screen = openPage(MarksheetPage);
		const frozen = screen.container.querySelector<HTMLElement>('[data-testid="progress-cell"]');
		if (!frozen) throw new Error('no progress cell');
		const frozenRight = (): number => frozen.getBoundingClientRect().right;

		await userEvent.click(markCell(screen, 'student-1', 'entry-1'));
		for (let step = 0; step < 20; step++) await userEvent.keyboard('{ArrowRight}');

		const far = markCell(screen, 'student-1', 'entry-21');
		expect(focusedCell()).toBe(far);
		expect(far.getBoundingClientRect().left).toBeGreaterThanOrEqual(frozenRight() - 1);
		expect(far.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth + 1);

		// Coming back, the first column is brought out from under them again.
		for (let step = 0; step < 20; step++) await userEvent.keyboard('{ArrowLeft}');

		const first = markCell(screen, 'student-1', 'entry-1');
		expect(focusedCell()).toBe(first);
		expect(first.getBoundingClientRect().left).toBeGreaterThanOrEqual(frozenRight() - 1);
	});
});
