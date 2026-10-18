import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createRawSnippet } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { toast } from 'svelte-sonner';
import { DOCUMENT_SCHEMA_VERSION, STORAGE_KEY } from '$lib/marksheet/document.js';
import type { MarksheetDocument } from '$lib/marksheet/document.js';
import { captureDownload } from '$lib/marksheet/download.spec-helpers.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import Layout from './+layout.svelte';

const NOW = '2026-01-01T10:00:00.000Z';

/** A confirmed document: the state a marksheet exists in. */
function confirmed(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
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
		students: [{ id: 'student-1', firstName: 'Ada', surname: 'Lovelace', absent: false }],
		marks: { 'student-1': { 'entry-1': 3 } },
		...overrides
	};
}

function seed(stored: MarksheetDocument): void {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

/** A stand-in for whichever surface the route would render inside the shell. */
const surface = createRawSnippet(() => ({
	render: () => '<p data-testid="surface">a surface</p>'
}));

/** The shell as a route renders it: the layout, around a surface. */
function openShell() {
	marksheetStore().load();
	return render(Layout, { children: surface });
}

/** The status bar itself. */
function bar(screen: { container: HTMLElement }): HTMLElement {
	const element = screen.container.querySelector<HTMLElement>('[data-testid="status-bar"]');
	if (!element) throw new Error('no status bar');
	return element;
}

beforeEach(() => {
	// A fresh surface: the store keeps changes the tab has not written, so a
	// previous test's document is wiped rather than carried into this one.
	marksheetStore().wipe();
	localStorage.clear();
});

afterEach(() => {
	toast.dismiss();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('status bar', () => {
	it('says nothing when the browser is holding no document', async () => {
		const screen = openShell();

		await expect.element(page.getByTestId('surface')).toBeInTheDocument();
		expect(screen.container.querySelector('[data-testid="status-bar"]')).toBeNull();
	});

	it('reads the last save with how long ago it landed, and its dot', async () => {
		seed(confirmed());

		const screen = openShell();

		await expect
			.element(page.getByTestId('save-line'))
			.toHaveTextContent(/^All changes saved · (just now|\d+s ago)$/);
		expect(bar(screen).getAttribute('data-tone')).toBe('ok');
		expect(screen.container.querySelector('[data-testid="save-dot"]')).not.toBeNull();
		// Nothing has gone wrong, so there is nothing to rescue.
		expect(page.getByRole('button', { name: 'Download backup now' }).query()).toBeNull();
	});

	it('counts the age on while the tab sits open', async () => {
		// Only the clock is faked: the bar reads it on a real one-second tick, so a
		// test can stand the tab open for twelve seconds without waiting for them.
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(2026, 0, 1, 10, 0, 0));
		seed(confirmed());

		openShell();

		await expect
			.element(page.getByTestId('save-line'))
			.toHaveTextContent('All changes saved · just now');

		vi.setSystemTime(new Date(2026, 0, 1, 10, 0, 12));
		const { promise, resolve } = Promise.withResolvers<void>();
		setTimeout(resolve, 1100);
		await promise;

		await expect
			.element(page.getByTestId('save-line'))
			.toHaveTextContent('All changes saved · 12s ago');
	});

	it('reads a write in flight, then the save that landed', async () => {
		seed(confirmed());

		const screen = openShell();
		await expect.element(page.getByTestId('save-line')).toHaveTextContent(/^All changes saved · /);

		marksheetStore().setPaperLabel('10X Ph1 — Nov mock');

		await expect.element(page.getByTestId('save-line')).toHaveTextContent('Saving…');
		expect(bar(screen).getAttribute('data-tone')).toBe('busy');

		await expect.element(page.getByTestId('save-line')).toHaveTextContent(/^All changes saved · /);
		expect(bar(screen).getAttribute('data-tone')).toBe('ok');
	});

	it('turns red when a write is refused, and offers the document in the tab out', async () => {
		seed(confirmed());

		const screen = openShell();
		await expect.element(page.getByTestId('save-line')).toHaveTextContent(/^All changes saved · /);

		// A full quota: the probe has already passed, so only the document's own
		// write is refused now.
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('quota', 'QuotaExceededError');
		});
		const file = captureDownload();

		marksheetStore().setPaperLabel('10X Ph1 — Nov mock');

		await expect
			.element(page.getByTestId('save-line'))
			.toHaveTextContent(/^Couldn't save — changes since \d{2}:\d{2} are only in this tab$/);
		expect(bar(screen).getAttribute('data-tone')).toBe('error');

		await page.getByRole('button', { name: 'Download backup now' }).click();

		// What the browser refused to keep is still reachable, change and all.
		expect(file.filename()).toMatch(/^qla-backup-10x-ph1-nov-mock-\d{4}-\d{2}-\d{2}\.json$/);
		const handed = JSON.parse(await file.text()) as MarksheetDocument;
		expect(handed.paper.label).toBe('10X Ph1 — Nov mock');
	});

	it('stands amber from boot when the browser will keep nothing, and offers the work out', async () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('private browsing', 'SecurityError');
		});

		const store = marksheetStore();
		const screen = openShell();

		// Storage is unavailable, so the app carries on with nothing stored — and
		// says so before a parse pays for work that cannot be kept.
		expect(store.document).toBeNull();
		expect(store.route()).toBe('/');
		await expect
			.element(page.getByTestId('save-line'))
			.toHaveTextContent("This browser can't store anything — work is lost when the tab closes");
		expect(bar(screen).getAttribute('data-tone')).toBe('warn');
		// Nothing has been parsed, so there is nothing to hand out yet.
		expect(page.getByRole('button', { name: 'Download backup now' }).query()).toBeNull();

		// A parse is worth keeping whatever the browser will do with it, so it
		// lands in the tab and can be handed out from there.
		store.createFromParse({
			breakdown: {
				questions: [
					{
						id: '2bii',
						questionNumber: '2',
						marks: 4,
						summary: 'Explain the process shown',
						specPoint: '3.2.1.4',
						commandWord: 'Explain',
						ao: 'AO1'
					}
				]
			},
			warnings: [],
			usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estCost: 0 },
			filenames: ['10X Ph1.pdf']
		});

		await expect
			.element(page.getByRole('button', { name: 'Download backup now' }))
			.toBeInTheDocument();
		expect(bar(screen).getAttribute('data-tone')).toBe('warn');
	});

	it('keeps a toast clear of the bar', async () => {
		seed(confirmed());

		const screen = openShell();
		await expect.element(page.getByTestId('surface')).toBeInTheDocument();

		toast('Breakdown stored', { description: '1 entry saved in this browser.' });

		await vi.waitFor(() => {
			const element = document.querySelector<HTMLElement>('[data-sonner-toast]');
			if (!element) throw new Error('no toast on screen');
			const clearance =
				bar(screen).getBoundingClientRect().top - element.getBoundingClientRect().bottom;
			expect(clearance).toBeGreaterThanOrEqual(0);
		});
	});
});
