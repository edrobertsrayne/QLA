import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { cleanup } from 'vitest-browser-svelte';
import { readSeeded, seed } from '$lib/marksheet/fixtures.spec-helpers.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import {
	plain,
	h556,
	stubFetch,
	ok,
	topicNames,
	skipGrades,
	writeFor,
	posted,
	openReports
} from './reports.spec-helpers.js';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('topic names step', () => {
	it('auto-proposes on arrival, never overwrites a typed name, and gates Next on blanks', async () => {
		seed(h556());
		const { stub } = stubFetch(() => topicNames());
		await openReports();

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
		await skipGrades();
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
		await openReports();

		await expect.element(page.getByRole('heading', { name: 'Topic names' })).toBeInTheDocument();
		await page.getByRole('button', { name: 'Next' }).click();
		await skipGrades();
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

	it('shows an AO description beside its code in By skill, never sending it to the model', async () => {
		const doc = h556();
		doc.topicNames = {
			'5.1.1': 'Kinetic theory of gases',
			'5.1.2': 'Gas pressure and temperature',
			'5.2.1': 'Internal energy stores'
		};
		doc.breakdown.aoDescriptions = { AO3: 'Analyse information to make judgements' };
		seed(doc);
		const { stub } = stubFetch(() => ok());
		await openReports();

		await expect.element(page.getByRole('heading', { name: 'Topic names' })).toBeInTheDocument();
		await page.getByRole('button', { name: 'Next' }).click();
		await skipGrades();
		await page.getByRole('button', { name: 'Write 7 reports' }).click();

		await vi.waitFor(() => expect(document.querySelectorAll('.report-sheet').length).toBe(14), {
			timeout: 15000
		});
		const sheet = document.querySelector('main [data-report-id="ada"]');
		const skills =
			[...(sheet?.querySelectorAll('h3') ?? [])].find((h) => h.textContent === 'By skill')
				?.parentElement?.textContent ?? '';
		expect(skills).toMatch(/AO3 · Analyse information to make judgements\s*2\/2/);
		// An objective with no description shows its code alone.
		expect(skills).not.toMatch(/AO1 ·/);
		expect(JSON.stringify(posted(stub))).not.toContain('Analyse information');
	});

	it('lets a failed proposal retry while hand typing still works', async () => {
		seed(h556());
		stubFetch(() =>
			Response.json(
				{ error: { code: 'MODEL_RETRYABLE', message: 'Busy', retryable: true } },
				{ status: 502 }
			)
		);
		await openReports();

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
		await openReports();
		await skipGrades();

		await expect
			.element(page.getByRole('heading', { name: '7 students get a report' }))
			.toBeInTheDocument();
		expect(page.getByRole('heading', { name: 'Topic names' }).query()).toBeNull();
		expect(stub.mock.calls.filter(([url]) => String(url) === '/api/topic-names')).toHaveLength(0);
	});

	it('persists names across a reload', async () => {
		seed(h556());
		stubFetch(() => topicNames({ '5.1.1': 'First proposal' }));
		const first = (await openReports()).screen;

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
		const second = (await openReports()).screen;
		await expect.element(page.getByRole('heading', { name: 'Topic names' })).toBeInTheDocument();
		const again = (code: string): HTMLInputElement | null =>
			second.container.querySelector(`#topic-${CSS.escape(code)}`);
		expect(again('5.1.1')?.value).toBe('First proposal');
		expect(again('5.1.2')?.value).toBe('Hand typed');
	});
});

describe('review fixes', () => {
	it('sends a paper whose topic lost its name back to Topic names', async () => {
		const doc = h556();
		doc.topicNames = {
			'5.1.1': 'Kinetic theory of gases',
			'5.1.2': 'Gas pressure and temperature',
			'5.2.1': 'Internal energy stores'
		};
		writeFor(doc, ['ada']);
		delete doc.topicNames['5.2.1'];
		seed(doc);
		// The proposal on arrival is the first call: it fails, so the name stays blank.
		stubFetch((n) =>
			n === 0
				? Response.json({ error: { message: 'Proposal unavailable.' } }, { status: 502 })
				: ok()
		);
		await openReports();

		await expect.element(page.getByRole('heading', { name: 'Topic names' })).toBeInTheDocument();
		for (const step of [/Who gets one/, /Writing/, /Review and print/]) {
			await expect.element(page.getByRole('button', { name: step })).toBeDisabled();
		}
		await expect.element(page.getByRole('button', { name: 'Next' })).toBeDisabled();

		await page.getByLabelText('Name for 5.2.1').fill('Internal energy stores');
		await expect.element(page.getByRole('button', { name: /Review and print/ })).toBeEnabled();
		await page.getByRole('button', { name: /Review and print/ }).click();
		await expect.element(page.getByRole('button', { name: 'Print all 1' })).toBeEnabled();
	});

	it('gives codes that share a name one row, counting each entry once', async () => {
		const doc = h556();
		doc.topicNames = {
			'5.1.1': 'Kinetic model',
			'5.1.2': 'Kinetic model',
			'5.2.1': 'Internal energy stores'
		};
		seed(doc);
		const { stub } = stubFetch();
		await openReports();
		await expect.element(page.getByRole('heading', { name: 'Topic names' })).toBeInTheDocument();
		await page.getByRole('button', { name: 'Next' }).click();
		await skipGrades();
		await page.getByRole('button', { name: 'Write 7 reports' }).click();
		await expect.element(page.getByRole('button', { name: 'Print all 7' })).toBeInTheDocument();

		const sheet = document.querySelector('main [data-report-id="ada"]');
		const strip = [...(sheet?.querySelectorAll('h3') ?? [])].find(
			(heading) => heading.textContent === 'By topic'
		)?.parentElement;
		const rows = [...(strip?.querySelectorAll('.flex.items-start') ?? [])].map((row) =>
			row.textContent?.replace(/\s+/g, ' ').trim()
		);
		// Ada: entry-1 (3/4) counts once toward the shared name, plus entry-2 (2/6).
		const shared = rows.filter((row) => row?.startsWith('Kinetic model'));
		expect(shared).toHaveLength(1);
		expect(shared[0]).toMatch(/^Kinetic model 5\/10\b/);
		expect(posted(stub)[0].entries[0].topics).toEqual(['Kinetic model', 'Kinetic model']);
	});
});
