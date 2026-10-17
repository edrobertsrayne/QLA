import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { DOCUMENT_SCHEMA_VERSION, STORAGE_KEY } from '$lib/marksheet/document.js';
import type { MarksheetDocument } from '$lib/marksheet/document.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import { load as breakdownLoad } from './+page.js';
import BreakdownPage from './+page.svelte';

const goto = vi.hoisted(() => vi.fn());

vi.mock('$app/navigation', () => ({ goto }));

const NOW = '2026-01-01T10:00:00.000Z';

function parsedDocument(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
	return {
		schemaVersion: DOCUMENT_SCHEMA_VERSION,
		createdAt: NOW,
		updatedAt: NOW,
		breakdownConfirmedAt: null,
		lastExportedAt: null,
		paper: {
			label: '10X Ph1',
			className: null,
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
					summary: 'Describe the rate change',
					specPoint: '3.2.1.4',
					commandWord: 'Describe',
					ao: 'AO2'
				}
			],
			warnings: [
				{ questionId: 'entry-1', code: 'SUMMARY_LENGTH', message: 'Not 3–8 words.' },
				{ questionId: null, code: 'SPEC_UNREADABLE', message: 'Specification could not be read.' }
			]
		},
		students: [],
		marks: {},
		...overrides
	};
}

beforeEach(() => {
	localStorage.clear();
	goto.mockClear();
});

/** The route's load guard reads storage before the page renders. */
function openBreakdownPage() {
	breakdownLoad();
	return render(BreakdownPage);
}

describe('breakdown page', () => {
	it('shows the stored breakdown, its warnings and no run cost after a reload', async () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(parsedDocument()));

		const screen = openBreakdownPage();

		await expect.element(page.getByText('Describe the rate change')).toBeInTheDocument();
		await expect.element(page.getByLabelText('Paper label')).toHaveValue('10X Ph1');
		await expect.element(page.getByRole('cell', { name: '3.2.1.4' })).toBeInTheDocument();
		await expect
			.element(page.getByText(/SUMMARY_LENGTH \(2bii\): Not 3–8 words\./))
			.toBeInTheDocument();
		await expect
			.element(page.getByText(/SPEC_UNREADABLE: Specification could not be read\./))
			.toBeInTheDocument();
		await expect.element(page.getByRole('cell', { name: '2bii' })).toBeInTheDocument();
		expect(screen.container.textContent).not.toContain('this run');
	});

	it('shows this run usage once a parse has run in this tab', async () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(parsedDocument()));
		openBreakdownPage();

		marksheetStore().createFromParse({
			breakdown: {
				questions: [
					{
						id: '2bii',
						questionNumber: '2',
						marks: 4,
						summary: 'Describe the rate change',
						specPoint: '3.2.1.4',
						commandWord: 'Describe',
						ao: 'AO2'
					}
				]
			},
			warnings: [],
			usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, estCost: 0.001 },
			filenames: ['10X Ph1.pdf']
		});

		await expect.element(page.getByText(/this run: 30 tokens · \$0\.0010/)).toBeInTheDocument();
	});

	it('renames the paper in place and autosaves it', async () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(parsedDocument()));
		openBreakdownPage();

		await page.getByLabelText('Paper label').fill('10X/Ph1 2026');

		await vi.waitFor(() => {
			const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as MarksheetDocument;
			expect(stored.paper.label).toBe('10X/Ph1 2026');
			expect(stored.updatedAt).not.toBe(NOW);
		});
	});

	it('wipes only the marksheet document and returns to upload', async () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(parsedDocument()));
		localStorage.setItem('qla:theme', 'dark');

		openBreakdownPage();
		await page.getByRole('button', { name: 'New upload…' }).click();
		await page.getByRole('button', { name: 'Delete and start again' }).click();

		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
		expect(localStorage.getItem('qla:theme')).toBe('dark');
		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/'));
	});

	it('keeps working when the new-upload dialog is dismissed', async () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(parsedDocument()));

		openBreakdownPage();
		await page.getByRole('button', { name: 'New upload…' }).click();
		await page.getByRole('button', { name: 'Keep working' }).click();

		expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
		expect(goto).not.toHaveBeenCalled();
	});
});
