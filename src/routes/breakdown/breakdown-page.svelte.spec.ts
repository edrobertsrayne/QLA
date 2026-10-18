import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { DOCUMENT_SCHEMA_VERSION, STORAGE_KEY, markCount } from '$lib/marksheet/document.js';
import type { BreakdownEntry, MarksheetDocument, StoredWarning } from '$lib/marksheet/document.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import { load as breakdownLoad } from './+page.js';
import BreakdownPage from './+page.svelte';

const goto = vi.hoisted(() => vi.fn());

vi.mock('$app/navigation', () => ({ goto }));

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

function parsedDocument(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
	return {
		schemaVersion: DOCUMENT_SCHEMA_VERSION,
		createdAt: NOW,
		updatedAt: NOW,
		breakdownConfirmedAt: null,
		lastExportedAt: null,
		paper: {
			label: '10X Ph1',
			className: null,
			sourceFilenames: ['10X Ph1.pdf'],
			parsedAt: NOW
		},
		breakdown: {
			entries: [entry('entry-1', '2bii', '2')],
			warnings: [
				{ questionId: 'entry-1', code: 'SUMMARY_LENGTH', message: 'Not 3–8 words.' },
				{ questionId: null, code: 'SPEC_UNREADABLE', message: 'Specification could not be read.' }
			]
		},
		students: [],
		marks: {},
		...overrides
	};
}

/** A document whose entries and warnings are the point of the test. */
function documentOf(entries: BreakdownEntry[], warnings: StoredWarning[] = []): MarksheetDocument {
	return parsedDocument({ breakdown: { entries, warnings } });
}

function seed(stored: MarksheetDocument): void {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

function storedDocument(): MarksheetDocument {
	return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as MarksheetDocument;
}

beforeEach(() => {
	// A fresh surface: the store keeps changes the tab has not written, so a
	// previous test's document is wiped rather than carried into this one.
	marksheetStore().wipe();
	localStorage.clear();
	goto.mockClear();
});

/** How many marks the marksheet holds now, as the store has them. */
function marksStored(): number {
	const document = marksheetStore().document;
	return document === null ? 0 : markCount(document);
}

/** The route's load guard reads storage before the page renders. */
function openBreakdownPage() {
	breakdownLoad();
	return render(BreakdownPage);
}

describe('breakdown page', () => {
	it('shows the stored breakdown, its warnings and no run cost after a reload', async () => {
		seed(parsedDocument());

		const screen = openBreakdownPage();

		await expect.element(page.getByLabelText('Label for 2bii')).toHaveValue('2bii');
		await expect.element(page.getByLabelText('Marks for 2bii')).toHaveValue('4');
		await expect.element(page.getByLabelText('Spec point for 2bii')).toHaveValue('3.2.1.4');
		await expect.element(page.getByLabelText('Paper label')).toHaveValue('10X Ph1');

		// A finding about one entry is on its row; one about the run is beside the table.
		await expect.element(page.getByTestId('run-warnings')).toHaveTextContent('SPEC_UNREADABLE');
		await page.getByRole('button', { name: 'Parse warnings for 2bii' }).click();
		await expect.element(page.getByText(/Not 3–8 words\./)).toBeInTheDocument();
		expect(screen.container.textContent).not.toContain('this run');
	});

	it('shows this run usage once a parse has run in this tab', async () => {
		seed(parsedDocument());
		openBreakdownPage();

		marksheetStore().createFromParse({
			breakdown: {
				questions: [
					{
						id: '2bii',
						questionNumber: '2',
						marks: 4,
						summary: 'Describe the rate change',
						specPoint: '3.2.1.4',
						commandWord: 'Describe',
						ao: 'AO2'
					}
				]
			},
			warnings: [],
			usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, estCost: 0.001 },
			filenames: ['10X Ph1.pdf']
		});

		await expect.element(page.getByText(/this run: 30 tokens · \$0\.0010/)).toBeInTheDocument();
	});

	it('edits every field in place and autosaves', async () => {
		seed(parsedDocument());
		openBreakdownPage();

		await page.getByLabelText('Summary for 2bii').fill('Rate change on cooling');
		await page.getByLabelText('Spec point for 2bii').fill('3.2.2.1');
		await page.getByLabelText('Command word for 2bii').fill('State');
		await userEvent.selectOptions(page.getByLabelText('Assessment objective for 2bii'), 'AO3');
		await userEvent.fill(page.getByLabelText('Marks for 2bii'), '6');
		await userEvent.tab();
		// The entry's name is in every cell's label, so it is renamed last.
		await page.getByLabelText('Label for 2bii').fill('2b');

		await vi.waitFor(() => {
			expect(storedDocument().breakdown.entries).toEqual([
				{
					id: 'entry-1',
					label: '2b',
					questionNumber: '2',
					marks: 6,
					summary: 'Rate change on cooling',
					specPoint: '3.2.2.1',
					commandWord: 'State',
					ao: 'AO3',
					// What the parse produced, kept so the changes show as changes.
					original: {
						label: '2bii',
						questionNumber: '2',
						marks: 4,
						summary: 'Describe the rate change',
						specPoint: '3.2.1.4',
						commandWord: 'Describe',
						ao: 'AO2'
					}
				}
			]);
		});
	});

	it('empties a spec point or command word to none', async () => {
		seed(parsedDocument());
		openBreakdownPage();

		await page.getByLabelText('Spec point for 2bii').fill('');
		await page.getByLabelText('Command word for 2bii').fill('');

		await vi.waitFor(() => {
			const stored = storedDocument().breakdown.entries[0];
			expect(stored.specPoint).toBeNull();
			expect(stored.commandWord).toBeNull();
		});
	});

	it('saves a mark as it is typed, before the cell is left', async () => {
		seed(parsedDocument());
		openBreakdownPage();

		await userEvent.fill(page.getByLabelText('Marks for 2bii'), '7');

		await vi.waitFor(() => expect(storedDocument().breakdown.entries[0].marks).toBe(7));
	});

	it('refuses a mark cell holding anything but digits, showing what the entry holds', async () => {
		seed(parsedDocument());
		openBreakdownPage();

		// Digits are saved as they are typed, so a cell holding no digits at all
		// (a pasted decimal, an exponent) leaves the entry exactly as it was.
		for (const refused of ['2.5', '1e1', '0x5', 'four']) {
			await userEvent.fill(page.getByLabelText('Marks for 2bii'), refused);
			await userEvent.tab();

			await expect.element(page.getByLabelText('Marks for 2bii')).toHaveValue('4');
			expect(storedDocument().breakdown.entries[0].marks).toBe(4);
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
		openBreakdownPage();

		await userEvent.fill(page.getByLabelText('Question number for band 1'), '2');
		await userEvent.tab();

		await expect.element(page.getByText('3 subquestions')).toBeInTheDocument();
		await expect.element(page.getByLabelText('Question number for band 1')).not.toBeInTheDocument();
		await vi.waitFor(() => {
			expect(storedDocument().breakdown.entries.map((one) => one.questionNumber)).toEqual([
				'2',
				'2',
				'2'
			]);
		});
	});

	it('shows the question number as a column when banding is off', async () => {
		seed(documentOf([entry('entry-1', '1a', '1'), entry('entry-2', '2a', '2')]));
		openBreakdownPage();

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
		openBreakdownPage();

		await page.getByRole('button', { name: '3a: no available marks' }).click();

		await expect.element(page.getByLabelText('Marks for 3a')).toHaveFocus();
	});

	it('jumps to the label of an entry whose label is the problem', async () => {
		seed(documentOf([entry('entry-1', '2a', '2'), entry('entry-2', '2a', '2')]));
		openBreakdownPage();

		await page.getByRole('button', { name: '2a: duplicate label' }).first().click();

		await expect.element(page.getByLabelText('Label for 2a').first()).toHaveFocus();
	});

	it('refuses to confirm while an entry has no available marks, naming it', async () => {
		seed(documentOf([entry('entry-1', '1a', '1'), entry('entry-2', '3a', '3', { marks: null })]));
		openBreakdownPage();

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
		openBreakdownPage();

		await expect
			.element(page.getByRole('button', { name: 'Confirm and build marksheet' }))
			.toBeDisabled();
		await expect.element(page.getByText(/2a is used more than once/)).toBeInTheDocument();
		await expect.element(page.getByText(/1 entry has no label/)).toBeInTheDocument();
	});

	it('confirms a complete breakdown and opens the marksheet', async () => {
		seed(parsedDocument());
		openBreakdownPage();

		await page.getByRole('button', { name: 'Confirm and build marksheet' }).click();

		await vi.waitFor(() => {
			expect(goto).toHaveBeenCalledWith('/marksheet');
			expect(storedDocument().breakdownConfirmedAt).not.toBeNull();
		});
	});

	it('confirms only once the blocking marks are entered', async () => {
		seed(documentOf([entry('entry-1', '1a', '1', { marks: null })]));
		openBreakdownPage();

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
		openBreakdownPage();

		await page.getByLabelText('Paper label').fill('10X/Ph1 2026');

		await vi.waitFor(() => {
			const stored = storedDocument();
			expect(stored.paper.label).toBe('10X/Ph1 2026');
			expect(stored.updatedAt).not.toBe(NOW);
		});
	});

	it('wipes only the marksheet document and returns to upload', async () => {
		seed(parsedDocument());
		localStorage.setItem('qla:theme', 'dark');

		openBreakdownPage();
		await page.getByRole('button', { name: 'New upload…' }).click();
		await page.getByRole('button', { name: 'Delete and start again' }).click();

		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
		expect(localStorage.getItem('qla:theme')).toBe('dark');
		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/'));
	});

	it('keeps working when the new-upload dialog is dismissed', async () => {
		seed(parsedDocument());

		openBreakdownPage();
		await page.getByRole('button', { name: 'New upload…' }).click();
		await page.getByRole('button', { name: 'Keep working' }).click();

		expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
		expect(goto).not.toHaveBeenCalled();
	});

	it('adds the entry the paper total is missing, and the breakdown then adds up', async () => {
		seed(documentOf([entry('entry-1', '1a', '1', { marks: 4 })]));
		openBreakdownPage();

		await page.getByLabelText('Total marks printed on the paper').fill('10');
		await expect
			.element(page.getByText('4 of 10 — 6 marks unaccounted — an entry may be missing.'))
			.toBeInTheDocument();

		// The parse missed Question 2: a row at the end is a question of its own.
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

		await expect.element(page.getByText('10 of 10 — adds up.')).toBeInTheDocument();
		await expect.element(page.getByTitle('Added by you')).toBeInTheDocument();
		await vi.waitFor(() => {
			expect(
				storedDocument().breakdown.entries.map((one) => [one.label, one.questionNumber, one.marks])
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
		openBreakdownPage();

		await page.getByRole('button', { name: 'Add subquestion to question 2' }).click();
		await page.getByLabelText('Label for (no label)').fill('2c');

		await vi.waitFor(() => {
			expect(storedDocument().breakdown.entries.map((one) => one.label)).toEqual([
				'1a',
				'2a',
				'2b',
				'2c'
			]);
		});
		expect(storedDocument().breakdown.entries[3].questionNumber).toBe('2');
	});

	it('marks the field a teacher changed, and clears it when they change it back', async () => {
		seed(documentOf([entry('entry-1', '2bii', '2', { summary: 'Describe the rate change' })]));
		openBreakdownPage();

		await page.getByLabelText('Summary for 2bii').fill('Rate change on cooling');

		await expect.element(page.getByTitle('Edited: Summary')).toBeInTheDocument();

		await page.getByLabelText('Summary for 2bii').fill('Describe the rate change');

		await expect.element(page.getByTitle('Edited: Summary')).not.toBeInTheDocument();
	});

	it('deletes an entry and puts it back from the undo that stays on screen', async () => {
		seed(documentOf([entry('entry-1', '1a', '1'), entry('entry-2', '1b', '1')]));
		openBreakdownPage();

		await page.getByRole('button', { name: 'Delete 1a' }).click();

		await expect.element(page.getByText('Deleted 1a.')).toBeInTheDocument();
		await expect.element(page.getByLabelText('Label for 1a')).not.toBeInTheDocument();

		await page.getByRole('button', { name: 'Undo' }).click();

		await expect.element(page.getByLabelText('Label for 1a')).toHaveValue('1a');
		await expect.element(page.getByText('Deleted 1a.')).not.toBeInTheDocument();
		await vi.waitFor(() => {
			expect(storedDocument().breakdown.entries.map((one) => one.label)).toEqual(['1a', '1b']);
		});
	});

	it('warns before deleting an entry that has marks, naming how many go with it', async () => {
		seed(
			parsedDocument({
				students: [{ id: 'student-1', firstName: 'Ada', surname: 'Lovelace', absent: false }],
				marks: { 'student-1': { 'entry-1': 3 } }
			})
		);
		openBreakdownPage();

		await page.getByRole('button', { name: 'Delete 2bii' }).click();

		// The number is in the question, so the click that removes marks says how many.
		await expect
			.element(page.getByTestId('delete-loss'))
			.toHaveTextContent('1 mark is entered against it');
		await page.getByRole('button', { name: 'Keep the entry' }).click();

		await expect.element(page.getByLabelText('Label for 2bii')).toHaveValue('2bii');
		expect(storedDocument().marks['student-1']['entry-1']).toBe(3);

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
				students: [{ id: 'student-1', firstName: 'Ada', surname: 'Lovelace', absent: false }],
				marks: { 'student-1': { 'entry-1': 3 } }
			})
		);
		openBreakdownPage();
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
			expect(storedDocument().breakdown.entries[0].marks).toBe(1);
			expect(storedDocument().marks['student-1']['entry-1']).toBe(3);
		});

		// Available marks the mark still fits under clear the warning.
		await userEvent.fill(marks, '3');
		await userEvent.tab();

		await expect.element(page.getByTestId('over-max-marks')).not.toBeInTheDocument();
	});

	it('moves an entry up and down, both in the table and in what is saved', async () => {
		seed(documentOf([entry('entry-1', '1a', '1'), entry('entry-2', '1b', '1')]));
		openBreakdownPage();

		// The first row cannot go up, and the last cannot go down.
		await expect.element(page.getByRole('button', { name: 'Move 1a up' })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: 'Move 1b down' })).toBeDisabled();

		await page.getByRole('button', { name: 'Move 1b up' }).click();

		await vi.waitFor(() => {
			expect(storedDocument().breakdown.entries.map((one) => one.label)).toEqual(['1b', '1a']);
		});
	});

	it('checks the breakdown against the total printed on the paper', async () => {
		seed(
			documentOf([
				entry('entry-1', '1a', '1', { marks: 4 }),
				entry('entry-2', '2a', '2', { marks: null })
			])
		);
		openBreakdownPage();

		await expect
			.element(page.getByText('This breakdown accounts for 4 marks.'))
			.toBeInTheDocument();

		await page.getByLabelText('Total marks printed on the paper').fill('14');

		await expect
			.element(
				page.getByText('4 of 14 — 10 marks unaccounted — 1 entry has no available marks yet.')
			)
			.toBeInTheDocument();

		// Give the entry its marks and the shortfall is no entry's missing marks.
		await userEvent.fill(page.getByLabelText('Marks for 2a'), '6');

		await expect
			.element(page.getByText('10 of 14 — 4 marks unaccounted — an entry may be missing.'))
			.toBeInTheDocument();

		await userEvent.fill(page.getByLabelText('Marks for 2a'), '10');

		await expect.element(page.getByText('14 of 14 — adds up.')).toBeInTheDocument();
	});
});
