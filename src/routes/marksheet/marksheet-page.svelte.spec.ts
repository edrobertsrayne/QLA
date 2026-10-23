import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { Toaster } from '$lib/components/ui/sonner/index.js';
import type { MarksheetDocument } from '$lib/marksheet/document.js';
import {
	confirmed,
	entry,
	seed,
	readSeeded,
	student,
	tier
} from '$lib/marksheet/fixtures.spec-helpers.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import { generationInputFor } from '$lib/marksheet/report-input.js';
import { openPage } from '../spec-helpers.js';
import {
	rowNames,
	markCell,
	studentIdAt,
	progressText,
	focusedCell,
	twoTier
} from './marksheet.spec-helpers.js';
import MarksheetPage from './+page.svelte';

/** One tier's breakdown and its students: the shape most of these tests override. */
function withTier(
	tierOverrides: Parameters<typeof tier>[0],
	exact: Partial<MarksheetDocument> = {}
): MarksheetDocument {
	return confirmed({ tiers: [tier(tierOverrides)], ...exact });
}

function totalCell(screen: { container: HTMLElement }, studentId: string): HTMLElement {
	const cell = screen.container.querySelector<HTMLElement>(
		`[data-testid="total-cell"][data-student-id="${studentId}"]`
	);
	if (!cell) throw new Error(`no total cell for ${studentId}`);
	return cell;
}

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

	it('drops the report of a removed student at once, so the banner count is right', async () => {
		const doc = confirmed({
			students: [student('student-1', 'Ada', 'Lovelace'), student('student-2', 'Grace', 'Hopper')],
			marks: { 'student-1': { 'entry-1': 3 }, 'student-2': { 'entry-1': 2 } }
		});
		const input = generationInputFor(doc, 'student-1');
		if (!input) throw new Error('no generation input');
		const report = {
			strengths: ['Careful working'],
			areasForImprovement: ['Check units'],
			edit: null,
			input,
			model: 'test/model',
			generatedAt: '2026-01-01T10:00:00.000Z'
		};
		doc.reports = { 'student-1': report, 'student-2': { ...report } };
		seed(doc);
		openPage(MarksheetPage);

		await expect.element(page.getByText('2 reports written for this paper')).toBeInTheDocument();
		await page.getByRole('button', { name: 'Remove Ada Lovelace' }).click();

		await expect.element(page.getByText('1 report written for this paper')).toBeInTheDocument();
		expect(Object.keys(marksheetStore().document?.reports ?? {})).toEqual(['student-2']);
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
			withTier(
				{
					breakdown: {
						entries: [entry('entry-1', '1a', '1'), entry('entry-2', '1b', '1')],
						warnings: []
					}
				},
				{
					students: [student('student-1', 'Ada', 'Lovelace')],
					marks: { 'student-1': { 'entry-1': 3 } }
				}
			)
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

		await vi.waitFor(() => expect(marksheetStore().document?.className).toBe('10C1'));
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
			withTier(
				{
					breakdown: {
						entries: [
							entry('entry-1', '1a', '1'),
							entry('entry-2', '1b', '1'),
							entry('entry-3', '2', '2')
						],
						warnings: []
					}
				},
				{ students: [student('student-1', 'Ada', 'Lovelace')] }
			)
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
			withTier({
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
			withTier({
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
			withTier(
				{ breakdown: { entries, warnings: [] } },
				{ students: [student('student-1', 'Alexandrina-Bartholomew-Montgomery', 'Lovelace')] }
			)
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

describe('tiers', () => {
	it('opens on Tier not set while nobody has a tier, with no mark columns', async () => {
		seed(
			twoTier({
				students: [
					student('student-1', 'Ada', 'Lovelace', false, null),
					student('student-2', 'Grace', 'Hopper', false, null)
				]
			})
		);

		const screen = openPage(MarksheetPage);

		await expect
			.element(page.getByRole('radio', { name: /Tier not set/ }))
			.toHaveAttribute('aria-checked', 'true');
		await expect
			.element(page.getByText(/A student needs a tier before their marks can go in/))
			.toBeInTheDocument();
		expect(screen.container.querySelector('[data-testid="mark-cell"]')).toBeNull();
		expect(rowNames(screen)).toEqual(['Ada Lovelace', 'Grace Hopper']);
	});

	it('opens on Tier 1 once a student has a tier', async () => {
		seed(
			twoTier({
				students: [
					student('student-1', 'Ada', 'Lovelace', false, 0),
					student('student-2', 'Grace', 'Hopper', false, null)
				]
			})
		);

		const screen = openPage(MarksheetPage);

		await expect
			.element(page.getByRole('radio', { name: /Tier 1 · Higher/ }))
			.toHaveAttribute('aria-checked', 'true');
		// The open tier's paper, not the waiting students.
		expect(rowNames(screen)).toEqual(['Ada Lovelace']);
		expect(markCell(screen, 'student-1', 'higher-1').textContent?.trim()).toBe('');
		expect(page.getByText(/A student needs a tier/).query()).toBeNull();
	});

	it('sets a student’s tier one by one and says when every student has one', async () => {
		seed(
			twoTier({
				students: [
					student('student-1', 'Ada', 'Lovelace', false, null),
					student('student-2', 'Grace', 'Hopper', false, null)
				]
			})
		);

		openPage(MarksheetPage);

		await page.getByRole('button', { name: 'Tier 1 · Higher' }).first().click();
		await vi.waitFor(() => expect(marksheetStore().document?.students[0].tier).toBe(0));

		await page.getByRole('button', { name: 'Tier 2 · Foundation' }).click();

		await expect.element(page.getByText('Every student has a tier.')).toBeInTheDocument();
		expect(marksheetStore().document?.students.map((s) => s.tier)).toEqual([0, 1]);
		await expect
			.element(page.getByRole('radio', { name: /Tier 1 · Higher \(1\)/ }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('radio', { name: /Tier 2 · Foundation \(1\)/ }))
			.toBeInTheDocument();
	});

	it('dots Tier not set while anyone is waiting, and clears it when nobody is', async () => {
		seed(
			twoTier({
				students: [student('student-1', 'Ada', 'Lovelace', false, null)]
			})
		);

		openPage(MarksheetPage);

		await expect.element(page.getByTestId('tier-not-set-dot')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Tier 2 · Foundation' }).click();

		await expect.element(page.getByTestId('tier-not-set-dot')).not.toBeInTheDocument();
	});

	it('places selected students on a tier in one go', async () => {
		seed(
			twoTier({
				students: [
					student('student-1', 'Ada', 'Lovelace', false, null),
					student('student-2', 'Grace', 'Hopper', false, null),
					student('student-3', 'Alan', 'Turing', false, null)
				]
			})
		);

		openPage(MarksheetPage);

		await page.getByLabelText('Select all').click();
		await expect.element(page.getByText('3 selected')).toBeInTheDocument();
		await page.getByRole('button', { name: 'Move to Tier 2' }).click();

		await vi.waitFor(() =>
			expect(marksheetStore().document?.students.map((s) => s.tier)).toEqual([1, 1, 1])
		);
		await expect.element(page.getByText('Every student has a tier.')).toBeInTheDocument();
	});

	it('moves a student with ⇄, keeping their marks and saying they do not count', async () => {
		seed(
			twoTier({
				students: [
					student('student-1', 'Ada', 'Lovelace', false, 0),
					student('student-2', 'Grace', 'Hopper', false, 1)
				],
				marks: { 'student-1': { 'higher-1': 4 } }
			})
		);

		const screen = openPage(MarksheetPage);
		render(Toaster);

		await page.getByRole('button', { name: 'Move Ada Lovelace to Tier 2 · Foundation' }).click();

		await vi.waitFor(() => expect(marksheetStore().document?.students[0].tier).toBe(1));
		expect(marksheetStore().document?.marks).toEqual({ 'student-1': { 'higher-1': 4 } });
		await expect
			.element(page.getByText('Ada Lovelace moved to Tier 2 · Foundation'))
			.toBeInTheDocument();
		await expect
			.element(page.getByText('Their marks on the tier they left are kept, not counted.'))
			.toBeInTheDocument();

		// On Tier 2 her Higher mark is kept, shown as a badge, and outside her progress.
		await page.getByRole('radio', { name: /Tier 2 · Foundation/ }).click();
		const badge = page.getByTestId('off-tier-badge');
		await expect.element(badge).toHaveTextContent('+1 H');
		const title = badge.element().getAttribute('title') ?? '';
		expect(title).toContain('kept but not counted');
		expect(title).toContain('counts again if the student moves back');
		expect(progressText(screen, 0)).toBe('0/2');
	});

	it('shows only the open tier’s entries, students and totals', async () => {
		seed(
			twoTier({
				students: [
					student('student-1', 'Ada', 'Lovelace', false, 0),
					student('student-2', 'Grace', 'Hopper', false, 1)
				],
				marks: {
					'student-1': { 'higher-1': 4 },
					'student-2': { 'foundation-1': 5, 'foundation-2': 3 }
				}
			})
		);

		const screen = openPage(MarksheetPage);

		expect(page.getByRole('button', { name: 'Details for F1' }).query()).toBeNull();
		expect(totalCell(screen, 'student-1').textContent?.trim()).toBe('4');

		await page.getByRole('radio', { name: /Tier 2 · Foundation/ }).click();

		await vi.waitFor(() => expect(rowNames(screen)).toEqual(['Grace Hopper']));
		expect(totalCell(screen, 'student-2').textContent?.trim()).toBe('8');
		expect(markCell(screen, 'student-2', 'foundation-2').textContent?.trim()).toBe('3');
		expect(page.getByRole('button', { name: 'Details for H1' }).query()).toBeNull();
	});

	it('counts report-ready students across both tiers and names who has no tier', async () => {
		seed(
			twoTier({
				students: [
					student('student-1', 'Ada', 'Lovelace', false, 0),
					student('student-2', 'Grace', 'Hopper', false, 1),
					student('student-3', 'Alan', 'Turing', false, null)
				],
				marks: {
					'student-1': { 'higher-1': 4 },
					'student-2': { 'foundation-1': 5, 'foundation-2': 3 }
				}
			})
		);

		openPage(MarksheetPage);

		await expect
			.element(page.getByText(/2 of 3 students are fully marked and can have a report/))
			.toHaveTextContent(
				'2 of 3 students are fully marked and can have a report · 1 have no tier yet'
			);
	});

	it('keeps a single-tier marksheet free of tier chrome', async () => {
		seed(
			confirmed({
				students: [student('student-1', 'Ada', 'Lovelace')],
				marks: { 'student-1': { 'entry-1': 3 } }
			})
		);

		openPage(MarksheetPage);

		expect(page.getByText('Tier not set').query()).toBeNull();
		expect(page.getByRole('radio', { name: /Tier 1/ }).query()).toBeNull();
		expect(page.getByRole('button', { name: /^Move .* to Tier/ }).query()).toBeNull();
		expect(page.getByTestId('off-tier-badge').query()).toBeNull();
		await expect
			.element(page.getByRole('button', { name: 'Export marks to spreadsheet (.csv)' }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Set grade boundaries' }))
			.toBeInTheDocument();
	});
});
