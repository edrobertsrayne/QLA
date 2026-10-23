import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { confirmed, seed, student } from '$lib/marksheet/fixtures.spec-helpers.js';
import { captureDownload } from '$lib/marksheet/download.spec-helpers.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import { openPage } from '../spec-helpers.js';
import { twoTier } from './marksheet.spec-helpers.js';
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

	it('gives each tier its own file, with only that tier’s paper and students', async () => {
		seed(
			twoTier({
				className: '10C1',
				students: [
					student('student-1', 'Ada', 'Lovelace', false, 0),
					student('student-2', 'Grace', 'Hopper', false, 1),
					student('student-3', 'Alan', 'Turing', false, 1)
				],
				marks: {
					'student-1': { 'higher-1': 4 },
					'student-2': { 'foundation-1': 5, 'foundation-2': 3 },
					'student-3': { 'foundation-1': 2 }
				}
			})
		);
		openPage(MarksheetPage);

		let file = captureDownload();
		await page.getByRole('button', { name: 'Export Higher marks (.csv)' }).click();
		expect(file.filename()).toBe('10x-ph1-10c1-higher-marks.csv');
		const higher = await file.text();
		expect(higher).toContain('Lovelace,Ada,,4,4');
		expect(higher).toContain('Max,,,4,4');
		expect(higher).not.toContain('Hopper');
		expect(higher).not.toContain('F1');

		await page.getByRole('radio', { name: /Tier 2 · Foundation/ }).click();
		file = captureDownload();
		await page.getByRole('button', { name: 'Export Foundation marks (.csv)' }).click();
		expect(file.filename()).toBe('10x-ph1-10c1-foundation-marks.csv');
		const foundation = await file.text();
		expect(foundation).toContain('Hopper,Grace,,5,3,8');
		expect(foundation).toContain('Turing,Alan,,2,,2');
		expect(foundation).not.toContain('Lovelace');
		expect(foundation).not.toContain('H1');
		expect(marksheetStore().document?.lastExportedAt).toBeNull();
	});
});
