// The grade surface: the banner button, the dialog's validation and save,
// the tier name field, and the grid's Total | Grade | To next columns.
// Test-only: nothing in the app imports this.
import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import {
	confirmed,
	entry,
	readSeeded,
	seed,
	student,
	tier
} from '$lib/marksheet/fixtures.spec-helpers.js';
import type { BreakdownEntry, MarksheetDocument, StoredTier } from '$lib/marksheet/document.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import { openPage } from '../spec-helpers.js';
import MarksheetPage from './+page.svelte';

/** One tier carrying these entries, and whatever else the test seeds. */
function withEntries(
	entries: BreakdownEntry[],
	over: Partial<MarksheetDocument> = {}
): MarksheetDocument {
	return confirmed({
		tiers: [tier({ breakdown: { entries, warnings: [] } })],
		...over
	});
}

/** A class covering every column state: full, part-marked, over-max and absent. */
// Paper total is 10: entry-1 offers 4, entry-2 offers 6.
function gradedClass(over: Partial<MarksheetDocument> = {}): MarksheetDocument {
	return confirmed({
		tiers: [
			tier({
				breakdown: {
					entries: [
						entry('entry-1', '1a', '1', { marks: 4, summary: 'Define a term' }),
						entry('entry-2', '1b', '1', { marks: 6, summary: 'Explain the result' })
					],
					warnings: []
				},
				boundaries: [
					{ label: 'A', minimum: 9 },
					{ label: 'B', minimum: 5 },
					{ label: 'C', minimum: 2 }
				]
			})
		],
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
		...over
	});
}

/** Two papers with a grade each, and one student on each. */
function twoTierGraded(over: Partial<MarksheetDocument> = {}): MarksheetDocument {
	return confirmed({
		tiers: [
			tier({
				tierName: 'Higher',
				breakdown: { entries: [entry('higher-1', 'H1', '1', { marks: 10 })], warnings: [] },
				boundaries: [{ label: 'A', minimum: 9 }]
			}),
			tier({
				tierName: 'Foundation',
				breakdown: { entries: [entry('foundation-1', 'F1', '1', { marks: 10 })], warnings: [] },
				boundaries: [{ label: 'C', minimum: 1 }]
			})
		],
		students: [
			student('higher-student', 'Ada', 'Lovelace', false, 0),
			student('foundation-student', 'Grace', 'Hopper', false, 1)
		],
		marks: {
			'higher-student': { 'higher-1': 9 },
			'foundation-student': { 'foundation-1': 2 }
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
			withEntries([entry('entry-1', '1a', '1', { marks: 10 })], {
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

		expect(marksheetStore().document?.tiers[0].boundaries).toEqual([
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
			withEntries([entry('entry-1', '1a', '1', { marks: 10 })], {
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
			withEntries([entry('entry-1', '1a', '1', { marks: 10 })], {
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
			withEntries([entry('entry-1', '1a', '1', { marks: 10 })], {
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
		expect(marksheetStore().document?.tiers[0].boundaries).toEqual([
			{ label: 'A', minimum: 9 },
			{ label: 'B', minimum: 5 }
		]);

		await page.getByRole('button', { name: 'Grade boundaries (2)' }).click();
		await page.getByRole('button', { name: 'Remove grades' }).click();
		expect(marksheetStore().document?.tiers[0].boundaries).toBeNull();
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

		expect(marksheetStore().document?.tiers[0].boundaries).toEqual([
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
		expect(marksheetStore().document?.tiers[0].boundaries?.[0]).toEqual({
			label: 'A',
			minimum: 10
		});

		await page.getByTestId('undo').getByRole('button', { name: 'Undo' }).click();
		expect(marksheetStore().document?.tiers[0].boundaries).toEqual([
			{ label: 'A', minimum: 9 },
			{ label: 'B', minimum: 5 },
			{ label: 'C', minimum: 2 }
		]);

		await page.getByRole('button', { name: 'Grade boundaries (3)' }).click();
		await page.getByRole('button', { name: 'Remove grades' }).click();
		expect(marksheetStore().document?.tiers[0].boundaries).toBeNull();
		await expect.element(page.getByText('Grade boundaries removed.')).toBeInTheDocument();
	});

	it('boundaries saved in the dialog reach storage, and a blank scale saves marks only', async () => {
		seed(
			withEntries([entry('entry-1', '1a', '1', { marks: 10 })], {
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
		expect(readSeeded().tiers[0].boundaries).toEqual([{ label: 'A*', minimum: 8 }]);

		await page.getByRole('button', { name: 'Grade boundaries (1)' }).click();
		await userEvent.fill(page.getByLabelText('Lowest mark for A*'), '');
		await expect
			.element(page.getByTestId('grade-boundaries-footer'))
			.toHaveTextContent('No grades: reports show marks only');
		await page.getByRole('button', { name: 'Save boundaries' }).click();
		expect(marksheetStore().document?.tiers[0].boundaries).toBeNull();
	});
});

describe('two-tier boundaries', () => {
	it('names each tier’s button and dialog, and saves only the open tier', async () => {
		const doc = twoTierGraded();
		doc.tiers[0].boundaries = null;
		const foundationBoundaries = doc.tiers[1].boundaries;
		seed(doc);
		openPage(MarksheetPage);

		await page.getByRole('button', { name: 'Set Higher boundaries' }).click();
		await expect
			.element(page.getByRole('dialog').getByText('Grade boundaries · Tier 1 · Higher'))
			.toBeInTheDocument();

		await page.getByRole('radio', { name: 'A level A*–E' }).click();
		await userEvent.fill(page.getByLabelText('Lowest mark for A*'), '8');
		await page.getByRole('button', { name: 'Save boundaries' }).click();

		expect(marksheetStore().document?.tiers[0].boundaries).toEqual([{ label: 'A*', minimum: 8 }]);
		expect(marksheetStore().document?.tiers[1].boundaries).toEqual(foundationBoundaries);
		await expect
			.element(page.getByRole('button', { name: 'Higher boundaries (1)' }))
			.toBeInTheDocument();

		await page.getByRole('radio', { name: /Tier 2 · Foundation/ }).click();
		await expect
			.element(page.getByRole('button', { name: 'Foundation boundaries (1)' }))
			.toBeInTheDocument();
		await page.getByRole('button', { name: 'Foundation boundaries (1)' }).click();
		await expect
			.element(page.getByRole('dialog').getByText('Grade boundaries · Tier 2 · Foundation'))
			.toBeInTheDocument();
	});

	it('keeps grade columns and totals on the open tier’s paper', async () => {
		const doc = twoTierGraded();
		doc.tiers[1].boundaries = null;
		seed(doc);
		const screen = openPage(MarksheetPage);

		expect(totalCell(screen, 'higher-student').textContent?.trim()).toBe('9');
		expect(gradeCell(screen, 'higher-student').textContent?.trim()).toBe('A');

		await page.getByRole('radio', { name: /Tier 2 · Foundation/ }).click();

		await expect
			.element(page.getByTestId('total-cell').filter({ hasText: '2' }))
			.toBeInTheDocument();
		expect(totalCell(screen, 'foundation-student').textContent?.trim()).toBe('2');
		expect(
			screen.container.querySelector(
				'[data-testid="grade-cell"][data-student-id="foundation-student"]'
			)
		).toBeNull();
		expect(
			screen.container.querySelector(
				'[data-testid="to-next-cell"][data-student-id="foundation-student"]'
			)
		).toBeNull();
	});

	it('edits a tier name, blank allowed on one tier and distinct names required on two', async () => {
		seed(twoTierGraded());
		openPage(MarksheetPage);

		await page.getByRole('button', { name: 'Higher boundaries (1)' }).click();
		const name = page.getByTestId('tier-name');
		await userEvent.fill(name, 'Higher Tier');
		await page.getByTestId('tier-name-save').click();

		expect(marksheetStore().document?.tiers[0].tierName).toBe('Higher Tier');
		// A printed name is display data: there is no rename to take back.
		expect(marksheetStore().undoable).toBeNull();
		await expect
			.element(page.getByRole('dialog').getByText('Grade boundaries · Tier 1 · Higher Tier'))
			.toBeInTheDocument();

		// Another tier's name is refused: the tabs must stay tellable apart.
		await userEvent.fill(name, 'Foundation');
		await expect
			.element(page.getByTestId('tier-name-issue'))
			.toHaveTextContent('The two tiers need different names.');
		await expect.element(page.getByTestId('tier-name-save')).toBeDisabled();
		expect(marksheetStore().document?.tiers[0].tierName).toBe('Higher Tier');

		await userEvent.fill(name, '');
		await expect
			.element(page.getByTestId('tier-name-issue'))
			.toHaveTextContent('Each tier needs a name.');
		await expect.element(page.getByTestId('tier-name-save')).toBeDisabled();
	});

	it('lets a single tier have no name at all', async () => {
		seed(gradedClass());
		openPage(MarksheetPage);

		await page.getByRole('button', { name: 'Grade boundaries (3)' }).click();
		await expect
			.element(page.getByRole('dialog').getByText('Grade boundaries', { exact: true }))
			.toBeInTheDocument();
		const name = page.getByTestId('tier-name');
		await userEvent.fill(name, 'Higher');
		await page.getByTestId('tier-name-save').click();
		expect(marksheetStore().document?.tiers[0].tierName).toBe('Higher');

		await userEvent.fill(name, '');
		await page.getByTestId('tier-name-save').click();
		expect(marksheetStore().document?.tiers[0].tierName).toBeNull();
		expect(page.getByTestId('tier-name-issue').query()).toBeNull();
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
		const doc = gradedClass();
		doc.tiers[0].boundaries = null;
		seed(doc);
		const screen = openPage(MarksheetPage);

		expect(totalCell(screen, 'full').textContent?.trim()).toBe('9');
		expect(
			screen.container.querySelector('[data-testid="grade-cell"][data-student-id="full"]')
		).toBeNull();
		expect(
			screen.container.querySelector('[data-testid="to-next-cell"][data-student-id="full"]')
		).toBeNull();
	});

	describe('percent entry', () => {
		function seedPaper(total: number, boundaries: StoredTier['boundaries']) {
			const doc = gradedClass();
			doc.tiers[0].breakdown.entries =
				total > 0 ? [entry('entry-1', '1a', '1', { marks: total })] : [];
			doc.tiers[0].boundaries = boundaries;
			seed(doc);
		}

		it('converts a typed percentage up to a raw mark and stores the mark', async () => {
			seedPaper(83, null);
			openPage(MarksheetPage);
			await page.getByRole('button', { name: 'Set grade boundaries' }).click();
			await page.getByRole('radio', { name: 'A level A*–E' }).click();
			await page.getByRole('radio', { name: '%' }).click();

			await userEvent.fill(page.getByLabelText('Lowest percentage for A*'), '65');
			await expect.element(page.getByText('→ 54/83')).toBeInTheDocument();
			await userEvent.fill(page.getByLabelText('Lowest percentage for A', { exact: true }), '50');
			await expect.element(page.getByText('→ 42/83')).toBeInTheDocument();
			await page.getByRole('button', { name: 'Save boundaries' }).click();
			// 50% of 83 = 41.5 → 42, and A* must sit above A.
			expect(marksheetStore().document?.tiers[0].boundaries).toEqual([
				{ label: 'A*', minimum: 54 },
				{ label: 'A', minimum: 42 }
			]);
		});

		it('stores an exact mark, and the bounds 100 and 0', async () => {
			seedPaper(80, null);
			openPage(MarksheetPage);
			await page.getByRole('button', { name: 'Set grade boundaries' }).click();
			await page.getByRole('radio', { name: 'A level A*–E' }).click();
			await page.getByRole('radio', { name: '%' }).click();
			await userEvent.fill(page.getByLabelText('Lowest percentage for A*'), '100');
			await userEvent.fill(page.getByLabelText('Lowest percentage for A', { exact: true }), '50');
			await userEvent.fill(page.getByLabelText('Lowest percentage for B'), '0');
			await page.getByRole('button', { name: 'Save boundaries' }).click();
			expect(marksheetStore().document?.tiers[0].boundaries).toEqual([
				{ label: 'A*', minimum: 80 },
				{ label: 'A', minimum: 40 },
				{ label: 'B', minimum: 0 }
			]);
		});

		it('keeps saved raw marks identical across a Marks → % → Marks switch', async () => {
			seedPaper(83, [
				{ label: 'A', minimum: 54 },
				{ label: 'B', minimum: 31 }
			]);
			openPage(MarksheetPage);
			await page.getByRole('button', { name: 'Grade boundaries (2)' }).click();
			await page.getByRole('radio', { name: '%' }).click();
			await expect.element(page.getByLabelText('Lowest percentage for A')).toHaveValue('65');
			await page.getByRole('radio', { name: 'Marks' }).click();
			await expect.element(page.getByLabelText('Lowest mark for A')).toHaveValue('54');
			await page.getByRole('radio', { name: '%' }).click();
			await page.getByRole('button', { name: 'Save boundaries' }).click();
			expect(marksheetStore().document?.tiers[0].boundaries).toEqual([
				{ label: 'A', minimum: 54 },
				{ label: 'B', minimum: 31 }
			]);
		});

		it('clears a boundary when its % field is emptied, so Save drops it', async () => {
			seedPaper(83, [
				{ label: 'A', minimum: 54 },
				{ label: 'B', minimum: 31 }
			]);
			openPage(MarksheetPage);
			await page.getByRole('button', { name: 'Grade boundaries (2)' }).click();
			await page.getByRole('radio', { name: '%' }).click();

			await userEvent.fill(page.getByLabelText('Lowest percentage for A', { exact: true }), '');
			await expect.element(page.getByText('→ 54/83')).not.toBeInTheDocument();
			await expect
				.element(page.getByTestId('grade-boundaries-footer'))
				.toHaveTextContent('1 grade');
			await page.getByRole('button', { name: 'Save boundaries' }).click();
			expect(marksheetStore().document?.tiers[0].boundaries).toEqual([{ label: 'B', minimum: 31 }]);
		});

		it('restores the stored mark when switching back to Marks after invalid % text', async () => {
			seedPaper(83, [
				{ label: 'A', minimum: 54 },
				{ label: 'B', minimum: 31 }
			]);
			openPage(MarksheetPage);
			await page.getByRole('button', { name: 'Grade boundaries (2)' }).click();
			await page.getByRole('radio', { name: '%' }).click();

			await userEvent.fill(page.getByLabelText('Lowest percentage for A', { exact: true }), 'abc');
			await expect
				.element(page.getByTestId('grade-boundaries-footer'))
				.toHaveTextContent('1 problem to fix');
			await page.getByRole('radio', { name: 'Marks' }).click();
			await expect
				.element(page.getByLabelText('Lowest mark for A', { exact: true }))
				.toHaveValue('54');
			await expect
				.element(page.getByTestId('grade-boundaries-footer'))
				.toHaveTextContent('2 grades');
			await page.getByRole('button', { name: 'Save boundaries' }).click();
			expect(marksheetStore().document?.tiers[0].boundaries).toEqual([
				{ label: 'A', minimum: 54 },
				{ label: 'B', minimum: 31 }
			]);
		});

		it('flags out-of-range and non-numeric percentages and blocks Save', async () => {
			seedPaper(83, null);
			openPage(MarksheetPage);
			await page.getByRole('button', { name: 'Set grade boundaries' }).click();
			await page.getByRole('radio', { name: 'A level A*–E' }).click();
			await page.getByRole('radio', { name: '%' }).click();
			for (const bad of ['-1', '101', 'abc']) {
				await userEvent.fill(page.getByLabelText('Lowest percentage for A*'), bad);
				await expect
					.element(page.getByTestId('grade-boundaries-footer'))
					.toHaveTextContent('1 problem to fix');
				await expect.element(page.getByRole('button', { name: 'Save boundaries' })).toBeDisabled();
			}
		});

		it('checks ordering on the converted marks', async () => {
			seedPaper(83, null);
			openPage(MarksheetPage);
			await page.getByRole('button', { name: 'Set grade boundaries' }).click();
			await page.getByRole('radio', { name: 'A level A*–E' }).click();
			await page.getByRole('radio', { name: '%' }).click();
			await userEvent.fill(page.getByLabelText('Lowest percentage for A*'), '65');
			await userEvent.fill(page.getByLabelText('Lowest percentage for A', { exact: true }), '65');
			await expect
				.element(page.getByText('Must be below the grade above (54)'))
				.toBeInTheDocument();
		});

		it('disables the % toggle on a paper with no marks', async () => {
			seedPaper(0, null);
			openPage(MarksheetPage);
			await page.getByRole('button', { name: 'Set grade boundaries' }).click();
			await expect.element(page.getByRole('radio', { name: '%' })).toBeDisabled();
		});
	});
});
