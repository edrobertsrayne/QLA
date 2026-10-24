import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { cleanup } from 'vitest-browser-svelte';
import { goto } from '$app/navigation';
import { readSeeded, seed } from '$lib/marksheet/fixtures.spec-helpers.js';
import { generationInputFor } from '$lib/marksheet/report-input.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import { openPage } from '../spec-helpers.js';
import MarksheetPage from '../marksheet/+page.svelte';
import {
	HOSTILE,
	plain,
	solo,
	namedTwoTiers,
	stubFetch,
	reportCalls,
	retryable,
	ok,
	skipGrades,
	hasButton,
	readyTiles,
	failedTiles,
	writeFor,
	posted,
	openReports
} from './reports.spec-helpers.js';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

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
		await openReports();
		await skipGrades();

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
		expect(sheet?.querySelector('textarea')?.value).toContain('Careful working');
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
		await openReports();
		await skipGrades();

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
		await openReports();
		await skipGrades();

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
		await openReports();
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

	it('retries a retryable failure, waiting out retryAfter, and ends Ready on Review', async () => {
		seed(solo());
		let firstAt = 0;
		let secondAt = 0;
		const { stub } = stubFetch((n) => {
			if (n === 0) {
				firstAt = Date.now();
				return Response.json(
					{ error: { code: 'MODEL_RETRYABLE', message: 'Busy', retryable: true, retryAfter: 1 } },
					{ status: 502 }
				);
			}
			secondAt = Date.now();
			return ok();
		});
		await openReports();
		await skipGrades();

		await page.getByRole('button', { name: 'Write 1 report' }).click();

		await expect.element(page.getByRole('button', { name: 'Print all 1' })).toBeInTheDocument();
		expect(reportCalls(stub)).toBe(2);
		expect(secondAt - firstAt).toBeGreaterThanOrEqual(900);
	});

	it('keeps the other failed tile when a per-tile Retry succeeds', async () => {
		seed(plain());
		// The first five students go through; the last two dequeued burn all three tries.
		const { stub } = stubFetch((n) => (n >= 5 && n < 11 ? retryable() : ok()));
		await openReports();
		await skipGrades();

		await page.getByRole('button', { name: 'Write 7 reports' }).click();

		await vi.waitFor(() => expect(reportCalls(stub)).toBe(11), { timeout: 15000 });
		await vi.waitFor(() => expect(failedTiles()).toHaveLength(2), { timeout: 5000 });
		await vi.waitFor(() => expect(hasButton('Retry failed')).toBe(true), { timeout: 5000 });
		// Dequeued last, yet listed first: failures sit above every other tile.
		expect([...document.querySelectorAll('[data-tile-for]')].slice(0, 2)).toEqual(failedTiles());

		// Retrying one keeps the other's failure on screen, and holds Review back.
		await page.getByRole('button', { name: 'Retry', exact: true }).first().click();

		await vi.waitFor(() => expect(reportCalls(stub)).toBe(12), { timeout: 5000 });
		await vi.waitFor(() => expect(failedTiles()).toHaveLength(1), { timeout: 5000 });
		await expect.element(page.getByRole('button', { name: 'Review 6' })).toBeInTheDocument();
		expect(hasButton('Print all 6')).toBe(false);
	});

	it('fails a non-retryable answer at once, stays for Retry failed, then advances on success', async () => {
		seed(solo());
		const { stub } = stubFetch((n) =>
			n === 0
				? Response.json(
						{
							error: {
								code: 'INVALID_REPORT_INPUT',
								message: 'Bad entry',
								retryable: false,
								field: 'entries[0].gained'
							}
						},
						{ status: 400 }
					)
				: ok()
		);
		await openReports();
		await skipGrades();

		await page.getByRole('button', { name: 'Write 1 report' }).click();

		await vi.waitFor(() => expect(failedTiles()).toHaveLength(1), { timeout: 5000 });
		await vi.waitFor(() => expect(hasButton('Retry failed')).toBe(true), { timeout: 5000 });
		await expect.element(page.getByRole('button', { name: 'Review 0' })).toBeInTheDocument();
		await new Promise((resolve) => setTimeout(resolve, 1200));
		expect(reportCalls(stub)).toBe(1);

		await page.getByRole('button', { name: 'Retry failed' }).click();

		await expect.element(page.getByRole('button', { name: 'Print all 1' })).toBeInTheDocument();
		expect(reportCalls(stub)).toBe(2);
	});

	it('stops the whole run on a 401 with one banner and no further requests', async () => {
		seed(plain());
		const { stub } = stubFetch(() =>
			Response.json({ error: { code: 'MODEL_AUTH', message: 'Bad key' } }, { status: 500 })
		);
		await openReports();
		await skipGrades();

		await page.getByRole('button', { name: 'Write 7 reports' }).click();

		await expect.element(page.getByRole('alert')).toHaveTextContent('Bad key');
		expect(document.querySelectorAll('[role="alert"]')).toHaveLength(1);
		await vi.waitFor(() => expect(reportCalls(stub)).toBe(5), { timeout: 5000 });
		await new Promise((resolve) => setTimeout(resolve, 400));
		expect(reportCalls(stub)).toBe(5);
		await expect.element(page.getByText('Queued').first()).toBeInTheDocument();
	});

	it('keeps finished reports across Stop, and they persist', async () => {
		seed(plain());
		stubFetch((n, init) => {
			if (n < 2) return ok();
			return new Promise((resolve, reject) => {
				const timer = setTimeout(() => resolve(ok()), 3000);
				init?.signal?.addEventListener(
					'abort',
					() => {
						clearTimeout(timer);
						reject(new DOMException('The run was stopped.', 'AbortError'));
					},
					{ once: true }
				);
			});
		});
		await openReports();
		await skipGrades();

		await page.getByRole('button', { name: 'Write 7 reports' }).click();

		await vi.waitFor(() => expect(readyTiles()).toBe(2), { timeout: 5000 });
		await page.getByRole('button', { name: 'Stop' }).click();
		await vi.waitFor(() => expect(hasButton('Stop')).toBe(false), { timeout: 5000 });

		expect(readyTiles()).toBe(2);
		await expect.element(page.getByRole('heading', { name: 'Wrote 2 of 7' })).toBeInTheDocument();
		await vi.waitFor(() => expect(Object.keys(readSeeded().reports)).toHaveLength(2), {
			timeout: 5000
		});
	});

	it('offers Write N more once a further student is marked, and writes only them', async () => {
		const doc = plain();
		for (const id of ['ada', 'bo', 'fay', 'gus', 'hal', 'ivy', 'jo']) {
			const input = generationInputFor(doc, id);
			if (!input) throw new Error(`no input for ${id}`);
			doc.reports[id] = {
				strengths: ['Careful working'],
				areasForImprovement: [],
				edit: null,
				input,
				model: 'test/model',
				generatedAt: '2026-01-01T10:00:00.000Z'
			};
		}
		seed(doc);
		const { stub } = stubFetch();
		await openReports();

		await expect.element(page.getByRole('button', { name: 'Print all 7' })).toBeInTheDocument();
		expect(hasButton('Write 1 more')).toBe(false);

		// Di was unmarked; finishing her marking makes her newly eligible.
		marksheetStore().setMark('di', 'entry-2', 2);
		await vi.waitFor(() => expect(hasButton('Write 1 more')).toBe(true), { timeout: 5000 });

		await page.getByRole('button', { name: 'Write 1 more' }).click();

		await expect.element(page.getByRole('button', { name: 'Print all 8' })).toBeInTheDocument();
		expect(reportCalls(stub)).toBe(1);
	});
});

describe('review fixes', () => {
	it('Who gets one writes only students without a report and keeps edits', async () => {
		const doc = plain();
		// Ada's marks are the only ones that gain 4 on the first entry.
		doc.marks['ada'] = { 'entry-1': 4, 'entry-2': 6 };
		writeFor(doc, ['ada']);
		doc.reports['ada'].edit = { strengths: ['Teacher wording'], areasForImprovement: ['Mine'] };
		seed(doc);
		const { stub } = stubFetch();
		await openReports();

		await expect.element(page.getByRole('button', { name: 'Print all 1' })).toBeInTheDocument();
		await page.getByRole('button', { name: /Who gets one/ }).click();
		await expect
			.element(page.getByRole('heading', { name: '7 students get a report' }))
			.toBeInTheDocument();
		await page.getByRole('button', { name: 'Write 6 reports' }).click();

		await expect.element(page.getByRole('button', { name: 'Print all 7' })).toBeInTheDocument();
		const bodies = posted(stub);
		expect(bodies).toHaveLength(6);
		for (const body of bodies) expect(body.entries[0].gained).not.toBe(4);
		expect(marksheetStore().document?.reports['ada'].edit).not.toBeNull();
	});

	it('Who gets one offers nothing to write once every eligible student has a report', async () => {
		const doc = plain();
		writeFor(doc, ['ada', 'bo', 'fay', 'gus', 'hal', 'ivy', 'jo']);
		seed(doc);
		stubFetch();
		await openReports();

		await expect.element(page.getByRole('button', { name: 'Print all 7' })).toBeInTheDocument();
		await page.getByRole('button', { name: /Who gets one/ }).click();

		await expect.element(page.getByRole('button', { name: 'Write 0 reports' })).toBeDisabled();
		await expect.element(page.getByText(/Every student here has a report/)).toBeInTheDocument();
	});
});

describe('students without a tier', () => {
	it('blocks a no-tier student from reports, names the reason, and writes only the rest', async () => {
		seed(namedTwoTiers());
		const { stub } = stubFetch();
		await openReports('/reports/who');

		await expect
			.element(page.getByRole('heading', { name: '2 students get a report' }))
			.toBeInTheDocument();
		const blocked = document.body.textContent ?? '';
		expect(blocked).toContain('Nora Nought');
		expect(blocked).toContain('No tier set');

		await page.getByRole('button', { name: 'Write 2 reports' }).click();
		await expect.element(page.getByRole('button', { name: 'Print all 2' })).toBeInTheDocument();
		expect(posted(stub)).toHaveLength(2);
		expect(JSON.stringify(posted(stub))).not.toContain('Nora');

		// The Review rail says why she has no page.
		const rail = document.querySelector('aside');
		expect(rail?.textContent).toContain('Nora Nought');
		expect(rail?.textContent).toContain('Blocked (No tier set)');
	});
});
