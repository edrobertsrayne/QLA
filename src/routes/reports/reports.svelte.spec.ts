import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { goto } from '$app/navigation';
import type { MarksheetDocument } from '$lib/marksheet/document.js';
import { confirmed, entry, seed, student } from '$lib/marksheet/fixtures.spec-helpers.js';
import { generationInputFor } from '$lib/marksheet/report-input.js';
import { openPage } from '../spec-helpers.js';
import MarksheetPage from '../marksheet/+page.svelte';
import ReportsPage from './+page.svelte';

const HOSTILE = '<img src=x onerror=window.__pwned=1> well done';

function plain(over: Partial<MarksheetDocument> = {}): MarksheetDocument {
	const entries = [
		entry('entry-1', '1', '1', {
			marks: 4,
			summary: 'Define a term',
			specPoint: null,
			commandWord: null,
			ao: null
		}),
		entry('entry-2', '2a', '2', {
			marks: 6,
			summary: 'Explain the result',
			specPoint: null,
			commandWord: null,
			ao: null
		})
	];
	const names: [string, string, string, boolean][] = [
		['ada', 'Ada', 'Lovelace', false],
		['bo', 'Bo', 'Brown', false],
		['cy', 'Cy', 'Absent', true],
		['di', 'Di', 'Unmarked', false],
		['ed', 'Ed', 'Over', false],
		['fay', 'Fay', 'Four', false],
		['gus', 'Gus', 'Five', false],
		['hal', 'Hal', 'Six', false],
		['ivy', 'Ivy', 'Seven', false],
		['jo', 'Jo', 'Eight', false]
	];
	const marks: Record<string, Record<string, number>> = {};
	for (const [id] of names) marks[id] = { 'entry-1': 3, 'entry-2': 2 };
	delete marks['cy'];
	marks['di'] = { 'entry-1': 1 };
	marks['ed'] = { 'entry-1': 9, 'entry-2': 1 };
	return confirmed({
		breakdown: { entries, warnings: [] },
		students: names.map(([id, first, last, absent]) => student(id, first, last, absent)),
		marks,
		...over
	});
}

function stubFetch(canned: (n: number) => Response = () => ok()) {
	let inFlight = 0;
	let peak = 0;
	let n = 0;
	const stub = vi.fn(async (url: string | URL | Request) => {
		if (String(url) === '/api/models') return Response.json({ models: [] });
		inFlight += 1;
		peak = Math.max(peak, inFlight);
		await new Promise((resolve) => setTimeout(resolve, 20));
		inFlight -= 1;
		return canned(n++);
	});
	vi.stubGlobal('fetch', stub);
	return { stub, peak: () => peak };
}

function ok(strength = 'Careful working'): Response {
	return Response.json({
		strengths: [strength],
		areasForImprovement: ['Check units'],
		model: 'test/model',
		usage: {}
	});
}

afterEach(() => vi.unstubAllGlobals());

describe('reports flow', () => {
	it('offers reports from the marksheet banner', async () => {
		seed(plain());
		openPage(MarksheetPage);

		await expect
			.element(page.getByText('7 of 10 students are fully marked and can have a report'))
			.toBeInTheDocument();
		await page.getByRole('button', { name: 'Make reports' }).click();
		expect(goto).toHaveBeenCalledWith('/reports');
	});

	it('goes from Who gets one through Writing to a page per student', async () => {
		seed(plain());
		const { peak } = stubFetch();
		openPage(ReportsPage);

		await expect
			.element(page.getByRole('heading', { name: '7 students get a report' }))
			.toBeInTheDocument();
		await expect.element(page.getByText('Absent', { exact: true })).toBeInTheDocument();
		await expect.element(page.getByText('1 unmarked (2a)')).toBeInTheDocument();
		await expect.element(page.getByText('Mark over max on (1)')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Write 7 reports' }).click();

		await vi.waitFor(() => expect(document.querySelectorAll('.report-sheet').length).toBe(14));
		await expect.element(page.getByRole('button', { name: 'Print all 7' })).toBeInTheDocument();
		expect(peak()).toBeLessThanOrEqual(5);
		expect(peak()).toBeGreaterThan(1);

		const sheet = document.querySelector('main [data-report-id="ada"]');
		expect(sheet?.textContent).toContain('Ada Lovelace');
		expect(sheet?.textContent).toContain('5/10');
		expect(sheet?.textContent).toContain('50%');
		expect(sheet?.textContent).toContain('Careful working');
	});

	it('stays on Writing and names a failure, keeping the finished reports', async () => {
		seed(plain());
		stubFetch((n) =>
			n === 0
				? Response.json(
						{ error: { code: 'MODEL_UPSTREAM', message: 'Model fell over' } },
						{ status: 502 }
					)
				: ok()
		);
		openPage(ReportsPage);

		await page.getByRole('button', { name: 'Write 7 reports' }).click();

		await expect.element(page.getByText('Model fell over')).toBeInTheDocument();
		await expect.element(page.getByRole('heading', { name: 'Wrote 7 of 7' })).toBeInTheDocument();
		expect(document.querySelectorAll('[data-tile-for]').length).toBe(7);
	});

	it('stops the run with one banner when the key is missing', async () => {
		seed(plain());
		stubFetch(() =>
			Response.json(
				{ error: { code: 'MISSING_API_KEY', message: 'No API key set' } },
				{ status: 500 }
			)
		);
		openPage(ReportsPage);

		await page.getByRole('button', { name: 'Write 7 reports' }).click();

		await expect.element(page.getByRole('alert')).toHaveTextContent('No API key set');
		expect(document.querySelectorAll('[role="alert"]').length).toBe(1);
	});

	it('reopens on Review after a reload, prints written reports only, and shows hostile prose as text', async () => {
		const doc = plain();
		doc.reports = {};
		for (const id of ['ada', 'bo']) {
			const input = generationInputFor(doc, id);
			if (!input) throw new Error('fixture');
			doc.reports[id] = {
				strengths: [HOSTILE],
				areasForImprovement: [],
				edit: null,
				input,
				model: 'test/model',
				generatedAt: '2026-01-01T10:00:00.000Z'
			};
		}
		seed(doc);

		openPage(MarksheetPage);
		await expect.element(page.getByText('2 reports written for this paper')).toBeInTheDocument();
		await page.getByRole('button', { name: 'Open reports' }).click();
		expect(goto).toHaveBeenCalledWith('/reports');

		stubFetch();
		openPage(ReportsPage);
		await expect.element(page.getByRole('button', { name: 'Print all 2' })).toBeInTheDocument();
		expect(document.querySelector('img')).toBeNull();
		await expect.element(page.getByText(HOSTILE).first()).toBeInTheDocument();
		await expect.element(page.getByText('Not written').first()).toBeInTheDocument();

		const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
		await page.getByRole('button', { name: 'Print all 2' }).click();
		const root = document.querySelector('[data-testid="print-root"]');
		expect(
			[...(root?.querySelectorAll('[data-report-id]') ?? [])].map((n) =>
				n.getAttribute('data-report-id')
			)
		).toEqual(['ada', 'bo']);
		expect(print).toHaveBeenCalledTimes(1);

		await page.getByRole('button', { name: 'Print this page' }).nth(1).click();
		const again = document.querySelector('[data-testid="print-root"]');
		expect(
			[...(again?.querySelectorAll('[data-report-id]') ?? [])].map((n) =>
				n.getAttribute('data-report-id')
			)
		).toEqual(['bo']);
	});
});
