import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { goto } from '$app/navigation';
import { toast } from 'svelte-sonner';
import { STORAGE_KEY } from '$lib/marksheet/document.js';
import type { MarksheetDocument } from '$lib/marksheet/document.js';
import { confirmed, entry, parsed, seed, student } from '$lib/marksheet/fixtures.spec-helpers.js';
import { captureDownload } from '$lib/marksheet/download.spec-helpers.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import BreakdownPage from './breakdown/+page.svelte';
import MarksheetPage from './marksheet/+page.svelte';
import { openPage, toastOnScreen, waitForToast } from './spec-helpers.js';
import UploadPage from './+page.svelte';
import BackupNudgeHarness from './BackupNudgeHarness.test.svelte';

/**
 * A moment the teacher read off a clock, as the document records it. Aged
 * against the real clock a test runs on, since that is the one the control
 * reads.
 */
function ago(ms: number): string {
	return new Date(Date.now() - ms).toISOString();
}

function hoursAgo(hours: number): string {
	return ago(hours * 60 * 60 * 1000);
}

function daysAgo(days: number): string {
	return ago(days * 24 * 60 * 60 * 1000);
}

/** A marksheet with a mark in it: the work a backup is for. */
function marksheet(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
	return confirmed({
		paper: { ...confirmed().paper, className: '10C1' },
		breakdown: {
			entries: [entry('entry-1', '2bii', '2')],
			warnings: [],
			aoDescriptions: {}
		},
		students: [student('student-1', 'Ada', 'Lovelace'), student('student-2', 'Grace', 'Hopper')],
		marks: { 'student-1': { 'entry-1': 3 } },
		...overrides
	});
}

function backupFile(
	stored: MarksheetDocument,
	filename = 'qla-backup-10x-ph1-2026-01-01.json'
): File {
	return new File([JSON.stringify(stored)], filename, { type: 'application/json' });
}

/** The toast's "Back up now" action, once sonner has rendered it. */
function toastAction(element: HTMLElement): HTMLButtonElement | undefined {
	return [...element.querySelectorAll<HTMLButtonElement>('button')].find(
		(button) => button.textContent?.trim() === 'Back up now'
	);
}

/** Give sonner a turn to render, so a missing toast is a real absence. */
async function settle(): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setTimeout(resolve, 100);
	await promise;
}

afterEach(() => {
	vi.useRealTimers();
	toast.dismiss();
});

describe('the backup control', () => {
	it('sits in the grid toolbar with the age of the last backup, disabled when nothing has changed', async () => {
		seed(marksheet({ lastExportedAt: hoursAgo(1) }));

		openPage(MarksheetPage);

		await expect.element(page.getByTestId('grid-toolbar')).toHaveTextContent('Backup 1 h ago');
		const button = page.getByRole('button', { name: 'Back up now' });
		await expect.element(button).toBeDisabled();
		await expect.element(button).toHaveAttribute('title', 'Nothing new since the last backup');
	});

	it('sits before Edit breakdown and the marks export', async () => {
		seed(marksheet({ lastExportedAt: hoursAgo(1) }));

		openPage(MarksheetPage);

		const control = page.getByTestId('backup-control').element();
		const edit = page.getByRole('button', { name: 'Edit breakdown' }).element();
		const exportMarks = page
			.getByRole('button', { name: 'Export marks to spreadsheet (.csv)' })
			.element();
		expect(control.nextElementSibling).toBe(edit);
		expect(edit.nextElementSibling).toBe(exportMarks);
	});

	it('is enabled after a change, and stays enabled after the change is undone', async () => {
		seed(marksheet({ lastExportedAt: hoursAgo(1) }));
		openPage(MarksheetPage);
		const button = page.getByRole('button', { name: 'Back up now' });
		await expect.element(button).toBeDisabled();

		marksheetStore().removeStudent('student-1');
		await expect.element(button).toBeEnabled();

		marksheetStore().undo();
		await expect.element(button).toBeEnabled();
	});

	it('is enabled on a document that has never been backed up, even with no marks', async () => {
		seed(marksheet({ lastExportedAt: null, students: [], marks: {} }));

		openPage(MarksheetPage);

		await expect.element(page.getByTestId('backup-control')).toHaveTextContent('No backup yet');
		const button = page.getByRole('button', { name: 'Back up now' });
		await expect.element(button).toBeEnabled();
		await expect.element(button).toHaveAttribute('title', 'Never backed up');
	});

	it('takes a backup from the toolbar and records the moment', async () => {
		seed(marksheet({ lastExportedAt: null }));
		openPage(MarksheetPage);
		const file = captureDownload();

		await page.getByRole('button', { name: 'Back up now' }).click();

		expect(file.filename()).toMatch(/^qla-backup-10x-ph1-\d{4}-\d{2}-\d{2}\.json$/);
		const handed = JSON.parse(await file.text()) as MarksheetDocument;
		expect(handed.lastExportedAt).not.toBeNull();
		expect(handed.firstUnbackedChangeAt).toBeNull();
		expect(handed.marks).toEqual({ 'student-1': { 'entry-1': 3 } });
		await expect
			.element(page.getByTestId('backup-control'))
			.toHaveTextContent(/Backup (just now|\d+s ago)/);
		await expect.element(page.getByRole('button', { name: 'Back up now' })).toBeDisabled();
	});

	it('stands at the right end of the breakdown header', async () => {
		seed(parsed({ students: [], marks: {} }));

		const screen = openPage(BreakdownPage);

		await expect.element(page.getByTestId('backup-control')).toHaveTextContent('No backup yet');
		const control = screen.container.querySelector('header [data-testid="backup-control"]');
		expect(control).not.toBeNull();
		expect(control?.parentElement?.lastElementChild).toBe(control);
	});
});

describe('the backup nudge toast', () => {
	it('names the oldest unbacked change and offers a backup', async () => {
		seed(marksheet({ lastExportedAt: daysAgo(5), firstUnbackedChangeAt: daysAgo(3) }));

		openPage(BackupNudgeHarness);

		const element = await waitForToast();
		expect(element.textContent).toContain("Changes from 3 days ago aren't backed up");
		expect(element.textContent).toContain(
			'A backup file is the only copy that survives the browser clearing its storage.'
		);
		expect(toastAction(element)).toBeDefined();
	});

	it('stays silent while the oldest unbacked change is two days old or younger', async () => {
		seed(marksheet({ lastExportedAt: daysAgo(5), firstUnbackedChangeAt: hoursAgo(47) }));

		openPage(BackupNudgeHarness);

		await settle();
		expect(toastOnScreen()).toBeNull();
	});

	it('nudges when the oldest unbacked change passes two days while the page stays open', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'));
		seed(marksheet({ lastExportedAt: daysAgo(5), firstUnbackedChangeAt: hoursAgo(47) }));

		openPage(BackupNudgeHarness);

		// An hour brings the change to exactly two days: still fresh. The next
		// hour passes the line, and the open page says so.
		await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
		expect(toastOnScreen()).toBeNull();

		await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
		const element = toastOnScreen();
		expect(element?.textContent).toContain("Changes from 2 days ago aren't backed up");
	});

	it('shows the toast only once in the session', async () => {
		seed(marksheet({ lastExportedAt: daysAgo(5), firstUnbackedChangeAt: daysAgo(3) }));
		openPage(BackupNudgeHarness);
		await waitForToast();
		toast.dismiss();

		await page.getByRole('button', { name: 'Switch surface' }).click();

		await settle();
		expect(toastOnScreen()).toBeNull();
	});

	it('backs the document up from the toast action', async () => {
		seed(marksheet({ lastExportedAt: daysAgo(5), firstUnbackedChangeAt: daysAgo(3) }));
		openPage(BackupNudgeHarness);
		const element = await waitForToast();
		const file = captureDownload();

		toastAction(element)?.click();

		const handed = JSON.parse(await file.text()) as MarksheetDocument;
		expect(handed.firstUnbackedChangeAt).toBeNull();
		await expect
			.element(page.getByTestId('backup-control'))
			.toHaveTextContent(/Backup (just now|\d+s ago)/);
	});
});

describe('restoring a backup on the upload surface', () => {
	it('names what the file holds before it is restored', async () => {
		openPage(UploadPage);

		await page
			.getByLabelText('Backup file')
			.upload(backupFile(marksheet({ lastExportedAt: hoursAgo(2) })));

		const dialog = page.getByRole('dialog');
		await expect.element(dialog).toHaveTextContent('qla-backup-10x-ph1-2026-01-01.json');
		await expect.element(dialog).toHaveTextContent('10X Ph1');
		await expect.element(dialog).toHaveTextContent('10C1');
		await expect.element(dialog).toHaveTextContent('2 students and 1 mark');
		await expect.element(dialog).toHaveTextContent('backed up 2 h ago');
	});

	it('brings a confirmed marksheet back and lands on it', async () => {
		openPage(UploadPage);

		await page
			.getByLabelText('Backup file')
			.upload(backupFile(marksheet({ lastExportedAt: hoursAgo(2) })));
		await page.getByRole('button', { name: 'Restore marksheet' }).click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/marksheet'));
		const restored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as MarksheetDocument;
		expect(restored.paper.label).toBe('10X Ph1');
		expect(restored.marks).toEqual({ 'student-1': { 'entry-1': 3 } });
		expect(restored.firstUnbackedChangeAt).toBeNull();
		expect(marksheetStore().route()).toBe('/marksheet');
	});

	it('lands an unconfirmed breakdown back on the breakdown page', async () => {
		openPage(UploadPage);

		await page
			.getByLabelText('Backup file')
			.upload(backupFile(marksheet({ breakdownConfirmedAt: null })));
		await page.getByRole('button', { name: 'Restore marksheet' }).click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/breakdown'));
		expect(marksheetStore().route()).toBe('/breakdown');
	});

	it('refuses a file that is not a backup, leaving everything as it was', async () => {
		const screen = openPage(UploadPage);

		await page.getByLabelText('Backup file').upload(new File(['notes'], 'notes.json'));

		await expect.element(page.getByTestId('restore-error')).toBeInTheDocument();
		expect(page.getByRole('dialog').query()).toBeNull();
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
		expect(goto).not.toHaveBeenCalled();
		// The field holds nothing again, so the same file can be chosen once more.
		expect(screen.container.querySelector<HTMLInputElement>('#backup-file')?.files?.length).toBe(0);
	});

	it('changes nothing when the teacher cancels the confirm', async () => {
		openPage(UploadPage);

		await page.getByLabelText('Backup file').upload(backupFile(marksheet()));
		await page.getByRole('button', { name: 'Cancel' }).click();

		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
		expect(goto).not.toHaveBeenCalled();
	});
});
