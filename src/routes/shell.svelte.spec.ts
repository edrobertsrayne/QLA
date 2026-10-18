import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { goto } from '$app/navigation';
import { STORAGE_KEY } from '$lib/marksheet/document.js';
import type { MarksheetDocument } from '$lib/marksheet/document.js';
import {
	NOW,
	entry,
	parseRun,
	parsed as sharedParsed,
	seed
} from '$lib/marksheet/fixtures.spec-helpers.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import BreakdownPage from './breakdown/+page.svelte';
import { openShell } from './spec-helpers.js';

/** A parse nobody has confirmed: no class yet. */
function parsed(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
	return sharedParsed({
		breakdown: {
			entries: [entry('entry-1', '1a', '1', { specPoint: null, commandWord: null, ao: null })],
			warnings: []
		},
		...overrides
	});
}

/** The shell with the breakdown page, whose heading is the paper label's input. */
function openShellOnBreakdown() {
	const shell = openShell();
	render(BreakdownPage);
	return shell;
}

function breadcrumb() {
	return page.getByRole('navigation', { name: 'Breadcrumb' });
}

beforeEach(() => {
	document.documentElement.classList.remove('dark');
});

describe('the breadcrumb', () => {
	it('names the app alone when nothing is stored', async () => {
		openShell();

		await expect.element(breadcrumb()).toHaveTextContent(/^QLA$/);
		expect(page.getByRole('button', { name: 'New upload…' }).query()).toBeNull();
	});

	it('adds the paper once there is one, and the class only once it is named', async () => {
		seed(parsed());
		openShell();

		await expect.element(breadcrumb()).toHaveTextContent(/^QLA\s*\/\s*10X Ph1$/);

		marksheetStore().setClassName('10C1');

		await expect.element(breadcrumb()).toHaveTextContent(/^QLA\s*\/\s*10X Ph1\s*\/\s*10C1$/);
	});

	it('leaves out the paper when it has no label', async () => {
		seed(parsed({ paper: { label: null, className: '10C1', sourceFilenames: [], parsedAt: NOW } }));
		openShell();

		await expect.element(breadcrumb()).toHaveTextContent(/^QLA\s*\/\s*10C1$/);
	});

	it('shows the label seeded from the uploaded filename', async () => {
		marksheetStore().createFromParse(
			parseRun({ breakdown: { questions: [] }, filenames: ['Year 10 Chemistry.pdf'] })
		);
		openShell();

		await expect.element(breadcrumb()).toHaveTextContent(/^QLA\s*\/\s*Year 10 Chemistry$/);
	});

	it('follows the label as it is edited in place as the page heading', async () => {
		seed(parsed());
		openShellOnBreakdown();

		await page.getByLabelText('Paper label').fill('10X/Ph1 2026');

		await expect.element(breadcrumb()).toHaveTextContent(/^QLA\s*\/\s*10X\/Ph1 2026$/);
	});

	it('does not offer the label for editing from the nav', async () => {
		seed(parsed());
		openShell();

		await expect.element(breadcrumb()).toBeInTheDocument();
		expect(page.getByLabelText('Paper label').query()).toBeNull();
	});
});

describe('new upload in the nav', () => {
	it('is there whenever a document is stored', async () => {
		seed(parsed());
		openShell();

		await expect.element(page.getByRole('button', { name: 'New upload…' })).toBeInTheDocument();
	});
});

describe('the theme control', () => {
	it('offers Light, Dark and System, and applies the one chosen', async () => {
		openShell();

		await page.getByRole('radio', { name: 'Dark' }).click();

		await expect.element(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
		expect(document.documentElement.classList.contains('dark')).toBe(true);
		expect(localStorage.getItem('mode-watcher-mode')).toBe('dark');

		await page.getByRole('radio', { name: 'Light' }).click();

		expect(document.documentElement.classList.contains('dark')).toBe(false);
		expect(localStorage.getItem('mode-watcher-mode')).toBe('light');

		await page.getByRole('radio', { name: 'System' }).click();

		expect(localStorage.getItem('mode-watcher-mode')).toBe('system');
	});

	it('reads the stored preference when the app opens', async () => {
		localStorage.setItem('mode-watcher-mode', 'dark');

		openShell();

		await expect.element(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
	});

	it('survives a new upload', async () => {
		seed(parsed());
		openShell();
		await page.getByRole('radio', { name: 'Dark' }).click();

		await page.getByRole('button', { name: 'New upload…' }).click();
		await page.getByRole('button', { name: 'Delete and start again' }).click();

		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
		expect(localStorage.getItem('mode-watcher-mode')).toBe('dark');
		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/'));
	});
});
