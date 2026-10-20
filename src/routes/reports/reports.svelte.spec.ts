import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { goto } from '$app/navigation';
import type { MarksheetDocument } from '$lib/marksheet/document.js';
import {
	confirmed,
	entry,
	readSeeded,
	seed,
	student
} from '$lib/marksheet/fixtures.spec-helpers.js';
import { generationInputFor } from '$lib/marksheet/report-input.js';
import { marksheetStore } from '$lib/marksheet/index.js';
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
/**
 * Synthetic H556 variant of the 13OA class: the same marks with hand-assigned
 * 5.1.x / 5.2.x specification points — one comma-list entry counting toward
 * two codes, one slash-list entry, and entries with none (AO only).
 */
function h556(): MarksheetDocument {
	const doc = plain();
	doc.breakdown.entries = [
		entry('entry-1', '1', '1', {
			marks: 4,
			summary: 'Define the kinetic model',
			specPoint: '5.1.1, 5.1.2',
			commandWord: null,
			ao: 'AO1'
		}),
		entry('entry-2', '2a', '2', {
			marks: 6,
			summary: 'Explain gas pressure',
			specPoint: '5.1.2/5.2.1',
			commandWord: null,
			ao: 'AO2'
		}),
		entry('entry-3', '2b', '2', {
			marks: 2,
			summary: 'Show working clearly',
			specPoint: null,
			commandWord: null,
			ao: 'AO3'
		})
	];
	for (const marks of Object.values(doc.marks)) {
		marks['entry-3'] = 2;
	}
	doc.marks['di'] = { 'entry-1': 1, 'entry-3': 1 };
	doc.marks['ed'] = { 'entry-1': 9, 'entry-2': 1, 'entry-3': 0 };
	doc.topicNames = {};
	return doc;
}

type Canned = (n: number, init?: { signal?: AbortSignal | null }) => Response | Promise<Response>;

function stubFetch(canned: Canned = () => ok()) {
	let inFlight = 0;
	let peak = 0;
	let n = 0;
	const stub = vi.fn(
		async (url: string | URL | Request, init?: { signal?: AbortSignal | null }) => {
			if (String(url) === '/api/models') return Response.json({ models: [] });
			inFlight += 1;
			peak = Math.max(peak, inFlight);
			await new Promise((resolve) => setTimeout(resolve, 20));
			inFlight -= 1;
			if (init?.signal?.aborted) throw new DOMException('The run was stopped.', 'AbortError');
			return canned(n++, init);
		}
	);
	vi.stubGlobal('fetch', stub);
	return { stub, peak: () => peak };
}

/** The report calls only: everything but the model-list lookup the page makes on arrival. */
function reportCalls(stub: { mock: { calls: unknown[][] } }): number {
	return stub.mock.calls.filter(([url]) => String(url) !== '/api/models').length;
}

/** One eligible student and one absent: every report call belongs to Ada. */
function solo(): MarksheetDocument {
	const fitting = plain();
	return {
		...fitting,
		students: [student('ada', 'Ada', 'Lovelace'), student('cy', 'Cy', 'Absent', true)],
		marks: { ada: fitting.marks['ada'] }
	};
}

function retryable(message = 'The model provider is busy.'): Response {
	return Response.json(
		{ error: { code: 'MODEL_RETRYABLE', message, retryable: true } },
		{ status: 502 }
	);
}

function hasButton(name: string): boolean {
	return [...document.querySelectorAll('button')].some(
		(button) => button.textContent?.trim() === name
	);
}

function readyTiles(): number {
	return [...document.querySelectorAll('[data-tile-for]')].filter((tile) =>
		tile.textContent?.includes('Ready')
	).length;
}

function failedTiles(): Element[] {
	return [...document.querySelectorAll('[data-tile-for]')].filter(
		(tile) => tile.querySelector('.text-muted-foreground')?.textContent === 'Failed'
	);
}

function ok(strength = 'Careful working'): Response {
	return Response.json({
		strengths: [strength],
		areasForImprovement: ['Check units'],
		model: 'test/model',
		usage: {}
	});
}
function topicNames(names: Record<string, string> = {}): Response {
	const entries = {
		'5.1.1': 'Kinetic theory of gases',
		'5.1.2': 'Gas pressure and temperature',
		'5.2.1': 'Internal energy stores',
		...names
	};
	return Response.json({ names: entries, model: 'test/model', usage: {} });
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
		openPage(ReportsPage);

		await page.getByRole('button', { name: 'Write 1 report' }).click();

		await expect.element(page.getByRole('button', { name: 'Print all 1' })).toBeInTheDocument();
		expect(reportCalls(stub)).toBe(2);
		expect(secondAt - firstAt).toBeGreaterThanOrEqual(900);
	});

	it('keeps the other failed tile when a per-tile Retry succeeds', async () => {
		seed(plain());
		// The first five students go through; the last two dequeued burn all three tries.
		const { stub } = stubFetch((n) => (n >= 5 && n < 11 ? retryable() : ok()));
		openPage(ReportsPage);

		await page.getByRole('button', { name: 'Write 7 reports' }).click();

		await vi.waitFor(() => expect(reportCalls(stub)).toBe(11), { timeout: 15000 });
		await vi.waitFor(() => expect(failedTiles()).toHaveLength(2), { timeout: 5000 });
		await vi.waitFor(() => expect(hasButton('Retry failed')).toBe(true), { timeout: 5000 });

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
		openPage(ReportsPage);

		await page.getByRole('button', { name: 'Write 1 report' }).click();

		await vi.waitFor(
			() => expect(page.getByText('Failed', { exact: true }).query()).not.toBeNull(),
			{
				timeout: 5000
			}
		);
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
		openPage(ReportsPage);

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
		openPage(ReportsPage);

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
		openPage(ReportsPage);

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

describe('topic names step', () => {
	it('auto-proposes on arrival, never overwrites a typed name, and gates Next on blanks', async () => {
		seed(h556());
		const { stub } = stubFetch(() => topicNames());
		openPage(ReportsPage);

		// Auto-proposal on arrival fills every code.
		await expect.element(page.getByRole('heading', { name: 'Topic names' })).toBeInTheDocument();
		const nameFor = (code: string): HTMLInputElement | null =>
			document.querySelector(`#topic-${CSS.escape(code)}`);
		await vi.waitFor(() => expect(nameFor('5.1.1')?.value).toBe('Kinetic theory of gases'), {
			timeout: 5000
		});
		expect(nameFor('5.2.1')?.value).toBe('Internal energy stores');
		expect(stub.mock.calls.filter(([url]) => String(url) === '/api/topic-names')).toHaveLength(1);

		// A typed name is never overwritten: blank 5.1.2 so only it is missing, and
		// the proposal fills just that gap.
		await page.getByLabelText('Name for 5.1.2').clear();
		await page.getByRole('button', { name: 'Propose missing names' }).click();
		await vi.waitFor(() => expect(nameFor('5.1.2')?.value).toBe('Gas pressure and temperature'), {
			timeout: 5000
		});
		expect(nameFor('5.1.1')?.value).toBe('Kinetic theory of gases');

		// Next stays blocked by a blank name.
		await page.getByLabelText('Name for 5.1.1').clear();
		expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
		await page.getByLabelText('Name for 5.1.1').fill('Kinetic theory of gases');
		await page.getByRole('button', { name: 'Next' }).click();
		await expect
			.element(page.getByRole('heading', { name: '7 students get a report' }))
			.toBeInTheDocument();
	});

	it('counts a comma-list entry toward both codes and shows the By topic strip', async () => {
		const doc = h556();
		doc.topicNames = {
			'5.1.1': 'Kinetic theory of gases',
			'5.1.2': 'Gas pressure and temperature',
			'5.2.1': 'Internal energy stores'
		};
		seed(doc);
		stubFetch(() => ok());
		openPage(ReportsPage);

		await expect.element(page.getByRole('heading', { name: 'Topic names' })).toBeInTheDocument();
		await page.getByRole('button', { name: 'Next' }).click();
		await page.getByRole('button', { name: 'Write 7 reports' }).click();

		await vi.waitFor(() => expect(document.querySelectorAll('.report-sheet').length).toBe(14), {
			timeout: 15000
		});
		const sheet = document.querySelector('main [data-report-id="ada"]');
		expect(sheet?.textContent).toContain('By topic');
		// Entry 1 (4 marks, Ada gained 3) carries "5.1.1, 5.1.2": both codes gain
		// its marks, so 5.1.1 shows 3/4 while 5.1.2 adds entry-2 (Ada 2/6) for 5/10.
		const stripOf = (title: string): string => {
			const headings = [...(sheet?.querySelectorAll('h3') ?? [])];
			return headings.find((h) => h.textContent === title)?.parentElement?.textContent ?? '';
		};
		const topics = stripOf('By topic');
		expect(topics).toMatch(/Kinetic theory of gases\s*3\/4/);
		expect(topics).toMatch(/Gas pressure and temperature\s*5\/10/);
		// Entry 3 carries no code: its 2/2 counts toward AO3's By skill strip but
		// toward no topic row.
		expect(topics).not.toContain('2/2');
		expect(stripOf('By skill')).toMatch(/AO3\s*2\/2/);
	});

	it('lets a failed proposal retry while hand typing still works', async () => {
		seed(h556());
		stubFetch(() =>
			Response.json(
				{ error: { code: 'MODEL_RETRYABLE', message: 'Busy', retryable: true } },
				{ status: 502 }
			)
		);
		openPage(ReportsPage);

		await expect.element(page.getByRole('alert')).toBeInTheDocument();
		// Hand typing still works while the proposal fails.
		await page.getByLabelText('Name for 5.1.1').fill('Typed by hand');
		marksheetStore().flush();
		expect(readSeeded().topicNames['5.1.1']).toBe('Typed by hand');
		await page.getByRole('button', { name: 'Retry' }).click();
		await expect.element(page.getByRole('alert')).toBeInTheDocument();
	});

	it('skips the step and makes no proposal call when no entry carries a code', async () => {
		seed(plain());
		const { stub } = stubFetch();
		openPage(ReportsPage);

		await expect
			.element(page.getByRole('heading', { name: '7 students get a report' }))
			.toBeInTheDocument();
		expect(page.getByRole('heading', { name: 'Topic names' }).query()).toBeNull();
		expect(stub.mock.calls.filter(([url]) => String(url) === '/api/topic-names')).toHaveLength(0);
	});

	it('persists names across a reload', async () => {
		seed(h556());
		stubFetch(() => topicNames({ '5.1.1': 'First proposal' }));
		const first = openPage(ReportsPage);

		await expect.element(page.getByRole('heading', { name: 'Topic names' })).toBeInTheDocument();
		const nameFor = (code: string): HTMLInputElement | null =>
			first.container.querySelector(`#topic-${CSS.escape(code)}`);
		await vi.waitFor(() => expect(nameFor('5.1.1')?.value).toBe('First proposal'), {
			timeout: 5000
		});
		await page.getByLabelText('Name for 5.1.2').fill('Hand typed');
		marksheetStore().flush();
		expect(readSeeded().topicNames['5.1.2']).toBe('Hand typed');

		first.unmount();
		const second = openPage(ReportsPage);
		await expect.element(page.getByRole('heading', { name: 'Topic names' })).toBeInTheDocument();
		const again = (code: string): HTMLInputElement | null =>
			second.container.querySelector(`#topic-${CSS.escape(code)}`);
		expect(again('5.1.1')?.value).toBe('First proposal');
		expect(again('5.1.2')?.value).toBe('Hand typed');
	});
});

describe('report editing', () => {
	/** One eligible student with a written report and no teacher edit. */
	function written(): MarksheetDocument {
		const doc = solo();
		const input = generationInputFor(doc, 'ada');
		if (!input) throw new Error('no generation input for ada');
		doc.reports = {
			ada: {
				strengths: ['Careful working'],
				areasForImprovement: ['Check units'],
				edit: null,
				input,
				model: 'test/model',
				generatedAt: '2026-01-01T10:00:00.000Z'
			}
		};
		return doc;
	}

	it('edits a strength in place, keeps it across a reload, and prints it', async () => {
		seed(written());
		stubFetch();
		const first = openPage(ReportsPage);

		await expect.element(page.getByRole('button', { name: 'Print all 1' })).toBeInTheDocument();
		await page.getByLabelText('Strengths for Ada Lovelace').fill('Beautifully clear working');
		await userEvent.keyboard('{Tab}');
		await expect.element(page.getByText('edited', { exact: true })).toBeInTheDocument();

		marksheetStore().flush();
		first.unmount();
		openPage(ReportsPage);

		await expect.element(page.getByRole('button', { name: 'Print all 1' })).toBeInTheDocument();
		await expect
			.element(page.getByLabelText('Strengths for Ada Lovelace'))
			.toHaveValue('Beautifully clear working');

		const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
		print.mockClear();
		await page.getByRole('button', { name: 'Print this page' }).click();
		expect(document.querySelector('[data-testid="print-root"]')?.textContent).toContain(
			'Beautifully clear working'
		);
		expect(print).toHaveBeenCalledTimes(1);
		print.mockRestore();
	});

	it('reverts an edited report to its generated wording', async () => {
		seed(written());
		stubFetch();
		openPage(ReportsPage);

		await expect.element(page.getByRole('button', { name: 'Print all 1' })).toBeInTheDocument();
		await page.getByLabelText('Strengths for Ada Lovelace').fill('Teacher wording');
		await userEvent.keyboard('{Tab}');
		await expect.element(page.getByText('edited', { exact: true })).toBeInTheDocument();

		await page.getByRole('button', { name: 'Revert' }).click();
		await expect
			.element(page.getByLabelText('Strengths for Ada Lovelace'))
			.toHaveValue('Careful working');
		expect(page.getByText('edited', { exact: true }).query()).toBeNull();
	});

	it('undoes an edit', async () => {
		seed(written());
		stubFetch();
		openPage(ReportsPage);

		await expect.element(page.getByRole('button', { name: 'Print all 1' })).toBeInTheDocument();
		await page.getByLabelText('Strengths for Ada Lovelace').fill('Teacher wording');
		await userEvent.keyboard('{Tab}');
		await expect.element(page.getByText('edited', { exact: true })).toBeInTheDocument();

		await page.getByTestId('report-edit-undo').getByRole('button', { name: 'Undo' }).click();
		await expect
			.element(page.getByLabelText('Strengths for Ada Lovelace'))
			.toHaveValue('Careful working');
		expect(page.getByText('edited', { exact: true }).query()).toBeNull();
	});

	it('takes a typed edit back in one undo', async () => {
		seed(written());
		stubFetch();
		openPage(ReportsPage);

		await expect.element(page.getByRole('button', { name: 'Print all 1' })).toBeInTheDocument();
		await page.getByLabelText('Strengths for Ada Lovelace').fill('Teacher');
		await userEvent.keyboard('{Tab}');
		await page.getByLabelText('Strengths for Ada Lovelace').fill('Teacher wording');
		await userEvent.keyboard('{Tab}');
		await expect.element(page.getByText('edited', { exact: true })).toBeInTheDocument();

		await page.getByTestId('report-edit-undo').getByRole('button', { name: 'Undo' }).click();
		await expect
			.element(page.getByLabelText('Strengths for Ada Lovelace'))
			.toHaveValue('Careful working');
		expect(page.getByText('edited', { exact: true }).query()).toBeNull();
	});

	it('shows pasted markup as literal text on screen and in print', async () => {
		seed(written());
		stubFetch();
		openPage(ReportsPage);

		await expect.element(page.getByRole('button', { name: 'Print all 1' })).toBeInTheDocument();
		await page.getByLabelText('Strengths for Ada Lovelace').fill(HOSTILE);
		await userEvent.keyboard('{Tab}');
		await expect.element(page.getByText(HOSTILE).first()).toBeInTheDocument();
		expect(document.querySelector('img')).toBeNull();

		const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
		print.mockClear();
		await page.getByRole('button', { name: 'Print this page' }).click();
		expect(document.querySelector('[data-testid="print-root"] img')).toBeNull();
		expect(document.querySelector('[data-testid="print-root"]')?.textContent).toContain(HOSTILE);
		expect(print).toHaveBeenCalledTimes(1);
		print.mockRestore();
	});
});
