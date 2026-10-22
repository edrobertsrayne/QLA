import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { cleanup } from 'vitest-browser-svelte';
import type { MarksheetDocument } from '$lib/marksheet/document.js';
import { confirmed, entry, seed, student } from '$lib/marksheet/fixtures.spec-helpers.js';
import { generationInputFor } from '$lib/marksheet/report-input.js';
import { openPage } from '../spec-helpers.js';
import ReportsPage from './+page.svelte';
import { stubFetch } from './reports.spec-helpers.js';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('one-page fit', () => {
	/**
	 * One eligible student with a written report on a 26-entry paper: full
	 * enough figures that a ~300-word edit shrinks and a ~370-word edit flags,
	 * the ticket's calibration.
	 */
	function fitting(): MarksheetDocument {
		const entries = Array.from({ length: 26 }, (_, i) =>
			entry(`entry-${i}`, `${i + 1}`, `${i + 1}`, {
				marks: 4,
				summary: 'Explain the result in detail',
				specPoint: null,
				commandWord: null,
				ao: null
			})
		);
		const marks: Record<string, number> = {};
		for (const candidate of entries) marks[candidate.id] = 3;
		const doc = confirmed({
			breakdown: { entries, warnings: [], aoDescriptions: {} },
			students: [student('ada', 'Ada', 'Lovelace')],
			marks: { ada: marks }
		});
		return writtenOn(doc, ['Careful working'], ['Check units']);
	}

	/** The document with Ada's generated prose stored and no teacher edit. */
	function writtenOn(
		doc: MarksheetDocument,
		strengths: string[],
		areas: string[]
	): MarksheetDocument {
		const input = generationInputFor(doc, 'ada');
		if (!input) throw new Error('no generation input for ada');
		doc.reports = {
			ada: {
				strengths,
				areasForImprovement: areas,
				edit: null,
				input,
				model: 'test/model',
				generatedAt: '2026-01-01T10:00:00.000Z'
			}
		};
		return doc;
	}

	/** Teacher-length prose: a realistic sentence repeated to n words. */
	function proseWords(n: number): string {
		const words =
			'Revise the energy transfers topic using past questions and check each answer carefully.'.split(
				' '
			);
		const out: string[] = [];
		while (out.length < n) out.push(...words);
		return out.slice(0, n).join(' ');
	}

	it('shrinks a long edit without a flag, and flags an over-long one with its mm over', async () => {
		seed(fitting());
		stubFetch();
		openPage(ReportsPage);

		await expect.element(page.getByRole('button', { name: 'Print all 1' })).toBeInTheDocument();
		await page.getByLabelText('Area for improvement 1 for Ada Lovelace').fill(proseWords(300));
		await page.getByLabelText('Strength 1 for Ada Lovelace').click();
		expect(document.querySelector('[data-page-for="ada"]')?.textContent).not.toMatch(/mm over/);

		await page.getByLabelText('Area for improvement 1 for Ada Lovelace').fill(proseWords(370));
		await page.getByLabelText('Strength 1 for Ada Lovelace').click();
		// Past 90% the page flags how far over it runs.
		await expect.element(page.getByText(/mm over the page/, { exact: false })).toBeInTheDocument();
	});

	it('fits generated feedback for a 44-entry, 10-topic paper at 100%', async () => {
		// The layout prototype's sample shape, rebuilt as rows: 44 entries over
		// 9 questions, 10 topic codes plus skills. Summaries render truncated to
		// one fixed-height line and roll-up rows are fixed height too, so the
		// wording of names and summaries cannot change the layout pressure —
		// only the counts can, and those match the sample.
		const codes = [
			'4.1.1',
			'4.1.2',
			'4.2.1',
			'4.2.2',
			'4.2.3',
			'4.3.1',
			'4.3.2',
			'4.3.3',
			'4.4.1',
			'4.4.2'
		];
		const entries = Array.from({ length: 44 }, (_, i) =>
			entry(`entry-${i}`, `Q${i + 1}`, `${(i % 9) + 1}`, {
				marks: 3,
				summary: 'Explain the result and show each step of your working',
				specPoint: codes[i % codes.length],
				commandWord: null,
				ao: (['AO1', 'AO2', 'AO3'] as const)[i % 3]
			})
		);
		const topicNames: Record<string, string> = {};
		for (const code of codes) topicNames[code] = `Topic ${code}`;
		const marks: Record<string, number> = {};
		for (const candidate of entries) marks[candidate.id] = 2;
		const doc = confirmed({
			breakdown: { entries, warnings: [], aoDescriptions: {} },
			students: [student('ada', 'Ada', 'Lovelace')],
			marks: { ada: marks },
			topicNames
		});
		// Generated-length feedback in the prototype sample's own shape: three
		// one-sentence strengths, two two-sentence areas with revision actions.
		writtenOn(
			doc,
			[
				'Your calculations were set out clearly, with the equation, substitution and unit every time.',
				'You explained circuits confidently, linking current, potential difference and resistance correctly.',
				'Your evaluation of the practical results used the data to support each point you made.'
			],
			[
				'Half-life questions need you to read values carefully from the graph and count each half-life step. Practise three half-life graph questions, writing down every reading before you calculate.',
				'The six-mark heating curve answer needed each flat section linked to particles and energy. Plan a six-mark answer as a bullet list first, then check every point mentions the particles.'
			]
		);
		seed(doc);
		stubFetch();
		openPage(ReportsPage);

		await expect.element(page.getByRole('button', { name: 'Print all 1' })).toBeInTheDocument();
		await vi.waitFor(
			() => expect(document.querySelector('main [data-report-id="ada"]')).not.toBeNull(),
			{ timeout: 5000 }
		);
		await new Promise((resolve) => setTimeout(resolve, 500));
		const strip = document.querySelector('[data-page-for="ada"]')?.textContent ?? '';
		expect(strip).not.toMatch(/mm over/);
	});

	it('asks first when Print all would print a flagged page', async () => {
		seed(fitting());
		stubFetch();
		const shown = openPage(ReportsPage);

		await expect.element(page.getByRole('button', { name: 'Print all 1' })).toBeInTheDocument();
		await page.getByLabelText('Area for improvement 1 for Ada Lovelace').fill(proseWords(370));
		await page.getByLabelText('Strength 1 for Ada Lovelace').click();
		await expect.element(page.getByText(/mm over the page/, { exact: false })).toBeInTheDocument();

		const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
		await page.getByRole('button', { name: 'Print all 1' }).click();
		const dialog = page.getByRole('dialog', { name: 'Overflowing reports' });
		await expect.element(dialog).toBeInTheDocument();
		expect(print).not.toHaveBeenCalled();

		await dialog.getByRole('button', { name: 'Print anyway' }).click();
		expect(print).toHaveBeenCalledTimes(1);
		print.mockRestore();
		await shown.unmount();
	});
});
