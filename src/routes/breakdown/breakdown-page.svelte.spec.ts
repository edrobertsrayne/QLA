import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { goto } from '$app/navigation';
import AppNav from '$lib/components/shell/AppNav.svelte';
import { STORAGE_KEY, markCount } from '$lib/marksheet/document.js';
import type {
	BreakdownEntry,
	MarksheetDocument,
	StoredTier,
	StoredWarning
} from '$lib/marksheet/document.js';
import {
	NOW,
	entry,
	parseRun,
	parsed,
	seed,
	readSeeded,
	student,
	tier,
	tierParse
} from '$lib/marksheet/fixtures.spec-helpers.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import { openPage } from '../spec-helpers.js';
import BreakdownPage from './+page.svelte';

const RUN_WARNINGS: StoredWarning[] = [
	{ questionId: 'entry-1', code: 'SUMMARY_LENGTH', message: 'Not 3–8 words.' },
	{ questionId: null, code: 'SPEC_UNREADABLE', message: 'Specification could not be read.' }
];

function parsedDocument(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
	const base = tier();
	return parsed({
		tiers: [{ ...base, breakdown: { ...base.breakdown, warnings: RUN_WARNINGS } }],
		...overrides
	});
}

/** A single-tier document whose entries and warnings are the point of the test. */
function documentOf(entries: BreakdownEntry[], warnings: StoredWarning[] = []): MarksheetDocument {
	return parsedDocument({ tiers: [tier({ breakdown: { entries, warnings } })] });
}

function tierWith(
	entries: BreakdownEntry[],
	tierName: string | null,
	filename: string
): StoredTier {
	return tier({
		tierName,
		sourceFilenames: [filename],
		breakdown: { entries, warnings: [] }
	});
}

/**
 * Two papers and one proposed pair: h1 ↔ f1 on 4 marks. Tier 1's 2a (6 marks)
 * can pair with either of Tier 2's free 6-mark entries, and Tier 1's 3a (5
 * marks) has no candidate at all.
 */
function twoTierDocument(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
	return parsed({
		tiers: [
			tierWith(
				[
					entry('h1', '1a', '1', { marks: 4 }),
					entry('h2', '2a', '2', { marks: 6 }),
					entry('h3', '3a', '3', { marks: 5 })
				],
				'Higher',
				'10X Ph1 H.pdf'
			),
			tierWith(
				[
					entry('f1', '8a', '8', { marks: 4 }),
					entry('f2', '9a', '9', { marks: 6 }),
					entry('f3', '10a', '10', { marks: 6 })
				],
				'Foundation',
				'10X Ph1 F.pdf'
			)
		],
		commonQuestions: [{ tier1EntryId: 'h1', tier2EntryId: 'f1' }],
		...overrides
	});
}

/** The pair picker's option values, in the order the teacher sees them. */
function pickerValues(entryLabel: string): string[] {
	const select = page.getByLabelText(`Common question for ${entryLabel}`).element();
	return Array.from(select.querySelectorAll<HTMLOptionElement>('option')).map(
		(option) => option.value
	);
}

/** How many marks the marksheet holds now, as the store has them. */
function marksStored(): number {
	const document = marksheetStore().document;
	return document === null ? 0 : markCount(document);
}

describe('breakdown page', () => {
	it('shows the stored breakdown, its warnings and no run cost after a reload', async () => {
		seed(parsedDocument());

		const screen = openPage(BreakdownPage);

		await expect.element(page.getByLabelText('Label for 2bii')).toHaveValue('2bii');
		await expect.element(page.getByLabelText('Marks for 2bii')).toHaveValue('4');
		await expect.element(page.getByLabelText('Spec point for 2bii')).toHaveValue('3.2.1.4');
		await expect.element(page.getByLabelText('Paper label')).toHaveValue('10X Ph1');

		// A finding about one entry is on its row; one about the run is beside the table.
		await expect.element(page.getByTestId('run-warnings')).toHaveTextContent('SPEC_UNREADABLE');
		await page.getByRole('button', { name: 'Parse warnings for 2bii' }).click();
		await expect.element(page.getByText(/Not 3–8 words\./)).toBeInTheDocument();
		expect(screen.container.textContent).not.toContain('This run');
	});

	it('shows this run usage once a parse has run in this tab', async () => {
		seed(parsedDocument());
		openPage(BreakdownPage);

		marksheetStore().createFromAssessment(
			parseRun({
				usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, estCost: 0.001 }
			})
		);

		await expect.element(page.getByText(/This run: 30 tokens · \$0\.0010/)).toBeInTheDocument();
	});

	it('edits every field in place and autosaves', async () => {
		seed(parsedDocument());
		openPage(BreakdownPage);

		await page.getByLabelText('Summary for 2bii').fill('Rate change on cooling');
		await page.getByLabelText('Spec point for 2bii').fill('3.2.2.1');
		await userEvent.tab();
		await page.getByLabelText('Command word for 2bii').fill('State');
		await userEvent.selectOptions(page.getByLabelText('Assessment objective for 2bii'), 'AO3');
		await userEvent.fill(page.getByLabelText('Marks for 2bii'), '6');
		await userEvent.tab();
		// The entry's name is in every cell's label, so it is renamed last.
		await page.getByLabelText('Label for 2bii').fill('2b');

		await vi.waitFor(() => {
			expect(readSeeded().tiers[0].breakdown.entries[0]).toMatchObject({
				label: '2b',
				marks: 6,
				summary: 'Rate change on cooling',
				specPoint: '3.2.2.1',
				commandWord: 'State',
				ao: 'AO3'
			});
		});
	});

	it('edits a description for each AO the paper uses, and a blank clears it', async () => {
		seed(
			parsedDocument({
				aoDescriptions: { AO2: 'Apply knowledge to new situations' }
			})
		);
		openPage(BreakdownPage);

		// Only the objectives an entry carries have a field.
		await expect
			.element(page.getByLabelText('AO2', { exact: true }))
			.toHaveValue('Apply knowledge to new situations');
		expect(document.querySelector('#ao-description-AO1')).toBeNull();

		await page.getByLabelText('AO2', { exact: true }).fill('Use ideas in unfamiliar contexts');
		await vi.waitFor(() =>
			expect(readSeeded().aoDescriptions).toEqual({
				AO2: 'Use ideas in unfamiliar contexts'
			})
		);

		await page.getByLabelText('AO2', { exact: true }).fill('');
		await vi.waitFor(() => expect(readSeeded().aoDescriptions).toEqual({}));
	});

	it('shares one skill-description set across both tiers, headed as such', async () => {
		seed(twoTierDocument({ aoDescriptions: { AO2: 'Apply knowledge to new situations' } }));
		openPage(BreakdownPage);

		await expect
			.element(page.getByTestId('ao-descriptions'))
			.toHaveTextContent('Skill descriptions · both tiers');
		await expect
			.element(page.getByLabelText('AO2', { exact: true }))
			.toHaveValue('Apply knowledge to new situations');

		// The set is the assessment's: changing it on one tab changes it for both.
		await page.getByLabelText('AO2', { exact: true }).fill('Apply ideas');
		await page.getByRole('radio', { name: 'Tier 2 · Foundation' }).click();

		await expect.element(page.getByLabelText('AO2', { exact: true })).toHaveValue('Apply ideas');
		await vi.waitFor(() => expect(readSeeded().aoDescriptions).toEqual({ AO2: 'Apply ideas' }));
	});

	it('renders a multi-code spec point one code per line, and saves a typed list', async () => {
		seed(documentOf([entry('entry-1', '2bii', '2', { specPoint: '3.2.1.4 / 3.2.2.1' })]));
		openPage(BreakdownPage);

		await expect
			.element(page.getByLabelText('Spec point for 2bii'))
			.toHaveValue('3.2.1.4\n3.2.2.1');

		await page.getByLabelText('Spec point for 2bii').fill('3.2.1.5\n3.2.2.2');
		await userEvent.tab();

		await expect
			.element(page.getByLabelText('Spec point for 2bii'))
			.toHaveValue('3.2.1.5\n3.2.2.2');
		await vi.waitFor(() =>
			expect(readSeeded().tiers[0].breakdown.entries[0].specPoint).toBe('3.2.1.5, 3.2.2.2')
		);
	});

	it('empties a spec point or command word to none', async () => {
		seed(parsedDocument());
		openPage(BreakdownPage);

		await page.getByLabelText('Spec point for 2bii').fill('');
		await userEvent.tab();
		await page.getByLabelText('Command word for 2bii').fill('');

		await vi.waitFor(() => {
			const stored = readSeeded().tiers[0].breakdown.entries[0];
			expect(stored.specPoint).toBeNull();
			expect(stored.commandWord).toBeNull();
		});
	});

	it('saves a mark as it is typed, before the cell is left', async () => {
		seed(parsedDocument());
		openPage(BreakdownPage);

		await userEvent.fill(page.getByLabelText('Marks for 2bii'), '7');

		await vi.waitFor(() => expect(readSeeded().tiers[0].breakdown.entries[0].marks).toBe(7));
	});

	it('refuses a mark cell holding anything but digits, showing what the entry holds', async () => {
		seed(parsedDocument());
		openPage(BreakdownPage);

		// Digits are saved as they are typed, so a cell holding no digits at all
		// (a pasted decimal, an exponent) leaves the entry exactly as it was.
		for (const refused of ['2.5', '1e1', '0x5', 'four']) {
			await userEvent.fill(page.getByLabelText('Marks for 2bii'), refused);
			await userEvent.tab();

			await expect.element(page.getByLabelText('Marks for 2bii')).toHaveValue('4');
			expect(readSeeded().tiers[0].breakdown.entries[0].marks).toBe(4);
		}
	});

	it("re-bands the rows when the band's question number is edited", async () => {
		seed(
			documentOf([
				entry('entry-1', '1a', '1'),
				entry('entry-2', '1b', '1'),
				entry('entry-3', '2a', '2')
			])
		);
		openPage(BreakdownPage);

		await userEvent.fill(page.getByLabelText('Question number for band 1'), '2');
		await userEvent.tab();

		await expect.element(page.getByText('3 subquestions')).toBeInTheDocument();
		await expect.element(page.getByLabelText('Question number for band 1')).not.toBeInTheDocument();
		await vi.waitFor(() => {
			expect(readSeeded().tiers[0].breakdown.entries.map((one) => one.questionNumber)).toEqual([
				'2',
				'2',
				'2'
			]);
		});
	});

	it('shows the question number as a column when banding is off', async () => {
		seed(documentOf([entry('entry-1', '1a', '1'), entry('entry-2', '2a', '2')]));
		openPage(BreakdownPage);

		await page.getByLabelText('Band by question').click();

		await expect.element(page.getByLabelText('Question number for 1a')).toHaveValue('1');
		expect(page.getByTestId('band-row').elements()).toHaveLength(0);
	});

	it('jumps to the entry and the field that blocks confirmation', async () => {
		seed(
			documentOf([
				entry('entry-1', '1a', '1'),
				entry('entry-2', '3a', '3', { marks: null, summary: 'Name the gas produced' })
			])
		);
		openPage(BreakdownPage);

		await page.getByRole('button', { name: '3a: no available marks' }).click();

		await expect.element(page.getByLabelText('Marks for 3a')).toHaveFocus();
	});

	it('jumps to the label of an entry whose label is the problem', async () => {
		seed(documentOf([entry('entry-1', '2a', '2'), entry('entry-2', '2a', '2')]));
		openPage(BreakdownPage);

		await page.getByRole('button', { name: '2a: duplicate label' }).first().click();

		await expect.element(page.getByLabelText('Label for 2a').first()).toHaveFocus();
	});

	it('lays a single tier out with no tabs, no tier name and no common-questions clause', async () => {
		seed(parsedDocument());
		openPage(BreakdownPage);

		await expect
			.element(page.getByRole('heading', { name: 'Check the breakdown', exact: true }))
			.toBeInTheDocument();
		await expect
			.element(page.getByText('Fix anything the model got wrong.', { exact: true }))
			.toBeInTheDocument();
		expect(page.getByRole('radio').elements()).toHaveLength(0);
		expect(page.getByLabelText('Tier name, as printed on the paper').elements()).toHaveLength(0);
		expect(page.getByText('Common with Tier 2').elements()).toHaveLength(0);
		expect(page.getByText('No common questions proposed').elements()).toHaveLength(0);
		await expect.element(page.getByTestId('summary')).toHaveTextContent('1 column · 4 marks');

		await page.getByRole('button', { name: 'Confirm and build marksheet' }).click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/marksheet'));
	});

	it('refuses to confirm while an entry has no available marks, naming it', async () => {
		seed(documentOf([entry('entry-1', '1a', '1'), entry('entry-2', '3a', '3', { marks: null })]));
		openPage(BreakdownPage);

		await expect
			.element(page.getByRole('button', { name: 'Confirm and build marksheet' }))
			.toBeDisabled();
		await expect
			.element(page.getByText(/Available marks are not yet known for 3a/))
			.toBeInTheDocument();
	});

	it('refuses to confirm while a label is empty or repeated, naming the offenders', async () => {
		seed(
			documentOf([
				entry('entry-1', '2a', '2'),
				entry('entry-2', '2a', '2'),
				entry('entry-3', '  ', '3')
			])
		);
		openPage(BreakdownPage);

		await expect
			.element(page.getByRole('button', { name: 'Confirm and build marksheet' }))
			.toBeDisabled();
		await expect.element(page.getByText(/2a is used more than once/)).toBeInTheDocument();
		await expect.element(page.getByText(/1 entry has no label/)).toBeInTheDocument();
	});

	it('confirms a complete breakdown and opens the marksheet', async () => {
		seed(parsedDocument());
		openPage(BreakdownPage);

		await page.getByRole('button', { name: 'Confirm and build marksheet' }).click();

		await vi.waitFor(() => {
			expect(goto).toHaveBeenCalledWith('/marksheet');
			expect(readSeeded().breakdownConfirmedAt).not.toBeNull();
		});
	});

	it('confirms only once the blocking marks are entered', async () => {
		seed(documentOf([entry('entry-1', '1a', '1', { marks: null })]));
		openPage(BreakdownPage);

		const confirm = page.getByRole('button', { name: 'Confirm and build marksheet' });
		await expect.element(confirm).toBeDisabled();

		await userEvent.fill(page.getByLabelText('Marks for 1a'), '5');
		await userEvent.tab();

		await expect.element(confirm).toBeEnabled();
		await confirm.click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/marksheet'));
	});

	it('renames the paper in place and autosaves it', async () => {
		seed(parsedDocument());
		openPage(BreakdownPage);

		await page.getByLabelText('Paper label').fill('10X/Ph1 2026');

		await vi.waitFor(() => {
			const stored = readSeeded();
			expect(stored.label).toBe('10X/Ph1 2026');
			expect(stored.updatedAt).not.toBe(NOW);
		});
	});

	it('wipes only the marksheet document and returns to upload', async () => {
		seed(parsedDocument());
		localStorage.setItem('qla:theme', 'dark');

		render(AppNav);
		openPage(BreakdownPage);
		await page.getByRole('button', { name: 'New upload…' }).click();
		await page.getByRole('button', { name: 'Delete and start again' }).click();

		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
		expect(localStorage.getItem('qla:theme')).toBe('dark');
		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/'));
	});

	it('keeps working when the new-upload dialog is dismissed', async () => {
		seed(parsedDocument());

		render(AppNav);
		openPage(BreakdownPage);
		await page.getByRole('button', { name: 'New upload…' }).click();
		await page.getByRole('button', { name: 'Keep working' }).click();

		expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
		expect(goto).not.toHaveBeenCalled();
	});

	it('adds an entry at the end of the open tier', async () => {
		seed(documentOf([entry('entry-1', '1a', '1', { marks: 4 })]));
		openPage(BreakdownPage);

		await page.getByRole('button', { name: 'Add entry at end' }).click();

		// The row says what it still needs, so a blank question number cannot slip
		// through to a band headed `Q`.
		await expect.element(page.getByText('needs a question number')).toBeInTheDocument();

		const label = page.getByLabelText('Label for (no label)');
		await expect.element(label).toHaveFocus();
		await label.fill('2a');
		// Numbering it re-bands the row, which leaves the row's own cells in place.
		await userEvent.fill(page.getByLabelText('Question number for band (none)'), '2');
		await userEvent.fill(page.getByLabelText('Marks for 2a'), '6');
		await userEvent.tab();

		await expect.element(page.getByTitle('Added by you')).toBeInTheDocument();
		await vi.waitFor(() => {
			expect(
				readSeeded().tiers[0].breakdown.entries.map((one) => [
					one.label,
					one.questionNumber,
					one.marks
				])
			).toEqual([
				['1a', '1', 4],
				['2a', '2', 6]
			]);
		});
	});

	it('adds a subquestion from a band, into that band', async () => {
		seed(
			documentOf([
				entry('entry-1', '1a', '1'),
				entry('entry-2', '2a', '2'),
				entry('entry-3', '2b', '2')
			])
		);
		openPage(BreakdownPage);

		await page.getByRole('button', { name: 'Add subquestion to question 2' }).click();
		await page.getByLabelText('Label for (no label)').fill('2c');

		await vi.waitFor(() => {
			expect(readSeeded().tiers[0].breakdown.entries.map((one) => one.label)).toEqual([
				'1a',
				'2a',
				'2b',
				'2c'
			]);
		});
		expect(readSeeded().tiers[0].breakdown.entries[3].questionNumber).toBe('2');
	});

	it('marks the field a teacher changed, and clears it when they change it back', async () => {
		seed(documentOf([entry('entry-1', '2bii', '2', { summary: 'Describe the rate change' })]));
		openPage(BreakdownPage);

		await page.getByLabelText('Summary for 2bii').fill('Rate change on cooling');

		await expect.element(page.getByTitle('Edited: Summary')).toBeInTheDocument();

		await page.getByLabelText('Summary for 2bii').fill('Describe the rate change');

		await expect.element(page.getByTitle('Edited: Summary')).not.toBeInTheDocument();
	});

	it('deletes an entry and puts it back from the undo that stays on screen', async () => {
		seed(documentOf([entry('entry-1', '1a', '1'), entry('entry-2', '1b', '1')]));
		openPage(BreakdownPage);

		await page.getByRole('button', { name: 'Delete 1a' }).click();

		await expect.element(page.getByText('Deleted 1a.')).toBeInTheDocument();
		await expect.element(page.getByLabelText('Label for 1a')).not.toBeInTheDocument();

		await page.getByRole('button', { name: 'Undo' }).click();

		await expect.element(page.getByLabelText('Label for 1a')).toHaveValue('1a');
		await expect.element(page.getByText('Deleted 1a.')).not.toBeInTheDocument();
		await vi.waitFor(() => {
			expect(readSeeded().tiers[0].breakdown.entries.map((one) => one.label)).toEqual(['1a', '1b']);
		});
	});

	it('warns before deleting an entry that has marks, naming how many go with it', async () => {
		seed(
			parsedDocument({
				students: [student('student-1', 'Ada', 'Lovelace')],
				marks: { 'student-1': { 'entry-1': 3 } }
			})
		);
		openPage(BreakdownPage);

		await page.getByRole('button', { name: 'Delete 2bii' }).click();

		// The number is in the question, so the click that removes marks says how many.
		await expect
			.element(page.getByTestId('delete-loss'))
			.toHaveTextContent('1 mark is entered against it');
		await page.getByRole('button', { name: 'Keep the entry' }).click();

		await expect.element(page.getByLabelText('Label for 2bii')).toHaveValue('2bii');
		expect(readSeeded().marks['student-1']['entry-1']).toBe(3);

		await page.getByRole('button', { name: 'Delete 2bii' }).click();
		await page.getByRole('button', { name: 'Delete 2bii and 1 mark' }).click();

		await expect.element(page.getByLabelText('Label for 2bii')).not.toBeInTheDocument();
		await vi.waitFor(() => expect(marksStored()).toBe(0));

		// The undo still offers the entry back, with the marks that went with it.
		await page.getByRole('button', { name: 'Undo' }).click();

		await expect.element(page.getByLabelText('Label for 2bii')).toHaveValue('2bii');
		expect(marksStored()).toBe(1);
	});

	it('warns when an entry is given fewer marks than a mark already entered', async () => {
		seed(
			parsedDocument({
				students: [student('student-1', 'Ada', 'Lovelace')],
				marks: { 'student-1': { 'entry-1': 3 } }
			})
		);
		openPage(BreakdownPage);
		const marks = page.getByLabelText('Marks for 2bii');

		await userEvent.fill(marks, '6');
		await userEvent.tab();

		// Raising the entry's available marks leaves nothing above them: nothing to
		// warn about.
		await expect.element(page.getByTestId('over-max-marks')).not.toBeInTheDocument();

		// A total is saved keystroke by keystroke, so the entry being typed in is
		// not judged yet: a raise typed digit by digit cannot flash a warning.
		await userEvent.fill(marks, '1');
		await expect.element(page.getByTestId('over-max-marks')).not.toBeInTheDocument();

		await userEvent.tab();

		await expect
			.element(page.getByTestId('over-max-marks'))
			.toHaveTextContent('1 mark entered on 2bii is above its 1 available mark.');

		// Nothing was clamped: the mark the student gained stands as it was entered.
		await vi.waitFor(() => {
			expect(readSeeded().tiers[0].breakdown.entries[0].marks).toBe(1);
			expect(readSeeded().marks['student-1']['entry-1']).toBe(3);
		});

		// Available marks the mark still fits under clear the warning.
		await userEvent.fill(marks, '3');
		await userEvent.tab();

		await expect.element(page.getByTestId('over-max-marks')).not.toBeInTheDocument();
	});

	it('moves an entry up and down, both in the table and in what is saved', async () => {
		seed(documentOf([entry('entry-1', '1a', '1'), entry('entry-2', '1b', '1')]));
		openPage(BreakdownPage);

		// The first row cannot go up, and the last cannot go down.
		await expect.element(page.getByRole('button', { name: 'Move 1a up' })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: 'Move 1b down' })).toBeDisabled();

		await page.getByRole('button', { name: 'Move 1b up' }).click();

		await vi.waitFor(() => {
			expect(readSeeded().tiers[0].breakdown.entries.map((one) => one.label)).toEqual(['1b', '1a']);
		});
	});

	it('tabs between both tiers, summarises the whole assessment and confirms it in one click', async () => {
		seed(twoTierDocument());
		openPage(BreakdownPage);

		await expect.element(page.getByRole('radio', { name: 'Tier 1 · Higher' })).toBeInTheDocument();
		await expect
			.element(page.getByRole('radio', { name: 'Tier 2 · Foundation' }))
			.toBeInTheDocument();
		await expect
			.element(page.getByTestId('summary'))
			.toHaveTextContent('6 columns across both tiers · 1 common question (4 marks)');
		await expect.element(page.getByLabelText('Label for 1a')).toBeInTheDocument();

		await page.getByRole('radio', { name: 'Tier 2 · Foundation' }).click();

		await expect.element(page.getByLabelText('Label for 8a')).toBeInTheDocument();
		expect(page.getByLabelText('Label for 1a').elements()).toHaveLength(0);
		await expect
			.element(page.getByLabelText('Tier name, as printed on the paper'))
			.toHaveValue('Foundation');

		await page.getByRole('button', { name: 'Confirm and build marksheet' }).click();

		await vi.waitFor(() => {
			expect(goto).toHaveBeenCalledWith('/marksheet');
			const stored = readSeeded();
			expect(stored.breakdownConfirmedAt).not.toBeNull();
			expect(stored.commonQuestions).toEqual([{ tier1EntryId: 'h1', tier2EntryId: 'f1' }]);
		});
	});

	it('names a blank or identical tier name and puts a red dot on the tabs it stops', async () => {
		seed(
			twoTierDocument({
				tiers: [
					tierWith([entry('h1', '1a', '1')], null, 'H.pdf'),
					tierWith([entry('f1', '8a', '8')], null, 'F.pdf')
				]
			})
		);
		openPage(BreakdownPage);

		await expect.element(page.getByText('Tier 1 needs a tier name.')).toBeInTheDocument();
		await expect.element(page.getByText('Tier 2 needs a tier name.')).toBeInTheDocument();
		expect(page.getByText('The two tiers need different names.').elements()).toHaveLength(0);
		expect(page.getByTestId('tier-blocker-dot').elements()).toHaveLength(2);
		await expect
			.element(page.getByRole('button', { name: 'Confirm and build marksheet' }))
			.toBeDisabled();

		await page.getByLabelText('Tier name, as printed on the paper').fill('Higher');
		await page.getByRole('radio', { name: 'Tier 2', exact: true }).click();
		await expect.element(page.getByText('Tier 1 needs a tier name.')).not.toBeInTheDocument();
		await page.getByLabelText('Tier name, as printed on the paper').fill('higher');

		await expect.element(page.getByText('The two tiers need different names.')).toBeInTheDocument();
		expect(page.getByTestId('tier-blocker-dot').elements()).toHaveLength(2);

		await page.getByLabelText('Tier name, as printed on the paper').fill('Foundation');

		await expect
			.element(page.getByText('The two tiers need different names.'))
			.not.toBeInTheDocument();
		expect(page.getByTestId('tier-blocker-dot').elements()).toHaveLength(0);
		await expect
			.element(page.getByRole('button', { name: 'Confirm and build marksheet' }))
			.toBeEnabled();
		await vi.waitFor(() =>
			expect(readSeeded().tiers.map((one) => one.tierName)).toEqual(['Higher', 'Foundation'])
		);
	});

	it('offers only the other tier’s free entries with equal marks, plus the current partner', async () => {
		seed(twoTierDocument());
		openPage(BreakdownPage);

		// 1a already has its partner: shown even though it is paired.
		expect(pickerValues('1a')).toEqual(['', 'f1']);
		// 2a (6 marks) may take either free 6-mark entry on the other tier.
		expect(pickerValues('2a')).toEqual(['', 'f2', 'f3']);
		// 3a (5 marks) has no equal-mark candidate, and nothing from its own tier.
		expect(pickerValues('3a')).toEqual(['']);
		await expect
			.element(page.getByLabelText('Common question for 3a'))
			.toHaveTextContent('— (no equal-mark entry)');

		// Tier 2's picker excludes the pair it already shares with Tier 1.
		await page.getByRole('radio', { name: 'Tier 2 · Foundation' }).click();
		expect(pickerValues('8a')).toEqual(['', 'h1']);
		expect(pickerValues('9a')).toEqual(['', 'h2']);
		expect(pickerValues('10a')).toEqual(['', 'h2']);
	});

	it('adds, changes and clears a pair from either tab, each one undoable', async () => {
		seed(twoTierDocument());
		openPage(BreakdownPage);

		// Add from Tier 2: its free 6-mark entry takes Tier 1's free 6-mark entry.
		await page.getByRole('radio', { name: 'Tier 2 · Foundation' }).click();
		await userEvent.selectOptions(page.getByLabelText('Common question for 10a'), 'h2');
		await vi.waitFor(() =>
			expect(readSeeded().commonQuestions).toEqual([
				{ tier1EntryId: 'h1', tier2EntryId: 'f1' },
				{ tier1EntryId: 'h2', tier2EntryId: 'f3' }
			])
		);
		await expect.element(page.getByText('Changed common questions.')).toBeInTheDocument();

		// The pair is one fact: Tier 1 now shows it, and changing it there moves it.
		await page.getByRole('radio', { name: 'Tier 1 · Higher' }).click();
		await expect.element(page.getByLabelText('Common question for 2a')).toHaveValue('f3');
		await userEvent.selectOptions(page.getByLabelText('Common question for 2a'), 'f2');
		await vi.waitFor(() =>
			expect(readSeeded().commonQuestions).toEqual([
				{ tier1EntryId: 'h1', tier2EntryId: 'f1' },
				{ tier1EntryId: 'h2', tier2EntryId: 'f2' }
			])
		);

		// Clearing from Tier 2 leaves the other pair exactly as it was.
		await page.getByRole('radio', { name: 'Tier 2 · Foundation' }).click();
		await expect.element(page.getByLabelText('Common question for 9a')).toHaveValue('h2');
		await userEvent.selectOptions(page.getByLabelText('Common question for 8a'), '');
		await vi.waitFor(() =>
			expect(readSeeded().commonQuestions).toEqual([{ tier1EntryId: 'h2', tier2EntryId: 'f2' }])
		);

		// Undo takes back the clear, pair and all.
		await page.getByRole('button', { name: 'Undo' }).click();
		await vi.waitFor(() =>
			expect(readSeeded().commonQuestions).toEqual([
				{ tier1EntryId: 'h1', tier2EntryId: 'f1' },
				{ tier1EntryId: 'h2', tier2EntryId: 'f2' }
			])
		);
		await expect.element(page.getByLabelText('Common question for 8a')).toHaveValue('h1');
	});

	it('blocks confirmation with the named sentence when a pair’s marks are edited apart', async () => {
		seed(
			twoTierDocument({
				commonQuestions: [
					{ tier1EntryId: 'h1', tier2EntryId: 'f1' },
					{ tier1EntryId: 'h2', tier2EntryId: 'f2' }
				]
			})
		);
		openPage(BreakdownPage);

		await userEvent.fill(page.getByLabelText('Marks for 2a'), '7');
		await userEvent.tab();

		await expect
			.element(page.getByText('2a (7) and 9a (6) are paired but have different available marks.'))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Confirm and build marksheet' }))
			.toBeDisabled();
		// The pair stays visible on the row, marked as unequal rather than dropped.
		await expect.element(page.getByLabelText('Common question for 2a')).toHaveValue('f2');
		await expect
			.element(page.getByLabelText('Common question for 2a'))
			.toHaveTextContent('9a (6 marks, unequal)');

		await userEvent.fill(page.getByLabelText('Marks for 2a'), '6');
		await userEvent.tab();

		await expect
			.element(page.getByText('2a (7) and 9a (6) are paired but have different available marks.'))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Confirm and build marksheet' }))
			.toBeEnabled();
	});

	it('drops a deleted entry’s pair in the same change, and undo brings it back', async () => {
		seed(twoTierDocument());
		openPage(BreakdownPage);

		await page.getByRole('button', { name: 'Delete 1a' }).click();

		await expect.element(page.getByLabelText('Label for 1a')).not.toBeInTheDocument();
		await vi.waitFor(() => expect(readSeeded().commonQuestions).toEqual([]));

		await page.getByRole('button', { name: 'Undo' }).click();

		await expect.element(page.getByLabelText('Label for 1a')).toHaveValue('1a');
		await vi.waitFor(() =>
			expect(readSeeded().commonQuestions).toEqual([{ tier1EntryId: 'h1', tier2EntryId: 'f1' }])
		);
	});

	it('ends each tier’s table with a totals row of available marks', async () => {
		seed(twoTierDocument());
		openPage(BreakdownPage);

		await expect.element(page.getByTestId('totals-row')).toHaveTextContent('15');
		await expect.element(page.getByTestId('totals-row')).toHaveTextContent('Total available marks');

		await page.getByRole('radio', { name: 'Tier 2 · Foundation' }).click();

		await expect.element(page.getByTestId('totals-row')).toHaveTextContent('16');
	});

	it('shows why matching proposed no common questions', async () => {
		seed(twoTierDocument({ commonQuestions: [] }));
		openPage(BreakdownPage);

		await expect.element(page.getByText('No common questions proposed')).toBeInTheDocument();
		await expect
			.element(page.getByTestId('match-notice'))
			.toHaveTextContent('None proposed: pair them by hand at review.');
	});

	it("shows the run's matching failure as the notice's reason", async () => {
		openPage(BreakdownPage);

		marksheetStore().createFromAssessment(
			parseRun({
				tiers: [tierParse({ tierName: 'Higher' }), tierParse({ tierName: 'Foundation' })],
				matchNotice: 'The model could not read the PDFs, so none are proposed.'
			})
		);

		await expect
			.element(page.getByTestId('match-notice'))
			.toHaveTextContent('The model could not read the PDFs, so none are proposed.');
	});

	it('says what an unlocked breakdown puts at risk, naming the students with marks', async () => {
		seed(
			twoTierDocument({
				students: [
					student('student-1', 'Ada', 'Lovelace', false, 0),
					student('student-2', 'Grace', 'Hopper', false, 1)
				],
				marks: { 'student-1': { h1: 3 }, 'student-2': { f1: 2 } }
			})
		);
		openPage(BreakdownPage);

		await expect
			.element(page.getByTestId('unlocked-notice'))
			.toHaveTextContent('2 students have marks.');
		await expect
			.element(page.getByTestId('unlocked-notice'))
			.toHaveTextContent('Deleting an entry removes its marks');
		await expect
			.element(page.getByTestId('unlocked-notice'))
			.toHaveTextContent('changing a pair only changes the common-questions analysis');
	});
});
