import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { confirmed, seed, student } from '$lib/marksheet/fixtures.spec-helpers.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import { openPage } from '../spec-helpers.js';
import { rowNames, twoTier } from './marksheet.spec-helpers.js';
import MarksheetPage from './+page.svelte';

function csvFile(text: string): File {
	return new File([text], 'class.csv', { type: 'text/csv' });
}

describe('uploading a class list', () => {
	it('starts the class from the empty-class panel, skipping the header row', async () => {
		seed(confirmed());
		const screen = openPage(MarksheetPage);

		await page.getByRole('button', { name: 'Upload CSV' }).last().click();
		await page
			.getByLabelText('CSV file')
			.upload(csvFile('First name,Last name\r\n"Mary Ann",Evans\r\nGrace,Hopper\r\n'));
		await page.getByRole('button', { name: 'Add 2 students' }).click();

		expect(rowNames(screen)).toEqual(['Mary Ann Evans', 'Grace Hopper']);
	});

	it('reads row 1 as a student when the header box is unticked', async () => {
		seed(confirmed());
		const screen = openPage(MarksheetPage);

		await page.getByRole('button', { name: 'Upload CSV' }).last().click();
		await page.getByLabelText('CSV file').upload(csvFile('First name,Last name\nAda,Lovelace'));
		await expect.element(page.getByRole('button', { name: 'Add 1 student' })).toBeInTheDocument();
		await page.getByLabelText('First row is a header').click();
		await expect.element(page.getByRole('button', { name: 'Add 2 students' })).toBeInTheDocument();
		await expect
			.element(page.getByTestId('csv-preview').getByText('First name', { exact: true }).nth(1))
			.toBeInTheDocument();
		await page.getByRole('button', { name: 'Add 2 students' }).click();

		expect(rowNames(screen)).toEqual(['First name Last name', 'Ada Lovelace']);
	});

	it('adds to the end of a class from the toolbar, counting duplicates and undoing as one step', async () => {
		seed(confirmed({ students: [student('student-1', 'Ada', 'Lovelace')] }));
		const screen = openPage(MarksheetPage);

		await page.getByRole('button', { name: 'Upload CSV' }).first().click();
		await page
			.getByLabelText('CSV file')
			.upload(csvFile('first,last\nada,LOVELACE\nGrace,Hopper\nGRACE,hopper\nCher,'));
		await page.getByRole('button', { name: 'Add 2 students' }).click();

		expect(rowNames(screen)).toEqual(['Ada Lovelace', 'Grace Hopper', 'Cher']);
		await expect
			.element(page.getByTestId('paste-notice'))
			.toHaveTextContent('Added 2 students, skipped 2 duplicates.');

		await page.getByTestId('paste-notice').getByRole('button', { name: 'Undo' }).click();
		expect(rowNames(screen)).toEqual(['Ada Lovelace']);
	});

	it('uploads onto the open tier on a two-tier assessment', async () => {
		seed(
			twoTier({
				students: [student('student-1', 'Ada', 'Lovelace', false, 0)]
			})
		);
		const screen = openPage(MarksheetPage);

		await page.getByRole('button', { name: 'Upload CSV' }).first().click();
		await page.getByLabelText('CSV file').upload(csvFile('First name,Last name\nGrace,Hopper\n'));
		await page.getByRole('button', { name: 'Add 1 student' }).click();

		await vi.waitFor(() => expect(marksheetStore().document?.students[1].tier).toBe(0));
		expect(rowNames(screen)).toEqual(['Ada Lovelace', 'Grace Hopper']);
	});

	it('rejects a file whole, naming the first bad row, and changes nothing', async () => {
		seed(confirmed({ students: [student('student-1', 'Ada', 'Lovelace')] }));
		const screen = openPage(MarksheetPage);

		await page.getByRole('button', { name: 'Upload CSV' }).first().click();
		await page.getByLabelText('CSV file').upload(csvFile('h,h\nGrace,Hopper\nA,B,C'));

		await expect
			.element(page.getByTestId('csv-error'))
			.toHaveTextContent('Row 3 has 3 columns; expected first name, last name.');
		await expect
			.element(page.getByRole('dialog').getByRole('button', { name: /^Add / }))
			.toBeDisabled();
		expect(rowNames(screen)).toEqual(['Ada Lovelace']);
	});

	it('keeps the second file when the first finishes reading last', async () => {
		seed(confirmed());
		openPage(MarksheetPage);

		await page.getByRole('button', { name: 'Upload CSV' }).last().click();
		const input = page.getByLabelText('CSV file').element() as HTMLInputElement;
		const firstRead = Promise.withResolvers<ArrayBuffer>();
		const first = csvFile('h,h\nSlow,Reader');
		const firstBytes = await first.arrayBuffer();
		first.arrayBuffer = () => firstRead.promise;
		const pick = (chosen: File): void => {
			const transfer = new DataTransfer();
			transfer.items.add(chosen);
			input.files = transfer.files;
			input.dispatchEvent(new Event('change', { bubbles: true }));
		};

		pick(first);
		pick(csvFile('h,h\nFast,Reader'));
		await expect.element(page.getByRole('button', { name: 'Add 1 student' })).toBeInTheDocument();
		firstRead.resolve(firstBytes);
		const settled = Promise.withResolvers<void>();
		setTimeout(settled.resolve, 50);
		await settled.promise;

		await expect.element(page.getByTestId('csv-preview').getByText('Fast')).toBeInTheDocument();
		expect(page.getByTestId('csv-preview').getByText('Slow').elements()).toHaveLength(0);
	});
});
