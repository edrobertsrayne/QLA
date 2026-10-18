import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
// The frozen columns and truncated names are Tailwind classes, so the
// stylesheet has to be in the page for their computed styles to mean anything.
import '../../app.css';
import { DOCUMENT_SCHEMA_VERSION, STORAGE_KEY } from '$lib/marksheet/document.js';
import type { BreakdownEntry, MarksheetDocument, StoredStudent } from '$lib/marksheet/document.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import { load as marksheetLoad } from './+page.js';
import MarksheetPage from './+page.svelte';

const NOW = '2026-01-01T10:00:00.000Z';

function entry(
	id: string,
	label: string,
	questionNumber: string,
	overrides: Partial<BreakdownEntry> = {}
): BreakdownEntry {
	return {
		id,
		label,
		questionNumber,
		marks: 4,
		summary: 'Describe the rate change',
		specPoint: '3.2.1.4',
		commandWord: 'Describe',
		ao: 'AO2',
		...overrides
	};
}

function student(id: string, firstName: string, surname: string, absent = false): StoredStudent {
	return { id, firstName, surname, absent };
}

/** A confirmed document: the state the marksheet route exists for. */
function confirmed(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
	return {
		schemaVersion: DOCUMENT_SCHEMA_VERSION,
		createdAt: NOW,
		updatedAt: NOW,
		breakdownConfirmedAt: NOW,
		lastExportedAt: null,
		paper: {
			label: '10X Ph1',
			className: null,
			sourceFilenames: ['10X Ph1.pdf'],
			parsedAt: NOW
		},
		breakdown: { entries: [entry('entry-1', '2bii', '2')], warnings: [] },
		students: [],
		marks: {},
		...overrides
	};
}

function seed(stored: MarksheetDocument): void {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

function storedDocument(): MarksheetDocument {
	return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as MarksheetDocument;
}

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

beforeEach(() => {
	// A fresh surface: the store keeps changes the tab has not written, so a
	// previous test's class is wiped rather than carried into this one.
	marksheetStore().wipe();
	localStorage.clear();
});

/** The route's load guard reads storage before the page renders. */
function openMarksheetPage() {
	marksheetLoad();
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
		await vi.waitFor(() => expect(storedDocument().students).toHaveLength(1));

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

	it('flags no band when the parse read every question number', async () => {
		seed(confirmed());

		openMarksheetPage();

		expect(page.getByTestId('fallback-band-count').query()).toBeNull();
	});

	it('freezes the name and progress columns, and the band label with them', async () => {
		seed(
			confirmed({
				breakdown: {
					entries: [entry('entry-1', '1a', '1'), entry('entry-2', '1b', '1')],
					warnings: []
				},
				students: [student('student-1', 'Alexandrina', 'Lovelace')]
			})
		);

		const screen = openMarksheetPage();

		const style = (selector: string): CSSStyleDeclaration => {
			const element = screen.container.querySelector<HTMLElement>(selector);
			if (!element) throw new Error(`no ${selector}`);
			return getComputedStyle(element);
		};

		// The name, the progress count and the band label stay put while the
		// columns scroll under them.
		expect(style('[data-testid="name-cell"]').position).toBe('sticky');
		expect(style('[data-testid="name-cell"]').left).toBe('0px');
		expect(style('[data-testid="progress-cell"]').position).toBe('sticky');
		expect(style('[data-band-label]').position).toBe('sticky');

		// A long name truncates rather than pushing the columns about.
		expect(style('[data-testid="student-name"]').textOverflow).toBe('ellipsis');
	});
});
