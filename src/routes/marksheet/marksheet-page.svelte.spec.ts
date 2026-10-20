import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import {
	confirmed,
	entry,
	seed,
	readSeeded,
	student
} from '$lib/marksheet/fixtures.spec-helpers.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import { openPage } from '../spec-helpers.js';
import { rowNames, markCell, studentIdAt, focusedCell } from './marksheet.spec-helpers.js';
import MarksheetPage from './+page.svelte';

describe('marksheet page', () => {
	it('starts the class from a pasted column of names', async () => {
		seed(confirmed());

		const screen = openPage(MarksheetPage);

		await expect.element(page.getByText('No students on this marksheet yet.')).toBeInTheDocument();

		await page
			.getByLabelText('Paste a column of names')
			.fill('Lovelace, Ada\nGrace Brewster Hopper\nCher');
		await page.getByRole('button', { name: 'Add students', exact: true }).click();

		expect(rowNames(screen)).toEqual(['Ada Lovelace', 'Grace Brewster Hopper', 'Cher']);
	});

	it('adds students one at a time, opening the next row each time', async () => {
		seed(confirmed());

		const screen = openPage(MarksheetPage);

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

		const screen = openPage(MarksheetPage);

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

		const screen = openPage(MarksheetPage);

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

		openPage(MarksheetPage);

		await page.getByTestId('name-cell').click();
		await userEvent.keyboard('{F2}');

		await expect.element(page.getByLabelText('First name of Ada Lovelace')).toHaveValue('Ada');
		await expect.element(page.getByLabelText('Surname of Ada Lovelace')).toHaveValue('Lovelace');
	});

	it.each(['Enter', 'Escape'])(
		'keeps the keyboard on the name cell after %s in a rename',
		async (key) => {
			seed(confirmed({ students: [student('student-1', 'Ada', 'Lovelace')] }));

			openPage(MarksheetPage);

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

		const screen = openPage(MarksheetPage);

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

		const screen = openPage(MarksheetPage);

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

		openPage(MarksheetPage);

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

		openPage(MarksheetPage);

		await expect.element(page.getByTestId('student-row')).toHaveTextContent('1/2');
	});

	it('sorts the class by either name part', async () => {
		seed(
			confirmed({
				students: [student('student-1', 'Grace', 'Hopper'), student('student-2', 'Ada', 'Lovelace')]
			})
		);

		const screen = openPage(MarksheetPage);

		await page.getByRole('button', { name: 'By first name' }).click();
		expect(rowNames(screen)).toEqual(['Ada Lovelace', 'Grace Hopper']);

		await page.getByRole('button', { name: 'By surname' }).click();
		expect(rowNames(screen)).toEqual(['Grace Hopper', 'Ada Lovelace']);
	});

	it('names the class in the page heading', async () => {
		seed(confirmed());

		openPage(MarksheetPage);

		await page.getByLabelText('Class name').fill('10C1');

		await vi.waitFor(() => expect(marksheetStore().document?.paper.className).toBe('10C1'));
		expect(document.title).toBe('10C1 · Marksheet · QLA');
	});

	it('shows each column’s label and available marks, with the entry behind a header', async () => {
		seed(confirmed());

		openPage(MarksheetPage);

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

		const screen = openPage(MarksheetPage);

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

		openPage(MarksheetPage);

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

		openPage(MarksheetPage);

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

		openPage(MarksheetPage);

		await expect
			.element(page.getByTestId('parse-warnings-count'))
			.toHaveTextContent('2 parse warnings');
		await page.getByTestId('parse-warnings-count').click();
		await expect.element(page.getByText(/Marks total 76; paper says 86/)).toBeInTheDocument();
		await expect.element(page.getByText(/expected 3–8 words/)).toBeInTheDocument();
	});

	it('flags no band when the parse read every question number', async () => {
		seed(confirmed());

		openPage(MarksheetPage);

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

		const screen = openPage(MarksheetPage);
		const find = (selector: string): HTMLElement => {
			const element = screen.container.querySelector<HTMLElement>(selector);
			if (!element) throw new Error(`no ${selector}`);
			return element;
		};
		const nameCell = find('[data-testid="name-cell"]');
		const progressCell = find('[data-testid="progress-cell"]');
		const lastColumn = markCell(screen, 'student-1', 'entry-39');
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
