import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { STORAGE_KEY } from '$lib/marksheet/document.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import type { MarksheetDocument } from '$lib/marksheet/document.js';
import Page from './+page.svelte';

function pdfFile(): File {
	return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])], 'paper.pdf', {
		type: 'application/pdf'
	});
}

function stubFetch(parseBody: unknown, parseStatus = 200) {
	return vi.fn(async (input: string | URL | Request) => {
		const url = typeof input === 'string' ? input : input.toString();
		if (url.includes('/api/models')) {
			return new Response(JSON.stringify({ models: [] }), { status: 200 });
		}
		if (url.includes('/api/parse')) {
			return new Response(JSON.stringify(parseBody), { status: parseStatus });
		}
		throw new Error(`unexpected fetch: ${url}`);
	});
}

const parsedRun = {
	breakdown: {
		questions: [
			{
				id: '1a',
				questionNumber: '1',
				marks: 2,
				summary: 'Explain the process shown',
				specPoint: null,
				commandWord: 'Explain',
				ao: 'AO1'
			}
		]
	},
	warnings: [{ questionId: '1a', code: 'SUMMARY_LENGTH', message: 'Not 3–8 words.' }],
	usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, estCost: 0.001 }
};

describe('+page.svelte run handler', () => {
	beforeEach(() => {
		marksheetStore().wipe();
		localStorage.clear();
		vi.stubGlobal(
			'fetch',
			stubFetch({
				breakdown: [],
				warnings: [],
				usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estCost: 0 }
			})
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('shows a fatal error naming malformed model output instead of crashing', async () => {
		render(Page);

		await page.getByLabelText('Assessment paper (PDF)').upload(pdfFile());
		await page.getByRole('button', { name: 'Run' }).click();

		await expect
			.element(page.getByTestId('fatal-panel'))
			.toHaveTextContent('MALFORMED_MODEL_OUTPUT');
		await expect.element(page.getByRole('button', { name: 'Run' })).toBeInTheDocument();
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	it('stores the parsed breakdown and offers the move in one click', async () => {
		vi.stubGlobal('fetch', stubFetch(parsedRun));

		render(Page);

		await page.getByLabelText('Assessment paper (PDF)').upload(pdfFile());
		await page.getByRole('button', { name: 'Run' }).click();

		await expect
			.element(page.getByRole('link', { name: 'Open breakdown' }))
			.toHaveAttribute('href', '/breakdown');
		await expect.element(page.getByTestId('fatal-panel')).not.toBeInTheDocument();
		// A stored breakdown must be replaced through New upload, not by running again.
		await expect.element(page.getByRole('button', { name: 'Run' })).toBeDisabled();

		const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as MarksheetDocument;
		expect(stored.breakdownConfirmedAt).toBeNull();
		expect(stored.paper.sourceFilenames).toEqual(['paper.pdf']);
		expect(stored.paper.label).toBe('paper');
		expect(stored.breakdown.entries.map((entry) => entry.label)).toEqual(['1a']);
		expect(stored.breakdown.entries[0].id).not.toBe('');
		expect(stored.breakdown.warnings).toEqual([
			{
				questionId: stored.breakdown.entries[0].id,
				code: 'SUMMARY_LENGTH',
				message: 'Not 3–8 words.'
			}
		]);
		expect(localStorage.getItem(STORAGE_KEY)).not.toContain('promptTokens');
	});

	it('drops the results panel and the breakdown.json download', async () => {
		vi.stubGlobal('fetch', stubFetch(parsedRun));

		const screen = render(Page);

		await page.getByLabelText('Assessment paper (PDF)').upload(pdfFile());
		await page.getByRole('button', { name: 'Run' }).click();
		await expect.element(page.getByRole('link', { name: 'Open breakdown' })).toBeInTheDocument();

		expect(screen.container.textContent).not.toContain('breakdown.json');
		expect(screen.container.textContent).not.toContain('Explain the process shown');
		expect(page.getByRole('button', { name: /copy|download/i }).elements()).toHaveLength(0);
	});

	it('drops the stored-breakdown card when New upload wipes the store', async () => {
		vi.stubGlobal('fetch', stubFetch(parsedRun));

		render(Page);

		await page.getByLabelText('Assessment paper (PDF)').upload(pdfFile());
		await page.getByRole('button', { name: 'Run' }).click();
		await expect.element(page.getByRole('link', { name: 'Open breakdown' })).toBeVisible();

		// New upload: same route, no remount.
		marksheetStore().wipe();

		await expect
			.element(page.getByRole('link', { name: 'Open breakdown' }))
			.not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Run' })).toBeEnabled();
	});
});
