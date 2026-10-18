import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { confirmed, seed, student } from '$lib/marksheet/fixtures.spec-helpers.js';
import { captureDownload } from '$lib/marksheet/download.spec-helpers.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import { openPage } from '../spec-helpers.js';
import './marksheet.spec-helpers.js';
import MarksheetPage from './+page.svelte';

describe('marks export', () => {
	it('takes the marks into a spreadsheet, which is not a backup', async () => {
		seed(
			confirmed({
				students: [
					student('student-1', 'Ada', 'Lovelace'),
					student('student-2', 'Grace', 'Hopper', true)
				],
				marks: { 'student-1': { 'entry-1': 3 } }
			})
		);
		openPage(MarksheetPage);
		const file = captureDownload();

		await page.getByRole('button', { name: 'Export marks to spreadsheet (.csv)' }).click();

		// Named for the two files to be told apart in a Downloads folder.
		expect(file.filename()).toBe('10x-ph1-class-marks.csv');
		expect(await file.text()).toContain('Lovelace,Ada,,3,3');
		expect(await file.text()).toContain('Hopper,Grace,Y,,0');
		// A marks export cannot be restored from, so the backup stands exactly as
		// old as it was.
		expect(marksheetStore().document?.lastExportedAt).toBeNull();
	});
});
