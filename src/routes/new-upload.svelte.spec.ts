import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import AppNav from '$lib/components/shell/AppNav.svelte';
import type { MarksheetDocument } from '$lib/marksheet/document.js';
import {
	NOW,
	confirmed,
	entry,
	seed,
	readSeeded,
	student
} from '$lib/marksheet/fixtures.spec-helpers.js';
import { captureDownload } from '$lib/marksheet/download.spec-helpers.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import BreakdownPage from './breakdown/+page.svelte';
import MarksheetPage from './marksheet/+page.svelte';

/** A confirmed marksheet: the surface a teacher wipes from with work in hand. */
function marksheet(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
	return confirmed({
		paper: { ...confirmed().paper, className: '10C1' },
		students: [student('student-1', 'Ada', 'Lovelace')],
		marks: { 'student-1': { 'entry-1': 3 } },
		...overrides
	});
}

/** A parse nobody has confirmed: the state the breakdown page exists for. */
function parsed(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
	return marksheet({ breakdownConfirmedAt: null, students: [], marks: {}, ...overrides });
}

/** A moment before now, as the document records it: aged against the real clock. */
function daysAgo(days: number): string {
	return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** The nav is where "New upload…" lives now, so the page is rendered under it. */
function openMarksheetPage() {
	marksheetStore().load();
	render(AppNav);
	return render(MarksheetPage);
}

function openBreakdownPage() {
	marksheetStore().load();
	render(AppNav);
	return render(BreakdownPage);
}

/** The new-upload dialog, opened the way the teacher opens it. */
async function openNewUpload() {
	await page.getByRole('button', { name: 'New upload…' }).click();
	return page.getByRole('dialog');
}

describe('the new-upload dialog', () => {
	it('names the marks and the students a wipe would take', async () => {
		seed(
			marksheet({
				breakdown: {
					entries: [entry('entry-1', '2bii', '2'), entry('entry-2', '3a', '3', { marks: 2 })],
					warnings: []
				},
				students: [
					student('student-1', 'Ada', 'Lovelace'),
					student('student-2', 'Grace', 'Hopper')
				],
				marks: { 'student-1': { 'entry-1': 3, 'entry-2': 1 }, 'student-2': { 'entry-1': 0 } }
			})
		);
		openMarksheetPage();

		const dialog = await openNewUpload();

		await expect.element(dialog).toHaveTextContent('Start a new upload?');
		await expect
			.element(dialog)
			.toHaveTextContent('This deletes 3 marks for 2 students in 10X Ph1 from this browser.');
		// The button is labelled by the loss, never by "OK".
		await expect
			.element(page.getByRole('button', { name: 'Delete 3 marks and start again' }))
			.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Keep working' })).toBeInTheDocument();
	});

	it('names the class and the breakdown when nothing has been marked yet', async () => {
		seed(
			marksheet({
				students: [
					student('student-1', 'Ada', 'Lovelace'),
					student('student-2', 'Grace', 'Hopper')
				],
				marks: {}
			})
		);
		openMarksheetPage();

		const dialog = await openNewUpload();

		await expect
			.element(dialog)
			.toHaveTextContent(
				'This deletes the class of 2 students and the breakdown in 10X Ph1 from this browser.'
			);
		await expect
			.element(page.getByRole('button', { name: 'Delete and start again' }))
			.toBeInTheDocument();
		// The names are work too, so a copy is offered before they go.
		await expect.element(page.getByTestId('wipe-backup')).toHaveTextContent('Never backed up');
		await expect.element(page.getByRole('button', { name: 'Download backup' })).toBeInTheDocument();
	});

	it('names the breakdown alone, and offers no checklist, from the breakdown page', async () => {
		seed(parsed());
		openBreakdownPage();

		const dialog = await openNewUpload();

		await expect
			.element(dialog)
			.toHaveTextContent('This deletes the stored breakdown for 10X Ph1 from this browser.');
		await expect
			.element(page.getByRole('button', { name: 'Delete and start again' }))
			.toBeInTheDocument();
		// Nothing has been marked and no class exists, so there is no work a copy
		// would keep: the checklist has nothing to check.
		expect(page.getByTestId('wipe-checklist').query()).toBeNull();
	});

	it('names a paper the teacher never labelled without one', async () => {
		seed(
			parsed({
				paper: {
					label: null,
					className: null,
					sourceFilenames: [],
					parsedAt: NOW,
					boundaries: null,
					belowLowestLabel: 'U'
				}
			})
		);
		openBreakdownPage();

		const dialog = await openNewUpload();

		await expect
			.element(dialog)
			.toHaveTextContent('This deletes the stored breakdown from this browser.');
	});

	it('takes a backup from inside the dialog, and says so once it is taken', async () => {
		seed(marksheet());
		openMarksheetPage();
		await openNewUpload();
		await expect.element(page.getByTestId('wipe-backup')).toHaveTextContent('Never backed up');
		const file = captureDownload();

		await page.getByRole('button', { name: 'Download backup' }).click();

		// The row flips, so the teacher sees the copy was taken rather than has to
		// trust that it was.
		await expect.element(page.getByTestId('wipe-backup')).toHaveTextContent('Backed up just now');
		expect(file.filename()).toMatch(/^qla-backup-10x-ph1-\d{4}-\d{2}-\d{2}\.json$/);
		expect(readSeeded().lastExportedAt).not.toBeNull();
	});

	it('offers the marks as a CSV beside it, labelled as the thing it is not', async () => {
		seed(marksheet());
		openMarksheetPage();
		await openNewUpload();

		await expect
			.element(page.getByTestId('wipe-csv'))
			.toHaveTextContent('Not a backup — it cannot be restored from.');
		const file = captureDownload();

		await page.getByRole('button', { name: 'Export CSV' }).click();

		expect(file.filename()).toBe('10x-ph1-10c1-marks.csv');
		expect(await file.text()).toContain('Lovelace,Ada,,3,3');
		// A marks export is not a backup, so the dialog's own backup row must not
		// look done because of it.
		expect(readSeeded().lastExportedAt).toBeNull();
	});

	it('reports the backup’s real age when the dialog is opened again', async () => {
		seed(marksheet({ lastExportedAt: daysAgo(3) }));
		openMarksheetPage();
		await openNewUpload();
		await expect.element(page.getByTestId('wipe-backup')).toHaveTextContent('Last one 3 days ago');

		await page.getByRole('button', { name: 'Download backup' }).click();
		await expect.element(page.getByTestId('wipe-backup')).toHaveTextContent('Backed up just now');
		await page.getByRole('button', { name: 'Keep working' }).click();

		await openNewUpload();

		// The flip belongs to the dialog that made the copy, not to every opening
		// of it: work done after that backup is not in it.
		await expect.element(page.getByTestId('wipe-backup')).toHaveTextContent('Last one just now');
	});
});
