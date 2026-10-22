// The grade surface: the banner button, the dialog's validation and save,
// and the grid's Total | Grade | To next columns. Test-only: nothing in the
// app imports this.
import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import {
	confirmed,
	entry,
	readSeeded,
	seed,
	student
} from '$lib/marksheet/fixtures.spec-helpers.js';
import type { MarksheetDocument } from '$lib/marksheet/document.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import { openPage } from '../spec-helpers.js';
import MarksheetPage from './+page.svelte';

/** A class covering every column state: full, part-marked, over-max and absent. */
// Paper total is 10: entry-1 offers 4, entry-2 offers 6.
function gradedClass(over: Partial<MarksheetDocument> = {}): MarksheetDocument {
	return confirmed({
		breakdown: {
			entries: [
				entry('entry-1', '1a', '1', { marks: 4, summary: 'Define a term' }),
				entry('entry-2', '1b', '1', { marks: 6, summary: 'Explain the result' })
			],
			warnings: [],
			aoDescriptions: {}
		},
		students: [
			student('full', 'Full', 'Marks'),
			student('partial', 'Part', 'Marked'),
			student('over', 'Over', 'Max'),
			student('absent', 'Ab', 'Sent', true)
		],
		marks: {
			full: { 'entry-1': 4, 'entry-2': 5 },
			partial: { 'entry-1': 2 },
			over: { 'entry-1': 9, 'entry-2': 1 }
		},
		paper: {
			label: '10X Ph1',
			className: null,
			sourceFilenames: ['10X Ph1.pdf'],
			parsedAt: '2026-01-01T10:00:00.000Z',
			boundaries: [
				{ label: 'A', minimum: 9 },
				{ label: 'B', minimum: 5 },
				{ label: 'C', minimum: 2 }
			],
			belowLowestLabel: 'U'
		},
		...over
	});
}

function gradeCell(screen: { container: HTMLElement }, studentId: string): HTMLElement {
	const cell = screen.container.querySelector<HTMLElement>(
		`[data-testid="grade-cell"][data-student-id="${studentId}"]`
	);
	if (!cell) throw new Error(`no grade cell for ${studentId}`);
	return cell;
}

function totalCell(screen: { container: HTMLElement }, studentId: string): HTMLElement {
	const cell = screen.container.querySelector<HTMLElement>(
		`[data-testid="total-cell"][data-student-id="${studentId}"]`
	);
	if (!cell) throw new Error(`no total cell for ${studentId}`);
	return cell;
}

function toNextCell(screen: { container: HTMLElement }, studentId: string): HTMLElement {
	const cell = screen.container.querySelector<HTMLElement>(
		`[data-testid="to-next-cell"][data-student-id="${studentId}"]`
	);
	if (!cell) throw new Error(`no to-next cell for ${studentId}`);
	return cell;
}

describe('grade boundaries', () => {
	it('reads Grade boundaries (n) once grades are set', async () => {
		seed(gradedClass());
		openPage(MarksheetPage);

		await expect
			.element(page.getByRole('button', { name: 'Grade boundaries (3)' }))
			.toBeInTheDocument();
	});

	it('opens Set grade boundaries with no grades yet, saving A level labels', async () => {
		seed(
			confirmed({
				breakdown: {
					entries: [entry('entry-1', '1a', '1', { marks: 10 })],
					warnings: [],
					aoDescriptions: {}
				},
				students: [student('student-1', 'Ada', 'Lovelace')],
				marks: { 'student-1': { 'entry-1': 8 } }
			})
		);
		openPage(MarksheetPage);

		await page.getByRole('button', { name: 'Set grade boundaries' }).click();
		await page.getByRole('radio', { name: 'A level A*–E' }).click();

		await userEvent.fill(page.getByLabelText('Lowest mark for A*'), '8');
		await userEvent.fill(page.getByLabelText('Lowest mark for A', { exact: true }), '7');
		await userEvent.fill(page.getByLabelText('Lowest mark for B'), '5');
		await userEvent.fill(page.getByLabelText('Lowest mark for C', { exact: true }), '3');
		await userEvent.fill(page.getByLabelText('Lowest mark for D'), '2');
		await userEvent.fill(page.getByLabelText('Lowest mark for E'), '1');

		await expect.element(page.getByTestId('grade-boundaries-footer')).toHaveTextContent('6 grades');
		await page.getByRole('button', { name: 'Save boundaries' }).click();

		expect(marksheetStore().document?.paper.boundaries).toEqual([
			{ label: 'A*', minimum: 8 },
			{ label: 'A', minimum: 7 },
			{ label: 'B', minimum: 5 },
			{ label: 'C', minimum: 3 },
			{ label: 'D', minimum: 2 },
			{ label: 'E', minimum: 1 }
		]);
		await expect
			.element(page.getByRole('button', { name: 'Grade boundaries (6)' }))
			.toBeInTheDocument();
	});

	it('shows each problem on its row and keeps Save disabled until fixed', async () => {
		seed(
			confirmed({
				breakdown: {
					entries: [entry('entry-1', '1a', '1', { marks: 10 })],
					warnings: [],
					aoDescriptions: {}
				},
				students: [student('student-1', 'Ada', 'Lovelace')]
			})
		);
		openPage(MarksheetPage);

		await page.getByRole('button', { name: 'Set grade boundaries' }).click();
		await page.getByRole('radio', { name: 'A level A*–E' }).click();

		await userEvent.fill(page.getByLabelText('Lowest mark for A*'), '11');
		await userEvent.fill(page.getByLabelText('Lowest mark for A', { exact: true }), '11');

		const issues = page.getByTestId('grade-row-issues');
		await expect.element(issues.nth(0)).toHaveTextContent('Above the paper total (10)');
		await expect
			.element(issues.nth(1))
			.toHaveTextContent('Above the paper total (10); Must be below the grade above (11)');
		await expect
			.element(page.getByTestId('grade-boundaries-footer'))
			.toHaveTextContent('3 problems to fix');
		await expect.element(page.getByRole('button', { name: 'Save boundaries' })).toBeDisabled();
	});

	it('counts fully-marked students against the working copy, not the saved grades', async () => {
		// Totals are 9 (full) and 2 (part-marked): over-max and absent students
		// are excluded, like the columns exclude them. The saved A9/B5/C2
		// catches one A and no C.
		seed(gradedClass());
		openPage(MarksheetPage);

		await page.getByRole('button', { name: 'Grade boundaries (3)' }).click();
		const counts = page.getByTestId('grade-row-count');
		await expect.element(counts.nth(0)).toHaveTextContent('1');
		await expect.element(counts.nth(2)).toHaveTextContent('0');

		// Raise A's minimum to 10: the 9-total student drops to B, and A catches nobody.
		await userEvent.fill(page.getByLabelText('Lowest mark for A', { exact: true }), '10');
		await expect.element(counts.nth(0)).toHaveTextContent('0');
		await expect.element(counts.nth(1)).toHaveTextContent('1');
		await expect.element(counts.nth(2)).toHaveTextContent('0');
	});

	it('keeps each problem on its own row when a higher row is left blank', async () => {
		seed(gradedClass());
		openPage(MarksheetPage);

		await page.getByRole('button', { name: 'Grade boundaries (3)' }).click();
		// Blank the top grade: it reads as "not used" rather than a problem.
		await userEvent.fill(page.getByLabelText('Lowest mark for A', { exact: true }), '');

		const issues = page.getByTestId('grade-row-issues');
		await expect.element(issues.nth(0)).toHaveTextContent('');
		await expect.element(issues.nth(1)).toHaveTextContent('');
		// Break the middle row instead: the error stays on the middle row.
		await userEvent.fill(page.getByLabelText('Lowest mark for B', { exact: true }), '99');
		await expect.element(issues.nth(1)).toHaveTextContent('Above the paper total (10)');
		await expect.element(issues.nth(2)).toHaveTextContent('');
	});

	it('rejects non-whole marks, duplicate and missing labels, and a clash with the below-lowest label', async () => {
		seed(
			confirmed({
				breakdown: {
					entries: [entry('entry-1', '1a', '1', { marks: 10 })],
					warnings: [],
					aoDescriptions: {}
				},
				students: [student('student-1', 'Ada', 'Lovelace')]
			})
		);
		openPage(MarksheetPage);

		await page.getByRole('button', { name: 'Set grade boundaries' }).click();
		await page.getByRole('radio', { name: 'Custom' }).click();

		await userEvent.fill(page.getByLabelText('Grade 1', { exact: true }), 'A');
		await userEvent.fill(page.getByLabelText('Lowest mark for A', { exact: true }), '8.5');
		await expect.element(page.getByText('Whole marks only')).toBeInTheDocument();

		await userEvent.fill(page.getByLabelText('Grade 1', { exact: true }), '');
		await expect.element(page.getByText('Needs a grade label')).toBeInTheDocument();

		await userEvent.fill(page.getByLabelText('Grade 1', { exact: true }), 'U');
		await userEvent.fill(page.getByLabelText('Lowest mark for U', { exact: true }), '8');
		await expect.element(page.getByText('“U” is the below-lowest label')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Add grade' }).click();
		await userEvent.fill(page.getByLabelText('Lowest mark for grade 2'), '5');
		await userEvent.fill(page.getByLabelText('Grade 2', { exact: true }), 'u');
		const rows = page.getByTestId('grade-row-issues');
		await expect.element(rows.nth(0)).toHaveTextContent('“U” is the below-lowest label');
		await expect.element(rows.nth(1)).toHaveTextContent('is listed twice');
		await expect.element(page.getByRole('button', { name: 'Save boundaries' })).toBeDisabled();
	});

	it('switching scale keeps marks typed against carried-over labels', async () => {
		seed(
			confirmed({
				breakdown: {
					entries: [entry('entry-1', '1a', '1', { marks: 10 })],
					warnings: [],
					aoDescriptions: {}
				},
				students: [student('student-1', 'Ada', 'Lovelace')]
			})
		);
		openPage(MarksheetPage);

		await page.getByRole('button', { name: 'Set grade boundaries' }).click();
		await page.getByRole('radio', { name: 'Custom' }).click();

		await userEvent.fill(page.getByLabelText('Grade 1', { exact: true }), 'A');
		await userEvent.fill(page.getByLabelText('Lowest mark for A', { exact: true }), '8');

		await page.getByRole('radio', { name: 'A level A*–E' }).click();
		await expect
			.element(page.getByLabelText('Lowest mark for A', { exact: true }))
			.toHaveValue('8');

		await page.getByRole('radio', { name: 'Custom' }).click();
		await expect
			.element(page.getByLabelText('Lowest mark for A', { exact: true }))
			.toHaveValue('8');
	});

	it('drops a blank grade on save and removes every boundary on Remove grades', async () => {
		seed(gradedClass());
		openPage(MarksheetPage);

		await page.getByRole('button', { name: 'Grade boundaries (3)' }).click();
		await userEvent.fill(page.getByLabelText('Lowest mark for C', { exact: true }), '');

		// The blank row reads as "not used" rather than a problem: saving keeps
		// two grades.
		await expect.element(page.getByTestId('grade-boundaries-footer')).toHaveTextContent('2 grades');
		await page.getByRole('button', { name: 'Save boundaries' }).click();
		expect(marksheetStore().document?.paper.boundaries).toEqual([
			{ label: 'A', minimum: 9 },
			{ label: 'B', minimum: 5 }
		]);

		await page.getByRole('button', { name: 'Grade boundaries (2)' }).click();
		await page.getByRole('button', { name: 'Remove grades' }).click();
		expect(marksheetStore().document?.paper.boundaries).toBeNull();
		await expect
			.element(page.getByRole('button', { name: 'Set grade boundaries' }))
			.toBeInTheDocument();
	});

	it('edits a working copy: closing without saving leaves the grades alone', async () => {
		seed(gradedClass());
		openPage(MarksheetPage);

		await page.getByRole('button', { name: 'Grade boundaries (3)' }).click();
		await userEvent.fill(page.getByLabelText('Lowest mark for A', { exact: true }), '7');
		await userEvent.keyboard('{Escape}');

		expect(marksheetStore().document?.paper.boundaries).toEqual([
			{ label: 'A', minimum: 9 },
			{ label: 'B', minimum: 5 },
			{ label: 'C', minimum: 2 }
		]);
	});

	it('undo takes a boundary save back, and removing tells what it did', async () => {
		seed(gradedClass());
		openPage(MarksheetPage);

		await page.getByRole('button', { name: 'Grade boundaries (3)' }).click();
		await userEvent.fill(page.getByLabelText('Lowest mark for A', { exact: true }), '10');
		await page.getByRole('button', { name: 'Save boundaries' }).click();
		expect(marksheetStore().document?.paper.boundaries?.[0]).toEqual({
			label: 'A',
			minimum: 10
		});

		await page.getByTestId('undo').getByRole('button', { name: 'Undo' }).click();
		expect(marksheetStore().document?.paper.boundaries).toEqual([
			{ label: 'A', minimum: 9 },
			{ label: 'B', minimum: 5 },
			{ label: 'C', minimum: 2 }
		]);

		await page.getByRole('button', { name: 'Grade boundaries (3)' }).click();
		await page.getByRole('button', { name: 'Remove grades' }).click();
		expect(marksheetStore().document?.paper.boundaries).toBeNull();
		await expect.element(page.getByText('Grade boundaries removed.')).toBeInTheDocument();
	});

	it('boundaries saved in the dialog reach storage, and a blank scale saves marks only', async () => {
		seed(
			confirmed({
				breakdown: {
					entries: [entry('entry-1', '1a', '1', { marks: 10 })],
					warnings: [],
					aoDescriptions: {}
				},
				students: [student('student-1', 'Ada', 'Lovelace')],
				marks: { 'student-1': { 'entry-1': 8 } }
			})
		);
		openPage(MarksheetPage);

		await page.getByRole('button', { name: 'Set grade boundaries' }).click();
		await page.getByRole('radio', { name: 'A level A*–E' }).click();
		await userEvent.fill(page.getByLabelText('Lowest mark for A*'), '8');
		await page.getByRole('button', { name: 'Save boundaries' }).click();

		marksheetStore().flush();
		expect(readSeeded().paper.boundaries).toEqual([{ label: 'A*', minimum: 8 }]);

		await page.getByRole('button', { name: 'Grade boundaries (1)' }).click();
		await userEvent.fill(page.getByLabelText('Lowest mark for A*'), '');
		await expect
			.element(page.getByTestId('grade-boundaries-footer'))
			.toHaveTextContent('No grades: reports show marks only');
		await page.getByRole('button', { name: 'Save boundaries' }).click();
		expect(marksheetStore().document?.paper.boundaries).toBeNull();
	});
});
describe('marksheet grade columns', () => {
	it('shows Total, Grade and To next for a full student, with Top-grade blank', async () => {
		seed(gradedClass());
		const screen = openPage(MarksheetPage);

		expect(totalCell(screen, 'full').textContent?.trim()).toBe('9');
		expect(gradeCell(screen, 'full').textContent?.trim()).toBe('A');
		expect(toNextCell(screen, 'full').textContent?.trim()).toBe('');
	});

	it('shows a provisional grade with "so far" for a part-marked student', async () => {
		seed(gradedClass());
		const screen = openPage(MarksheetPage);

		expect(totalCell(screen, 'partial').textContent?.trim()).toBe('2');
		expect(gradeCell(screen, 'partial').textContent?.trim()).toBe('C*');
		expect(toNextCell(screen, 'partial').textContent?.trim()).toBe('so far');
	});

	it('shows "2 to B" style nudges below the top grade', async () => {
		seed(
			gradedClass({
				marks: {
					full: { 'entry-1': 4, 'entry-2': 3 },
					partial: { 'entry-1': 2 },
					over: { 'entry-1': 9, 'entry-2': 1 }
				}
			})
		);
		const screen = openPage(MarksheetPage);

		expect(totalCell(screen, 'full').textContent?.trim()).toBe('7');
		expect(gradeCell(screen, 'full').textContent?.trim()).toBe('B');
		expect(toNextCell(screen, 'full').textContent?.trim()).toBe('2 to A');
	});

	it('shows ! for over-max and nothing for absent', async () => {
		seed(gradedClass());
		const screen = openPage(MarksheetPage);

		expect(gradeCell(screen, 'over').textContent?.trim()).toBe('!');
		expect(totalCell(screen, 'absent').textContent?.trim()).toBe('');
		expect(gradeCell(screen, 'absent').textContent?.trim()).toBe('');
	});

	it('shows only Total without boundaries', async () => {
		seed(gradedClass({ paper: { ...gradedClass().paper, boundaries: null } }));
		const screen = openPage(MarksheetPage);

		expect(totalCell(screen, 'full').textContent?.trim()).toBe('9');
		expect(
			screen.container.querySelector('[data-testid="grade-cell"][data-student-id="full"]')
		).toBeNull();
		expect(
			screen.container.querySelector('[data-testid="to-next-cell"][data-student-id="full"]')
		).toBeNull();
	});
});
