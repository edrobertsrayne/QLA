import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import {
	CORRUPT_KEY_PREFIX,
	DOCUMENT_SCHEMA_VERSION,
	STORAGE_KEY
} from '$lib/marksheet/document.js';
import { parseRun } from '$lib/marksheet/fixtures.spec-helpers.js';
import { captureDownload } from '$lib/marksheet/download.spec-helpers.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import UploadPage from './+page.svelte';

/** A document this version cannot read: written by a newer one. */
const UNREADABLE = JSON.stringify({
	schemaVersion: DOCUMENT_SCHEMA_VERSION + 1,
	paper: { label: '10X Ph1' }
});

function preservedKeys(): string[] {
	return Object.keys(localStorage).filter((key) => key.startsWith(CORRUPT_KEY_PREFIX));
}

beforeEach(() => {
	vi.restoreAllMocks();
});

describe('an unreadable stored document', () => {
	it('boots to upload, keeps the copy, and offers its raw text out', async () => {
		localStorage.setItem(STORAGE_KEY, UNREADABLE);

		marksheetStore().load();
		render(UploadPage);

		await expect
			.element(page.getByText('Your stored marksheet could not be read'))
			.toBeInTheDocument();
		// The upload surface is intact underneath: the teacher can parse again.
		await expect
			.element(page.getByRole('heading', { name: 'Parse assessment paper' }))
			.toBeInTheDocument();
		// Kept, never deleted, under its own key.
		const preserved = preservedKeys();
		expect(preserved).toHaveLength(1);
		expect(localStorage.getItem(preserved[0])).toBe(UNREADABLE);
		expect(localStorage.getItem(STORAGE_KEY)).toBe(UNREADABLE);

		const file = captureDownload();
		await page.getByRole('button', { name: 'Download the raw text' }).click();

		expect(file.filename()).toMatch(/^qla-corrupt-.*\.json$/);
		expect(await file.text()).toBe(UNREADABLE);
	});

	it('drops the alert once a document is stored again', async () => {
		localStorage.setItem(STORAGE_KEY, UNREADABLE);

		marksheetStore().load();
		render(UploadPage);
		await expect.element(page.getByTestId('corrupt-alert')).toBeInTheDocument();

		marksheetStore().createFromAssessment(parseRun());

		await expect.element(page.getByTestId('corrupt-alert')).not.toBeInTheDocument();
	});
});
