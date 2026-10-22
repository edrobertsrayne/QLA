import { describe, expect, it } from 'vitest';
import { solo } from '../../../routes/reports/reports.spec-helpers.js';
import { downloadReports } from './report-pdf.js';

const NOW = new Date(2026, 0, 1, 10, 0);

/** A print root holding the page for `id`, as PrintRoot renders it. */
function printRootWith(...ids: string[]): HTMLElement {
	const root = document.createElement('div');
	for (const id of ids) {
		const page = document.createElement('div');
		page.className = 'print-page';
		page.innerHTML = `<section data-report-id="${id}"></section>`;
		root.append(page);
	}
	return root;
}

describe('downloadReports', () => {
	it('throws for a student who is not on the marksheet', async () => {
		await expect(
			downloadReports(printRootWith('ghost'), solo(), { kind: 'page', id: 'ghost' }, NOW)
		).rejects.toThrow('No student ghost');
		await expect(
			downloadReports(printRootWith('ghost'), solo(), { kind: 'zip', ids: ['ghost'] }, NOW)
		).rejects.toThrow('No student ghost');
	});

	it('throws for a student with no page in the print root', async () => {
		await expect(
			downloadReports(printRootWith(), solo(), { kind: 'one', ids: ['ada'] }, NOW)
		).rejects.toThrow('No report page for student ada');
		await expect(
			downloadReports(printRootWith(), solo(), { kind: 'page', id: 'ada' }, NOW)
		).rejects.toThrow('No report page for student ada');
	});
});
