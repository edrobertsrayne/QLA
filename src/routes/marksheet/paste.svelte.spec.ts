import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import type { MarksheetDocument } from '$lib/marksheet/document.js';
import { confirmed, entry, seed, student } from '$lib/marksheet/fixtures.spec-helpers.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import { openPage } from '../spec-helpers.js';
import { rowNames, markCell, cellText, pasteClipboard } from './marksheet.spec-helpers.js';
import MarksheetPage from './+page.svelte';

describe('paste', () => {
	/** Two entries and a class, so a block has both rows and columns to land in. */
	function openPasteGrid(overrides: Partial<MarksheetDocument> = {}) {
		seed(
			confirmed({
				breakdown: {
					entries: [entry('entry-1', '1a', '1'), entry('entry-2', '1b', '1')],
					warnings: [],
					aoDescriptions: {}
				},
				students: [student('student-1', 'Ada', 'Lovelace')],
				...overrides
			})
		);
		return openPage(MarksheetPage);
	}

	it('pastes a tab-separated block from the selected cell', async () => {
		const screen = openPasteGrid({
			students: [student('student-1', 'Ada', 'Lovelace'), student('student-2', 'Grace', 'Hopper')]
		});

		await userEvent.click(markCell(screen, 'student-1', 'entry-1'));
		pasteClipboard(screen, { text: '1\t2\r\n3\t4\r\n' });

		expect(marksheetStore().document?.marks).toEqual({
			'student-1': { 'entry-1': 1, 'entry-2': 2 },
			'student-2': { 'entry-1': 3, 'entry-2': 4 }
		});
		await expect.element(page.getByTestId('paste-notice')).toHaveTextContent('Pasted 4 marks');
	});

	it('prefers the clipboard’s HTML table, reading names and marks together', async () => {
		const screen = openPasteGrid();

		await userEvent.click(page.getByTestId('name-cell'));
		pasteClipboard(screen, {
			html: [
				'<table>',
				'<tr><td>Lovelace, Ada</td><td>2</td><td>4</td></tr>',
				'<tr><td>Grace Hopper</td><td>3</td><td>1</td></tr>',
				'</table>'
			].join(''),
			// What a plain-text fallback would have pasted: the HTML must win.
			text: '9\t9\r\n9\t9\r\n'
		});

		await vi.waitFor(() => expect(rowNames(screen)).toEqual(['Ada Lovelace', 'Grace Hopper']));
		const added = marksheetStore().document?.students[1];
		if (!added) throw new Error('no added student');
		expect(added).toMatchObject({ firstName: 'Grace', surname: 'Hopper' });
		expect(marksheetStore().document?.marks).toEqual({
			'student-1': { 'entry-1': 2, 'entry-2': 4 },
			[added.id]: { 'entry-1': 3, 'entry-2': 1 }
		});
		await expect.element(page.getByTestId('paste-notice')).toHaveTextContent('added 1 student');
	});

	it('reports refused cells and clipped columns while keeping the rest', async () => {
		const screen = openPasteGrid();

		await userEvent.click(markCell(screen, 'student-1', 'entry-1'));
		pasteClipboard(screen, { text: '2.5\t3\t9' });

		expect(cellText(screen, 'student-1', 'entry-1')).toBe('');
		await vi.waitFor(() => expect(cellText(screen, 'student-1', 'entry-2')).toBe('3'));
		expect(marksheetStore().document?.marks).toEqual({
			'student-1': { 'entry-2': 3 }
		});

		const notice = page.getByTestId('paste-notice');
		await expect.element(notice).toHaveTextContent('2.5');
		await expect.element(notice).toHaveTextContent('whole number');
		await expect.element(notice).toHaveTextContent('1 column');
	});

	it('keeps a multi-line HTML cell in its own cell rather than reading it as a mark', async () => {
		const screen = openPasteGrid();

		await userEvent.click(markCell(screen, 'student-1', 'entry-1'));
		pasteClipboard(screen, {
			html: '<table><tr><td><div>2</div><div>3</div></td><td>4</td></tr></table>'
		});

		// Two lines in one cell is not the mark 23: it is refused, and the row
		// beside it lands where the table says it does.
		expect(marksheetStore().document?.marks).toEqual({
			'student-1': { 'entry-2': 4 }
		});
		await expect.element(page.getByTestId('paste-notice')).toHaveTextContent('whole number');
	});

	it('takes a paste the browser delivers to a cell', async () => {
		const screen = openPasteGrid();

		await userEvent.click(markCell(screen, 'student-1', 'entry-1'));
		pasteClipboard(screen, { text: '2\t1' }, markCell(screen, 'student-1', 'entry-1'));

		expect(marksheetStore().document?.marks).toEqual({
			'student-1': { 'entry-1': 2, 'entry-2': 1 }
		});
	});

	it('offers no undo on the notice of a paste that changed nothing', async () => {
		const screen = openPasteGrid();

		await userEvent.click(markCell(screen, 'student-1', 'entry-1'));
		pasteClipboard(screen, { text: '3\t2\r\n' });
		await expect
			.element(page.getByTestId('paste-notice').getByRole('button', { name: 'Undo' }))
			.toBeInTheDocument();

		pasteClipboard(screen, { text: 'x' });

		const notice = page.getByTestId('paste-notice');
		await expect.element(notice).toHaveTextContent('whole number');
		await expect.element(notice.getByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
	});

	it('offers the whole paste back, until the next action', async () => {
		const screen = openPasteGrid({ marks: { 'student-1': { 'entry-1': 1 } } });

		await userEvent.click(markCell(screen, 'student-1', 'entry-1'));
		pasteClipboard(screen, { text: '3\t2\r\n' });

		expect(marksheetStore().document?.marks).toEqual({
			'student-1': { 'entry-1': 3, 'entry-2': 2 }
		});

		await page.getByTestId('paste-notice').getByRole('button', { name: 'Undo' }).click();

		expect(marksheetStore().document?.marks).toEqual({ 'student-1': { 'entry-1': 1 } });
		await vi.waitFor(() => expect(page.getByTestId('paste-notice').query()).toBeNull());

		// A paste that is kept is taken back by the next change, like any undo.
		pasteClipboard(screen, { text: '4\t3\r\n' });
		await expect.element(page.getByTestId('paste-notice')).toBeInTheDocument();

		await userEvent.click(markCell(screen, 'student-1', 'entry-1'));
		await userEvent.keyboard('5');
		await userEvent.keyboard('{Enter}');

		await vi.waitFor(() => expect(page.getByTestId('paste-notice').query()).toBeNull());
	});
});
