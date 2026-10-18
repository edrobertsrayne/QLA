import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { DOCUMENT_SCHEMA_VERSION, STORAGE_KEY } from '$lib/marksheet/document.js';
import type { MarksheetDocument } from '$lib/marksheet/document.js';
import { captureDownload } from '$lib/marksheet/download.spec-helpers.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import { load as marksheetLoad } from './marksheet/+page.js';
import MarksheetPage from './marksheet/+page.svelte';
import { load as uploadLoad } from './+page.js';
import UploadPage from './+page.svelte';

const goto = vi.hoisted(() => vi.fn());

vi.mock('$app/navigation', () => ({ goto }));

const NOW = '2026-01-01T10:00:00.000Z';

/**
 * A moment the teacher read off a clock, as the document records it. Aged
 * against the real clock a test runs on, since that is the one the card reads.
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
	return {
		schemaVersion: DOCUMENT_SCHEMA_VERSION,
		createdAt: NOW,
		updatedAt: NOW,
		breakdownConfirmedAt: NOW,
		lastExportedAt: null,
		paper: {
			label: '10X Ph1',
			className: '10C1',
			sourceFilenames: ['10X Ph1.pdf'],
			parsedAt: NOW
		},
		breakdown: {
			entries: [
				{
					id: 'entry-1',
					label: '2bii',
					questionNumber: '2',
					marks: 4,
					summary: 'Explain the process shown',
					specPoint: '3.2.1.4',
					commandWord: 'Explain',
					ao: 'AO1'
				}
			],
			warnings: []
		},
		students: [
			{ id: 'student-1', firstName: 'Ada', surname: 'Lovelace', absent: false },
			{ id: 'student-2', firstName: 'Grace', surname: 'Hopper', absent: false }
		],
		marks: { 'student-1': { 'entry-1': 3 } },
		...overrides
	};
}

function seed(stored: MarksheetDocument): void {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

function backupFile(
	stored: MarksheetDocument,
	filename = 'qla-backup-10x-ph1-2026-01-01.json'
): File {
	return new File([JSON.stringify(stored)], filename, { type: 'application/json' });
}

/** The route's load guard reads storage before the page renders. */
function openMarksheetPage() {
	marksheetLoad();
	return render(MarksheetPage);
}

function openUploadPage() {
	uploadLoad();
	return render(UploadPage);
}

function testid(screen: { container: HTMLElement }, id: string): HTMLElement {
	const element = screen.container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
	if (!element) throw new Error(`no ${id}`);
	return element;
}

beforeEach(() => {
	// A fresh surface: the store keeps changes the tab has not written, so a
	// previous test's document is wiped rather than carried into this one.
	marksheetStore().wipe();
	localStorage.clear();
	goto.mockClear();
});

describe('the backup card', () => {
	it('reads how old the last backup is, and stays quiet about it', async () => {
		seed(marksheet({ lastExportedAt: hoursAgo(1) }));

		const screen = openMarksheetPage();

		await expect.element(page.getByTestId('backup-card')).toHaveTextContent('Last backup: 1 h ago');
		expect(testid(screen, 'backup-card').getAttribute('data-stale')).toBe('false');
		expect(page.getByTestId('backup-banner').query()).toBeNull();
	});

	it('says none yet for a document that has never been backed up', async () => {
		seed(marksheet({ lastExportedAt: null, students: [], marks: {} }));

		openMarksheetPage();

		await expect
			.element(page.getByTestId('backup-card'))
			.toHaveTextContent('Last backup: None yet');
		// Nothing is entered yet, so there is nothing a browser could clear — the
		// card waits rather than warns.
		expect(page.getByTestId('backup-banner').query()).toBeNull();
	});

	it('stands amber once marks are entered with no backup at all', async () => {
		seed(marksheet({ lastExportedAt: null }));
		const screen = openMarksheetPage();

		await expect
			.element(page.getByTestId('backup-banner'))
			.toHaveTextContent('You have entered marks and never backed them up.');
		expect(testid(screen, 'backup-banner').getAttribute('data-stale')).toBe('true');
		// The way out of the risk, and the way to stop being told about it.
		await expect.element(page.getByRole('button', { name: 'Back up now' })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Remind me later' })).toBeInTheDocument();
	});

	it('stands amber once the last backup is past the eviction window', async () => {
		seed(marksheet({ lastExportedAt: daysAgo(8) }));

		openMarksheetPage();

		await expect
			.element(page.getByTestId('backup-banner'))
			.toHaveTextContent('Your last backup was 8 days ago.');
		await expect
			.element(page.getByTestId('backup-banner'))
			.toHaveTextContent("can clear this site's storage");
	});

	it('stands the banner down for the session, leaving the card amber instead', async () => {
		seed(marksheet({ lastExportedAt: null }));
		const screen = openMarksheetPage();
		await expect.element(page.getByTestId('backup-banner')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Remind me later' }).click();

		await expect.element(page.getByTestId('backup-banner')).not.toBeInTheDocument();
		await expect
			.element(page.getByTestId('backup-card'))
			.toHaveTextContent('Last backup: None yet');
		expect(testid(screen, 'backup-card').getAttribute('data-stale')).toBe('true');
	});

	it('backs the marksheet up from the banner and records the moment', async () => {
		seed(marksheet({ lastExportedAt: null }));
		openMarksheetPage();
		const file = captureDownload();

		await page.getByRole('button', { name: 'Back up now' }).click();

		expect(file.filename()).toMatch(/^qla-backup-10x-ph1-\d{4}-\d{2}-\d{2}\.json$/);
		const handed = JSON.parse(await file.text()) as MarksheetDocument;
		expect(handed.lastExportedAt).not.toBeNull();
		expect(handed.marks).toEqual({ 'student-1': { 'entry-1': 3 } });
		// There is a copy out of this browser now, so the warning stands down.
		await expect.element(page.getByTestId('backup-banner')).not.toBeInTheDocument();
		await expect
			.element(page.getByTestId('backup-card'))
			.toHaveTextContent(/Last backup: (just now|\d+s ago)/);
	});
});

describe('restoring a backup on the upload surface', () => {
	it('names what the file holds before it is restored', async () => {
		openUploadPage();

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
		openUploadPage();

		await page
			.getByLabelText('Backup file')
			.upload(backupFile(marksheet({ lastExportedAt: hoursAgo(2) })));
		await page.getByRole('button', { name: 'Restore marksheet' }).click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/marksheet'));
		const restored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as MarksheetDocument;
		expect(restored.paper.label).toBe('10X Ph1');
		expect(restored.marks).toEqual({ 'student-1': { 'entry-1': 3 } });
		expect(marksheetStore().route()).toBe('/marksheet');
	});

	it('lands an unconfirmed breakdown back on the breakdown page', async () => {
		openUploadPage();

		await page
			.getByLabelText('Backup file')
			.upload(backupFile(marksheet({ breakdownConfirmedAt: null })));
		await page.getByRole('button', { name: 'Restore marksheet' }).click();

		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/breakdown'));
		expect(marksheetStore().route()).toBe('/breakdown');
	});

	it('refuses a file that is not a backup, leaving everything as it was', async () => {
		const screen = openUploadPage();

		await page.getByLabelText('Backup file').upload(new File(['notes'], 'notes.json'));

		await expect.element(page.getByTestId('restore-error')).toBeInTheDocument();
		expect(page.getByRole('dialog').query()).toBeNull();
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
		expect(goto).not.toHaveBeenCalled();
		// The field holds nothing again, so the same file can be chosen once more.
		expect(screen.container.querySelector<HTMLInputElement>('#backup-file')?.files?.length).toBe(0);
	});

	it('changes nothing when the teacher cancels the confirm', async () => {
		openUploadPage();

		await page.getByLabelText('Backup file').upload(backupFile(marksheet()));
		await page.getByRole('button', { name: 'Cancel' }).click();

		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
		expect(goto).not.toHaveBeenCalled();
	});
});
