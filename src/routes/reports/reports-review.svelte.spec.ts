import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { cleanup } from 'vitest-browser-svelte';
import type { MarksheetDocument } from '$lib/marksheet/document.js';
import { readSeeded, seed, student } from '$lib/marksheet/fixtures.spec-helpers.js';
import { generationInputFor } from '$lib/marksheet/report-input.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import { openPage } from '../spec-helpers.js';
import ReportsPage from './+page.svelte';
import {
	HOSTILE,
	plain,
	solo,
	stubFetch,
	reportCalls,
	ok,
	topicNames,
	skipGrades,
	writeFor
} from './reports.spec-helpers.js';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('report editing', () => {
	/** One eligible student with a written report and no teacher edit. */
	function written(): MarksheetDocument {
		const doc = solo();
		const input = generationInputFor(doc, 'ada');
		if (!input) throw new Error('no generation input for ada');
		doc.reports = {
			ada: {
				strengths: ['Careful working'],
				areasForImprovement: ['Check units'],
				edit: null,
				input,
				model: 'test/model',
				generatedAt: '2026-01-01T10:00:00.000Z'
			}
		};
		return doc;
	}

	it('edits a strength in place, keeps it across a reload, and prints it', async () => {
		seed(written());
		stubFetch();
		const first = openPage(ReportsPage);

		await expect.element(page.getByRole('button', { name: 'Print all 1' })).toBeInTheDocument();
		await page.getByLabelText('Strength 1 for Ada Lovelace').fill('Beautifully clear working');
		await userEvent.keyboard('{Tab}');
		await expect.element(page.getByText('edited', { exact: true })).toBeInTheDocument();

		marksheetStore().flush();
		first.unmount();
		openPage(ReportsPage);

		await expect.element(page.getByRole('button', { name: 'Print all 1' })).toBeInTheDocument();
		await expect
			.element(page.getByLabelText('Strength 1 for Ada Lovelace'))
			.toHaveValue('Beautifully clear working');

		const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
		print.mockClear();
		await page.getByRole('button', { name: 'Print this page' }).click();
		expect(document.querySelector('[data-testid="print-root"]')?.textContent).toContain(
			'Beautifully clear working'
		);
		expect(print).toHaveBeenCalledTimes(1);
		print.mockRestore();
	});

	it('reverts an edited report to its generated wording', async () => {
		seed(written());
		stubFetch();
		openPage(ReportsPage);

		await expect.element(page.getByRole('button', { name: 'Print all 1' })).toBeInTheDocument();
		await page.getByLabelText('Strength 1 for Ada Lovelace').fill('Teacher wording');
		await userEvent.keyboard('{Tab}');
		await expect.element(page.getByText('edited', { exact: true })).toBeInTheDocument();

		await page.getByRole('button', { name: 'Revert' }).click();
		await expect
			.element(page.getByLabelText('Strength 1 for Ada Lovelace'))
			.toHaveValue('Careful working');
		expect(page.getByText('edited', { exact: true }).query()).toBeNull();
	});

	it('undoes an edit', async () => {
		seed(written());
		stubFetch();
		openPage(ReportsPage);

		await expect.element(page.getByRole('button', { name: 'Print all 1' })).toBeInTheDocument();
		await page.getByLabelText('Strength 1 for Ada Lovelace').fill('Teacher wording');
		await userEvent.keyboard('{Tab}');
		await expect.element(page.getByText('edited', { exact: true })).toBeInTheDocument();

		await page.getByTestId('report-edit-undo').getByRole('button', { name: 'Undo' }).click();
		await expect
			.element(page.getByLabelText('Strength 1 for Ada Lovelace'))
			.toHaveValue('Careful working');
		expect(page.getByText('edited', { exact: true }).query()).toBeNull();
	});

	it('takes a typed edit back in one undo', async () => {
		seed(written());
		stubFetch();
		openPage(ReportsPage);

		await expect.element(page.getByRole('button', { name: 'Print all 1' })).toBeInTheDocument();
		await page.getByLabelText('Strength 1 for Ada Lovelace').fill('Teacher');
		await userEvent.keyboard('{Tab}');
		await page.getByLabelText('Strength 1 for Ada Lovelace').fill('Teacher wording');
		await userEvent.keyboard('{Tab}');
		await expect.element(page.getByText('edited', { exact: true })).toBeInTheDocument();

		await page.getByTestId('report-edit-undo').getByRole('button', { name: 'Undo' }).click();
		await expect
			.element(page.getByLabelText('Strength 1 for Ada Lovelace'))
			.toHaveValue('Careful working');
		expect(page.getByText('edited', { exact: true }).query()).toBeNull();
	});

	it('shows pasted markup as literal text on screen and in print', async () => {
		seed(written());
		stubFetch();
		openPage(ReportsPage);

		await expect.element(page.getByRole('button', { name: 'Print all 1' })).toBeInTheDocument();
		await page.getByLabelText('Strength 1 for Ada Lovelace').fill(HOSTILE);
		await userEvent.keyboard('{Tab}');
		await expect.element(page.getByText(HOSTILE).first()).toBeInTheDocument();
		expect(document.querySelector('img')).toBeNull();

		const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
		print.mockClear();
		await page.getByRole('button', { name: 'Print this page' }).click();
		expect(document.querySelector('[data-testid="print-root"] img')).toBeNull();
		expect(document.querySelector('[data-testid="print-root"]')?.textContent).toContain(HOSTILE);
		expect(print).toHaveBeenCalledTimes(1);
		print.mockRestore();
	});
});

describe('out-of-date reports', () => {
	/** Two eligible students, each with a written report and no teacher edit. */
	function twoWritten(): MarksheetDocument {
		const fitting = plain();
		const doc: MarksheetDocument = {
			...fitting,
			students: [student('ada', 'Ada', 'Lovelace'), student('bo', 'Bo', 'Brown')],
			marks: { ada: fitting.marks['ada'], bo: fitting.marks['bo'] }
		};
		doc.reports = {};
		for (const id of ['ada', 'bo']) {
			const input = generationInputFor(doc, id);
			if (!input) throw new Error(`no input for ${id}`);
			doc.reports[id] = {
				strengths: ['Careful working'],
				areasForImprovement: ['Check units'],
				edit: null,
				input,
				model: 'test/model',
				generatedAt: '2026-01-01T10:00:00.000Z'
			};
		}
		return doc;
	}

	it('marks only the edited-mark student out of date, not a boundary or model change', async () => {
		seed(twoWritten());
		stubFetch(() => topicNames({}));
		openPage(ReportsPage);

		await expect.element(page.getByRole('button', { name: 'Print all 2' })).toBeInTheDocument();
		expect(page.getByText('Out of date').query()).toBeNull();

		// Moving a boundary never marks a report out of date: grades are live
		// figures that never reach the generation input. If this regressed,
		// both reports would gain a marker.
		marksheetStore().saveBoundaries(
			[
				{ label: 'C', minimum: 5 },
				{ label: 'D', minimum: 2 }
			],
			'U'
		);
		await new Promise((resolve) => setTimeout(resolve, 200));
		expect(page.getByText('Out of date').query()).toBeNull();

		// The model choice lives beside the report, never in its input: it
		// cannot mark anything out of date either.
		expect(generationInputFor(readSeeded(), 'ada')).not.toHaveProperty('model');
		expect(page.getByText('Out of date').query()).toBeNull();

		marksheetStore().setMark('ada', 'entry-1', 4);
		await expect.element(page.getByText('Out of date').first()).toBeInTheDocument();
		expect(document.querySelector('[data-page-for="bo"]')?.textContent).not.toContain(
			'Out of date'
		);
		expect(document.querySelectorAll('[data-page-for="ada"]').length).toBe(1);
	});

	it('keeps wording without a model call and clears the marker', async () => {
		seed(twoWritten());
		const { stub } = stubFetch();
		openPage(ReportsPage);

		await expect.element(page.getByRole('button', { name: 'Print all 2' })).toBeInTheDocument();
		marksheetStore().setMark('ada', 'entry-1', 4);
		await expect.element(page.getByText('Out of date').first()).toBeInTheDocument();
		const before = reportCalls(stub);

		await page.getByRole('button', { name: 'Keep wording' }).first().click();
		await expect.element(page.getByText('Out of date').query()).toBeNull();
		expect(reportCalls(stub)).toBe(before);
	});

	it('rewrites one page over an edit after confirming, clearing the marker and the edit', async () => {
		const doc = twoWritten();
		doc.reports['ada'].edit = {
			strengths: ['Teacher wording'],
			areasForImprovement: ['Check units']
		};
		seed(doc);
		const { stub } = stubFetch(() => ok('Fresh wording'));
		openPage(ReportsPage);

		await expect.element(page.getByRole('button', { name: 'Print all 2' })).toBeInTheDocument();
		marksheetStore().setMark('ada', 'entry-1', 4);
		const strip = document.querySelector('[data-page-for="ada"]');
		await expect.element(page.getByText(/^Out of date/).first()).toBeInTheDocument();

		await page.getByRole('button', { name: 'Rewrite', exact: true }).first().click();
		const dialog = page.getByRole('dialog', { name: 'Rewrite this report?' });
		await expect.element(dialog).toBeInTheDocument();
		await expect.element(dialog).toHaveTextContent('This discards your edits.');
		await page.getByRole('button', { name: 'Keep my edits' }).click();
		expect(reportCalls(stub)).toBe(0);

		await page.getByRole('button', { name: 'Rewrite', exact: true }).first().click();
		await page.getByRole('button', { name: 'Discard edits and rewrite' }).click();
		await vi.waitFor(() => expect(reportCalls(stub)).toBe(1), { timeout: 5000 });
		await vi.waitFor(() => expect(strip?.textContent).not.toContain('Out of date'), {
			timeout: 5000
		});
		// Fresh wording replaces the prose and clears the teacher's edit.
		await expect
			.element(page.getByLabelText('Strength 1 for Ada Lovelace'))
			.toHaveValue('Fresh wording');
		expect(strip?.textContent).not.toContain('edited');
	});

	it('a failed rewrite keeps prose, edit and marker, and Retry writes it', async () => {
		const doc = twoWritten();
		doc.reports['ada'].edit = {
			strengths: ['Teacher wording'],
			areasForImprovement: ['Check units']
		};
		seed(doc);
		const { stub } = stubFetch((n) =>
			n === 0
				? Response.json(
						{
							error: {
								code: 'INVALID_REPORT_INPUT',
								message: 'Bad entry',
								retryable: false,
								field: 'entries[0].gained'
							}
						},
						{ status: 400 }
					)
				: ok('Fresh wording')
		);
		openPage(ReportsPage);

		await expect.element(page.getByRole('button', { name: 'Print all 2' })).toBeInTheDocument();
		marksheetStore().setMark('ada', 'entry-1', 4);
		const strip = document.querySelector('[data-page-for="ada"]');
		await expect.element(page.getByText(/^Out of date/).first()).toBeInTheDocument();

		await page.getByRole('button', { name: 'Rewrite', exact: true }).first().click();
		await page.getByRole('button', { name: 'Discard edits and rewrite' }).click();
		await vi.waitFor(() => expect(reportCalls(stub)).toBe(1), { timeout: 5000 });

		// The failure stays in the strip; nothing is lost.
		await expect.element(page.getByText('Bad entry')).toBeInTheDocument();
		await expect
			.element(page.getByLabelText('Strength 1 for Ada Lovelace'))
			.toHaveValue('Teacher wording');
		expect(strip?.textContent).toContain('edited');
		expect(strip?.textContent).toContain('Out of date');

		await page.getByRole('button', { name: 'Retry', exact: true }).click();
		await page.getByRole('button', { name: 'Discard edits and rewrite' }).click();
		await vi.waitFor(() => expect(reportCalls(stub)).toBe(2), { timeout: 5000 });
		await expect
			.element(page.getByLabelText('Strength 1 for Ada Lovelace'))
			.toHaveValue('Fresh wording');
	});

	it('marks a report out of date when its mark changes mid-write', async () => {
		seed(solo());
		let release!: (value: Response) => void;
		const gate = new Promise<Response>((resolve) => {
			release = resolve;
		});
		const { stub } = stubFetch(() => gate);
		const shown = openPage(ReportsPage);
		await skipGrades();

		await page.getByRole('button', { name: 'Write 1 report' }).click();
		await vi.waitFor(() => expect(reportCalls(stub)).toBe(1));
		// The request is in flight with the old marks: this lands after send.
		marksheetStore().setMark('ada', 'entry-1', 4);
		release(ok());

		await expect.element(page.getByRole('button', { name: 'Print all 1' })).toBeInTheDocument();
		await expect.element(page.getByText(/^Out of date/).first()).toBeInTheDocument();
		await shown.unmount();
	});

	it('asks before Print all, prints anyway, and offers rewrite-them-first on confirm', async () => {
		const doc = twoWritten();
		seed(doc);
		stubFetch(() => ok('Fresh wording'));
		const shown = openPage(ReportsPage);

		await expect.element(page.getByRole('button', { name: 'Print all 2' })).toBeInTheDocument();
		marksheetStore().setMark('ada', 'entry-1', 4);
		await expect.element(page.getByText('Out of date').first()).toBeInTheDocument();

		// The confirm counts the report that is out of date now: one. This
		// test runs before the bulk-rewrite tests below: each of those leaves a
		// finished run behind, and a run left writing would still be flushing
		// its reports when this click lands.
		const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
		await page.getByRole('button', { name: 'Print all 2' }).click();
		const dialog = page.getByRole('dialog', { name: 'Out-of-date reports' });
		await expect.element(dialog).toBeInTheDocument();
		await vi.waitFor(() =>
			expect(dialog.element().textContent).toMatch(/1 report\s+is out of date/)
		);
		expect(print).not.toHaveBeenCalled();

		await dialog.getByRole('button', { name: 'Print anyway' }).click();
		expect(print).toHaveBeenCalledTimes(1);
		print.mockRestore();
		await shown.unmount();
	});

	it('warns before printing one out-of-date page', async () => {
		seed(twoWritten());
		stubFetch();
		const shown = openPage(ReportsPage);

		await expect.element(page.getByRole('button', { name: 'Print all 2' })).toBeInTheDocument();
		marksheetStore().setMark('ada', 'entry-1', 4);
		await expect.element(page.getByText('Out of date').first()).toBeInTheDocument();

		const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
		await page.getByRole('button', { name: 'Print this page' }).first().click();
		const dialog = page.getByRole('dialog', { name: 'Out-of-date reports' });
		await expect.element(dialog).toBeInTheDocument();
		await vi.waitFor(() =>
			expect(dialog.element().textContent).toMatch(/1 report\s+is out of date/)
		);
		expect(print).not.toHaveBeenCalled();

		await dialog.getByRole('button', { name: 'Print anyway' }).click();
		await vi.waitFor(() => expect(print).toHaveBeenCalledTimes(1));
		const printed = [
			...document.querySelectorAll('[data-testid="print-root"] [data-report-id]')
		].map((sheet) => sheet.getAttribute('data-report-id'));
		expect(printed).toEqual(['ada']);
		print.mockRestore();
		await shown.unmount();
	});

	it('bulk rewrite skips edited reports unless opted in', async () => {
		const doc = twoWritten();
		doc.reports['ada'].edit = {
			strengths: ['Teacher wording'],
			areasForImprovement: ['Check units']
		};
		seed(doc);
		const { stub } = stubFetch(() => ok('Fresh wording'));
		const bulk = openPage(ReportsPage);

		await expect.element(page.getByRole('button', { name: 'Print all 2' })).toBeInTheDocument();
		marksheetStore().setMark('ada', 'entry-1', 4);
		marksheetStore().setMark('bo', 'entry-1', 4);
		// One marker in Ada's strip, one in Bo's: no badge splits them.
		await vi.waitFor(() => expect(page.getByText(/^Out of date/).all()).toHaveLength(2), {
			timeout: 5000
		});

		await page.getByRole('button', { name: 'Rewrite 1 out of date (skips 1 edited)' }).click();
		await vi.waitFor(() => expect(reportCalls(stub)).toBe(1), { timeout: 5000 });
		await vi.waitFor(
			() =>
				expect(document.querySelector('[data-page-for="bo"]')?.textContent).not.toContain(
					'Out of date'
				),
			{ timeout: 5000 }
		);
		// The edited report keeps its wording and its marker.
		expect(document.querySelector('[data-page-for="ada"]')?.textContent).toContain('Out of date');
		await expect
			.element(page.getByLabelText('Strength 1 for Ada Lovelace'))
			.toHaveValue('Teacher wording');

		await page.getByLabelText('also rewrite 1 edited (discards edits)').click();
		await page.getByRole('button', { name: 'Rewrite 1 out of date' }).click();
		await vi.waitFor(() => expect(reportCalls(stub)).toBe(2), { timeout: 8000 });
		await vi.waitFor(() => expect(page.getByText(/^Out of date/).query()).toBeNull(), {
			timeout: 8000
		});
		await bulk.unmount();
	});

	it('rewrite-them-first from Print all rewrites the unedited reports', async () => {
		const doc = twoWritten();
		doc.reports['ada'].edit = {
			strengths: ['Teacher wording'],
			areasForImprovement: ['Check units']
		};
		seed(doc);
		const { stub } = stubFetch(() => ok('Fresh wording'));
		const shown = openPage(ReportsPage);

		await expect.element(page.getByRole('button', { name: 'Print all 2' })).toBeInTheDocument();
		marksheetStore().setMark('ada', 'entry-1', 4);
		marksheetStore().setMark('bo', 'entry-1', 4);
		await vi.waitFor(() => expect(page.getByText(/^Out of date/).all()).toHaveLength(2), {
			timeout: 5000
		});

		const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
		await page.getByRole('button', { name: 'Print all 2' }).click();
		await expect
			.element(page.getByRole('dialog', { name: 'Out-of-date reports' }))
			.toBeInTheDocument();
		expect(document.querySelector('[role="dialog"]')?.textContent).toMatch(
			/2 reports\s+are out of date/
		);
		await page.getByRole('button', { name: 'Rewrite them first' }).click();
		// Only Bo's unedited report rewrites; Ada keeps her wording and marker.
		await vi.waitFor(() => expect(reportCalls(stub)).toBe(1), { timeout: 5000 });
		expect(print).not.toHaveBeenCalled();
		await expect
			.element(page.getByLabelText('Strength 1 for Ada Lovelace'))
			.toHaveValue('Teacher wording');
		expect(document.querySelector('[data-page-for="ada"]')?.textContent).toContain('Out of date');
		print.mockRestore();
		await shown.unmount();
	});

	it('hides an absent student’s report, shows Blocked in the rail, and brings it back', async () => {
		seed(twoWritten());
		stubFetch();
		openPage(ReportsPage);

		await expect.element(page.getByRole('button', { name: 'Print all 2' })).toBeInTheDocument();
		marksheetStore().setStudentAbsent('ada', true);

		await vi.waitFor(() => expect(document.querySelector('[data-page-for="ada"]')).toBeNull(), {
			timeout: 5000
		});
		await expect.element(page.getByRole('button', { name: 'Print all 1' })).toBeInTheDocument();
		const rail = document.querySelector('aside');
		expect(rail?.textContent).toContain('Blocked');
		expect(rail?.textContent).toContain('Absent');

		marksheetStore().setStudentAbsent('ada', false);
		await vi.waitFor(() => expect(document.querySelector('[data-page-for="ada"]')).not.toBeNull(), {
			timeout: 5000
		});
		await expect.element(page.getByRole('button', { name: 'Print all 2' })).toBeInTheDocument();
	});
});

describe('review fixes', () => {
	function ownWritten(
		doc: MarksheetDocument,
		prose: Parameters<typeof writeFor>[2]
	): MarksheetDocument {
		const only = {
			...doc,
			students: [doc.students[0]],
			marks: { [doc.students[0].id]: doc.marks[doc.students[0].id] }
		};
		writeFor(only, [only.students[0].id], prose);
		return only;
	}

	it('flags an emptied areas section for a student who dropped marks, and prints it blank', async () => {
		seed(ownWritten(plain(), { areasForImprovement: ['Check units'] }));
		stubFetch();
		openPage(ReportsPage);

		await expect.element(page.getByRole('button', { name: 'Print all 1' })).toBeInTheDocument();
		await page.getByLabelText('Area for improvement 1 for Ada Lovelace').fill('');
		await userEvent.keyboard('{Tab}');

		await expect.element(page.getByText('Areas for improvement is empty')).toBeInTheDocument();
		const printed = document.querySelector('[data-testid="print-root"]')?.textContent ?? '';
		expect(printed).not.toContain('You dropped no marks');
	});

	it('prints the no-areas line for a student who gained every mark', async () => {
		const doc = plain();
		doc.marks['ada'] = { 'entry-1': 4, 'entry-2': 6 };
		seed(ownWritten(doc, { areasForImprovement: [] }));
		stubFetch();
		openPage(ReportsPage);

		await expect.element(page.getByRole('button', { name: 'Print all 1' })).toBeInTheDocument();
		expect(document.querySelector('[data-testid="print-root"]')?.textContent).toContain(
			'You dropped no marks'
		);
		expect(page.getByText('Areas for improvement is empty').query()).toBeNull();
	});

	it('edits each feedback item inside the printed list markup', async () => {
		seed(ownWritten(plain(), { strengths: ['First strength', 'Second strength'] }));
		stubFetch();
		openPage(ReportsPage);

		await expect.element(page.getByRole('button', { name: 'Print all 1' })).toBeInTheDocument();
		const sheet = document.querySelector('main [data-report-id="ada"]');
		expect(sheet?.querySelectorAll('ul > li > textarea')).toHaveLength(2);
		expect(sheet?.querySelectorAll('ol > li > textarea')).toHaveLength(1);
	});
});
