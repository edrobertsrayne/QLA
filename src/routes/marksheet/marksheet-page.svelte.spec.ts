import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
// The frozen columns and truncated names are Tailwind classes, so the
// stylesheet has to be in the page for their computed styles to mean anything.
import '../../app.css';
import type { MarksheetDocument } from '$lib/marksheet/document.js';
import {
	confirmed,
	entry,
	seed,
	readSeeded,
	student
} from '$lib/marksheet/fixtures.spec-helpers.js';
import { captureDownload } from '$lib/marksheet/download.spec-helpers.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import MarksheetPage from './+page.svelte';

/** The class as the grid shows it, in the order it shows them. */
function rowNames(screen: { container: HTMLElement }): string[] {
	return [...screen.container.querySelectorAll<HTMLElement>('[data-testid="student-name"]')].map(
		(element) => element.textContent?.trim() ?? ''
	);
}

/** The mark cell for one student on one entry, so a test can ask where the cursor went. */
function markCell(
	screen: { container: HTMLElement },
	studentId: string,
	entryId: string
): HTMLElement {
	const cell = screen.container.querySelector<HTMLElement>(
		`[data-testid="mark-cell"][data-student-id="${studentId}"][data-entry-id="${entryId}"]`
	);
	if (!cell) throw new Error(`no mark cell for ${studentId} on ${entryId}`);
	return cell;
}

/** The first student's id, which the document generates on the teacher's device. */
function studentIdAt(index: number): string {
	const student = marksheetStore().document?.students[index];
	if (!student) throw new Error(`no student at ${index}`);
	return student.id;
}

/** What a mark cell shows: the mark, or nothing where the cell is unmarked. */
function cellText(screen: { container: HTMLElement }, studentId: string, entryId: string): string {
	return markCell(screen, studentId, entryId).textContent?.trim() ?? '';
}

/** What one row's progress column reads. */
function progressText(screen: { container: HTMLElement }, row: number): string {
	const cell = screen.container.querySelectorAll<HTMLElement>('[data-testid="progress-cell"]')[row];
	if (!cell) throw new Error(`no progress cell on row ${row}`);
	return cell.textContent?.trim() ?? '';
}

/** The cells reachable by Tab: the roving tabindex puts exactly one in the tab order. */
function tabbableCells(screen: { container: HTMLElement }): HTMLElement[] {
	return [...screen.container.querySelectorAll<HTMLElement>('[tabindex="0"]')].filter((cell) =>
		cell.matches('[data-testid="mark-cell"], [data-testid="name-cell"]')
	);
}

/** Where the cursor is, as the cell the keyboard is on. */
function focusedCell(): Element | null {
	return document.activeElement;
}

/** Deliver a clipboard payload the way a paste event does, on the active cell. */
function pasteClipboard(
	screen: { container: HTMLElement },
	payload: { html?: string; text?: string },
	target?: Element
): void {
	const data = clipboardPayload(payload);
	const element =
		target ??
		screen.container.querySelector<HTMLElement>(
			'[data-testid="mark-cell"][tabindex="0"], [data-testid="name-cell"][tabindex="0"]'
		);
	if (!element) throw new Error('no paste target');
	element.dispatchEvent(
		new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
	);
}

/** The two clipboard flavours one paste can carry, with only those the test set. */
function clipboardPayload(payload: { html?: string; text?: string }): DataTransfer {
	const data = new DataTransfer();
	if (payload.html !== undefined) data.setData('text/html', payload.html);
	if (payload.text !== undefined) data.setData('text/plain', payload.text);
	return data;
}

beforeEach(() => {
	// A fresh surface: the store keeps changes the tab has not written, so a
	// previous test's class is wiped rather than carried into this one.
	marksheetStore().wipe();
	localStorage.clear();
});

/** The route's load guard reads storage before the page renders. */
function openMarksheetPage() {
	marksheetStore().load();
	return render(MarksheetPage);
}

describe('marksheet page', () => {
	it('starts the class from a pasted column of names', async () => {
		seed(confirmed());

		const screen = openMarksheetPage();

		await expect.element(page.getByText('No students on this marksheet yet.')).toBeInTheDocument();

		await page
			.getByLabelText('Paste a column of names')
			.fill('Lovelace, Ada\nGrace Brewster Hopper\nCher');
		await page.getByRole('button', { name: 'Add students', exact: true }).click();

		expect(rowNames(screen)).toEqual(['Ada Lovelace', 'Grace Brewster Hopper', 'Cher']);
	});

	it('adds students one at a time, opening the next row each time', async () => {
		seed(confirmed());

		const screen = openMarksheetPage();

		await page.getByRole('button', { name: 'Or add students one at a time' }).click();
		const input = page.getByLabelText('New student name');
		await expect.element(input).toHaveFocus();

		await input.fill('Ada Lovelace');
		await userEvent.keyboard('{Enter}');

		// The next one opens straight away: a class is entered in one pass.
		await expect.element(input).toHaveFocus();
		await input.fill('Grace Hopper');
		await userEvent.keyboard('{Enter}');

		expect(rowNames(screen)).toEqual(['Ada Lovelace', 'Grace Hopper']);
	});

	it('discards a blank add-student row on Enter or Escape', async () => {
		seed(confirmed());

		const screen = openMarksheetPage();

		const add = page.getByRole('button', { name: 'Add student', exact: true });
		await add.click();
		const input = page.getByLabelText('New student name');
		await input.fill('   ');
		await userEvent.keyboard('{Enter}');

		expect(rowNames(screen)).toEqual([]);
		await expect.element(add).toBeInTheDocument();

		await add.click();
		await input.fill('Ada Lovelace');
		await userEvent.keyboard('{Escape}');

		expect(rowNames(screen)).toEqual([]);
	});

	it('renames a student on both name parts, keeping their marks', async () => {
		seed(
			confirmed({
				students: [student('student-1', 'Ada', 'Lovelace')],
				marks: { 'student-1': { 'entry-1': 3 } }
			})
		);

		const screen = openMarksheetPage();

		await page.getByTestId('student-name').dblClick();
		await page.getByLabelText('First name of Ada Lovelace').fill('Augusta');
		await page.getByLabelText('Surname of Ada Lovelace').fill('Byron');
		await userEvent.keyboard('{Enter}');

		expect(rowNames(screen)).toEqual(['Augusta Byron']);
		expect(marksheetStore().document?.students[0]).toMatchObject({
			id: 'student-1',
			firstName: 'Augusta',
			surname: 'Byron'
		});
		expect(marksheetStore().document?.marks).toEqual({ 'student-1': { 'entry-1': 3 } });
	});

	it('opens the same rename on F2', async () => {
		seed(confirmed({ students: [student('student-1', 'Ada', 'Lovelace')] }));

		openMarksheetPage();

		await page.getByTestId('name-cell').click();
		await userEvent.keyboard('{F2}');

		await expect.element(page.getByLabelText('First name of Ada Lovelace')).toHaveValue('Ada');
		await expect.element(page.getByLabelText('Surname of Ada Lovelace')).toHaveValue('Lovelace');
	});

	it.each(['Enter', 'Escape'])(
		'keeps the keyboard on the name cell after %s in a rename',
		async (key) => {
			seed(confirmed({ students: [student('student-1', 'Ada', 'Lovelace')] }));

			openMarksheetPage();

			await page.getByTestId('name-cell').click();
			await userEvent.keyboard('{F2}');
			await page.getByLabelText('First name of Ada Lovelace').fill('Grace');
			await userEvent.keyboard(`{${key}}`);

			await vi.waitFor(() =>
				expect(focusedCell()).toBe(document.querySelector('[data-testid="name-cell"]'))
			);
		}
	);

	it('replaces a name with what is typed over it', async () => {
		seed(confirmed({ students: [student('student-1', 'Ada', 'Lovelace')] }));

		const screen = openMarksheetPage();

		await page.getByTestId('name-cell').click();
		await userEvent.keyboard('G');

		// Typing over a name starts the rename there, with what was typed so far.
		const firstName = page.getByLabelText('First name of Ada Lovelace');
		await expect.element(firstName).toHaveValue('G');

		await firstName.fill('Grace Hopper');
		await userEvent.keyboard('{Enter}');

		expect(rowNames(screen)).toEqual(['Grace Hopper']);
		expect(marksheetStore().document?.students[0]).toMatchObject({
			firstName: 'Grace',
			surname: 'Hopper'
		});
	});

	it('removes a student with their marks, one undo away', async () => {
		seed(
			confirmed({
				students: [
					student('student-1', 'Ada', 'Lovelace'),
					student('student-2', 'Grace', 'Hopper')
				],
				marks: { 'student-1': { 'entry-1': 3 } }
			})
		);

		const screen = openMarksheetPage();

		await page.getByRole('button', { name: 'Remove Ada Lovelace' }).click();

		expect(rowNames(screen)).toEqual(['Grace Hopper']);
		expect(marksheetStore().document?.marks).toEqual({});
		await vi.waitFor(() => expect(readSeeded().students).toHaveLength(1));

		await page.getByTestId('undo').getByRole('button', { name: 'Undo' }).click();

		expect(rowNames(screen)).toEqual(['Ada Lovelace', 'Grace Hopper']);
		expect(marksheetStore().document?.marks).toEqual({ 'student-1': { 'entry-1': 3 } });
	});

	it('flags a student absent without losing their marks', async () => {
		seed(
			confirmed({
				students: [student('student-1', 'Ada', 'Lovelace')],
				marks: { 'student-1': { 'entry-1': 3 } }
			})
		);

		openMarksheetPage();

		const toggle = page.getByRole('button', { name: 'Mark Ada Lovelace absent' });
		await toggle.click();

		await expect.element(toggle).toHaveAttribute('aria-pressed', 'true');
		await expect.element(page.getByTestId('student-row')).toHaveTextContent('absent');
		expect(marksheetStore().document?.marks).toEqual({ 'student-1': { 'entry-1': 3 } });

		await toggle.click();

		await expect.element(toggle).toHaveAttribute('aria-pressed', 'false');
		await expect.element(page.getByTestId('student-row')).toHaveTextContent('1/1');
	});

	it('counts a student’s progress as the entries they have a mark for', async () => {
		seed(
			confirmed({
				breakdown: {
					entries: [entry('entry-1', '1a', '1'), entry('entry-2', '1b', '1')],
					warnings: []
				},
				students: [student('student-1', 'Ada', 'Lovelace')],
				marks: { 'student-1': { 'entry-1': 3 } }
			})
		);

		openMarksheetPage();

		await expect.element(page.getByTestId('student-row')).toHaveTextContent('1/2');
	});

	it('sorts the class by either name part', async () => {
		seed(
			confirmed({
				students: [student('student-1', 'Grace', 'Hopper'), student('student-2', 'Ada', 'Lovelace')]
			})
		);

		const screen = openMarksheetPage();

		await page.getByRole('button', { name: 'By first name' }).click();
		expect(rowNames(screen)).toEqual(['Ada Lovelace', 'Grace Hopper']);

		await page.getByRole('button', { name: 'By surname' }).click();
		expect(rowNames(screen)).toEqual(['Grace Hopper', 'Ada Lovelace']);
	});

	it('names the class in the page heading', async () => {
		seed(confirmed());

		openMarksheetPage();

		await page.getByLabelText('Class name').fill('10C1');

		await vi.waitFor(() => expect(marksheetStore().document?.paper.className).toBe('10C1'));
		expect(document.title).toBe('10C1 · Marksheet · QLA');
	});

	it('shows each column’s label and available marks, with the entry behind a header', async () => {
		seed(confirmed());

		openMarksheetPage();

		const header = page.getByRole('button', { name: 'Details for 2bii' });
		await expect.element(header).toHaveTextContent('/4');

		await header.click();

		await expect.element(page.getByText('3.2.1.4')).toBeInTheDocument();
		await expect.element(page.getByText('Describe', { exact: true })).toBeInTheDocument();
		await expect.element(page.getByText('AO2', { exact: true })).toBeInTheDocument();
	});

	it('bands consecutive columns under their question, and jumps to a band', async () => {
		seed(
			confirmed({
				breakdown: {
					entries: [
						entry('entry-1', '1a', '1'),
						entry('entry-2', '1b', '1'),
						entry('entry-3', '2', '2')
					],
					warnings: []
				},
				students: [student('student-1', 'Ada', 'Lovelace')]
			})
		);

		const screen = openMarksheetPage();

		await expect
			.element(page.getByRole('button', { name: 'Jump to question 1' }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Jump to question 2' }))
			.toBeInTheDocument();

		await page.getByRole('button', { name: 'Jump to question 2' }).click();

		expect(document.activeElement).toBe(markCell(screen, studentIdAt(0), 'entry-3'));
	});

	it('does not open a rename when a row’s own control is double-clicked', async () => {
		seed(confirmed({ students: [student('student-1', 'Ada', 'Lovelace')] }));

		openMarksheetPage();

		await page.getByRole('button', { name: 'Mark Ada Lovelace absent' }).dblClick();

		expect(page.getByLabelText('First name of Ada Lovelace').query()).toBeNull();
		expect(marksheetStore().document?.students[0]).toMatchObject({ absent: false });
	});

	it('flags a band the parse could not read a question number for', async () => {
		seed(
			confirmed({
				breakdown: {
					entries: [entry('entry-1', '3b', '3b')],
					warnings: [
						{
							questionId: 'entry-1',
							code: 'MISSING_QUESTION_NUMBER',
							message: "Entry '3b' has no question number; grouping falls back to its own id."
						},
						{
							questionId: 'entry-1',
							code: 'SUMMARY_LENGTH',
							message: 'Summary is 2 words; expected 3–8 words.'
						}
					]
				}
			})
		);

		openMarksheetPage();

		await expect
			.element(page.getByTestId('fallback-band-count'))
			.toHaveTextContent('1 band without a question number');

		await page.getByRole('button', { name: 'Why question 3b is flagged' }).click();
		await expect.element(page.getByText(/grouping falls back to its own id/)).toBeInTheDocument();
		// The flag is about the question number, so other findings are not here.
		expect(page.getByText(/expected 3–8 words/).query()).toBeNull();
	});

	it('keeps every stored parse warning reachable, run-level ones included', async () => {
		seed(
			confirmed({
				breakdown: {
					entries: [entry('entry-1', '2bii', '2')],
					warnings: [
						{
							questionId: 'entry-1',
							code: 'SUMMARY_LENGTH',
							message: 'Summary is 2 words; expected 3–8 words.'
						},
						{ questionId: null, code: 'MARKS_TOTAL', message: 'Marks total 76; paper says 86.' }
					]
				}
			})
		);

		openMarksheetPage();

		await expect
			.element(page.getByTestId('parse-warnings-count'))
			.toHaveTextContent('2 parse warnings');
		await page.getByTestId('parse-warnings-count').click();
		await expect.element(page.getByText(/Marks total 76; paper says 86/)).toBeInTheDocument();
		await expect.element(page.getByText(/expected 3–8 words/)).toBeInTheDocument();
	});

	it('flags no band when the parse read every question number', async () => {
		seed(confirmed());

		openMarksheetPage();

		expect(page.getByTestId('fallback-band-count').query()).toBeNull();
	});

	it('keeps the name and progress columns in place while a wide paper scrolls', async () => {
		const entries = Array.from({ length: 40 }, (_, index) =>
			entry(`entry-${index}`, `${index + 1}a`, `${index + 1}`)
		);
		seed(
			confirmed({
				breakdown: { entries, warnings: [] },
				students: [student('student-1', 'Alexandrina-Bartholomew-Montgomery', 'Lovelace')]
			})
		);

		const screen = openMarksheetPage();
		const find = (selector: string): HTMLElement => {
			const element = screen.container.querySelector<HTMLElement>(selector);
			if (!element) throw new Error(`no ${selector}`);
			return element;
		};
		const nameCell = find('[data-testid="name-cell"]');
		const progressCell = find('[data-testid="progress-cell"]');
		const lastColumn = find('[data-testid="student-row"] [role="gridcell"]:last-of-type');
		let scroller: HTMLElement | null = nameCell.parentElement;
		while (scroller && scroller.scrollWidth <= scroller.clientWidth) {
			scroller = scroller.parentElement;
		}
		if (!scroller) throw new Error('a paper this wide should scroll');

		const left = (element: HTMLElement) => Math.round(element.getBoundingClientRect().left);
		const before = { name: left(nameCell), progress: left(progressCell), last: left(lastColumn) };
		scroller.scrollLeft = 400;

		await expect.poll(() => left(lastColumn)).toBeLessThan(before.last);
		expect(left(nameCell)).toBe(before.name);
		expect(left(progressCell)).toBe(before.progress);

		// A long name is cut to its column rather than pushing the columns about.
		const name = find('[data-testid="student-name"]');
		expect(name.scrollWidth).toBeGreaterThan(name.clientWidth);
	});
});

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
		return openMarksheetPage();
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
		const screen = openMarksheetPage();

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

		const screen = openMarksheetPage();
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

describe('paste', () => {
	/** Two entries and a class, so a block has both rows and columns to land in. */
	function openPasteGrid(overrides: Partial<MarksheetDocument> = {}) {
		seed(
			confirmed({
				breakdown: {
					entries: [entry('entry-1', '1a', '1'), entry('entry-2', '1b', '1')],
					warnings: []
				},
				students: [student('student-1', 'Ada', 'Lovelace')],
				...overrides
			})
		);
		return openMarksheetPage();
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
					warnings: []
				},
				students: [
					student('student-1', 'Ada', 'Lovelace'),
					student('student-2', 'Grace', 'Hopper')
				],
				marks: { 'student-1': { 'entry-1': 1 }, 'student-2': { 'entry-1': 3 } },
				...overrides
			})
		);
		return openMarksheetPage();
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

	function cellText(
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

		expect(cellText(screen, 'facility-cell', 'entry-1')).toBe('50%');
		expect(cellText(screen, 'facility-cell', 'entry-2')).toBe('—');

		await userEvent.click(markCell(screen, 'student-1', 'entry-1'));
		await userEvent.keyboard('3');
		await userEvent.keyboard('{Enter}');

		await vi.waitFor(() => expect(cellText(screen, 'facility-cell', 'entry-1')).toBe('75%'));
	});

	it('gives a part-marked entry its coverage in the row beneath', async () => {
		const screen = openAnalysisSheet({ marks: { 'student-1': { 'entry-1': 4 } } });

		expect(cellText(screen, 'facility-cell', 'entry-1')).toBe('100%');
		expect(cellText(screen, 'coverage-cell', 'entry-1')).toBe('1/2');
		expect(cellText(screen, 'coverage-cell', 'entry-2')).toBe('');
	});

	it('names the hardest entries in the toolbar, worst first', async () => {
		const screen = openAnalysisSheet({
			breakdown: {
				entries: [
					entry('entry-1', '1a', '1', { marks: 10 }),
					entry('entry-2', '1b', '1', { marks: 10 }),
					entry('entry-3', '1c', '1', { marks: 10 })
				],
				warnings: []
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
				warnings: []
			},
			marks: { 'student-1': { 'entry-green': 9, 'entry-amber': 5, 'entry-red': 2 } }
		});

		await page.getByRole('button', { name: 'View analysis' }).click();

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

		expect(analysisRow('entry-2')?.dataset.highlighted).toBe('true');
	});

	it('opens the analysis at the entry a facility cell names, unfolding Green to reveal it', async () => {
		const entries = Array.from({ length: 40 }, (_, index) =>
			entry(`entry-${index + 1}`, `1${index}`, '1', { marks: 4 })
		);
		seed(
			confirmed({
				breakdown: { entries, warnings: [] },
				students: [student('student-1', 'Ada', 'Lovelace')],
				marks: { 'student-1': { 'entry-40': 4 } }
			})
		);
		const screen = openMarksheetPage();

		await userEvent.click(rowCell(screen, 'facility-cell', 'entry-40'));

		const row = analysisRow('entry-40');
		if (!row) throw new Error('the analysis did not open at the entry');
		expect(row.dataset.highlighted).toBe('true');
		const box = row.getBoundingClientRect();
		expect(box.top).toBeGreaterThanOrEqual(0);
		expect(box.bottom).toBeLessThanOrEqual(window.innerHeight);

		// Back to the marksheet, where the figures are.
		await page.getByRole('button', { name: 'Back to marksheet' }).click();
		await expect.element(page.getByRole('button', { name: 'View analysis' })).toBeInTheDocument();
	});

	it('opens the analysis at the entry a Hardest item names', async () => {
		const screen = openAnalysisSheet({
			marks: { 'student-1': { 'entry-1': 1, 'entry-2': 4 } }
		});

		await page.getByTestId('hardest').getByRole('button', { name: '1a 25%' }).click();

		expect(analysisRow('entry-1')?.dataset.highlighted).toBe('true');
		expect(screen.container.textContent).toContain('Red — below 40%');
	});
});

describe('marks export', () => {
	it('takes the marks into a spreadsheet, which is not a backup', async () => {
		seed(
			confirmed({
				students: [
					student('student-1', 'Ada', 'Lovelace'),
					student('student-2', 'Grace', 'Hopper', true)
				],
				marks: { 'student-1': { 'entry-1': 3 } }
			})
		);
		openMarksheetPage();
		const file = captureDownload();

		await page.getByRole('button', { name: 'Export marks to spreadsheet (.csv)' }).click();

		// Named for the two files to be told apart in a Downloads folder.
		expect(file.filename()).toBe('10x-ph1-class-marks.csv');
		expect(await file.text()).toContain('Lovelace,Ada,,3,3');
		expect(await file.text()).toContain('Hopper,Grace,Y,,0');
		// A marks export cannot be restored from, so the backup stands exactly as
		// old as it was.
		expect(marksheetStore().document?.lastExportedAt).toBeNull();
	});
});
