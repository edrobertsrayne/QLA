import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { cleanup } from 'vitest-browser-svelte';
import type { MarksheetDocument } from '$lib/marksheet/document.js';
import { seed, student } from '$lib/marksheet/fixtures.spec-helpers.js';
import { generationInputFor } from '$lib/marksheet/report-input.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import { openPage } from '../spec-helpers.js';
import MarksheetPage from '../marksheet/+page.svelte';
import {
	plain,
	h556,
	solo,
	namedTwoTiers,
	stubFetch,
	topicNames,
	skipGrades,
	writeFor,
	openReports
} from './reports.spec-helpers.js';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('grades on reports', () => {
	/** Two eligible students: Ada clears the top grade, Bo sits one below it. */
	function gradedPair(): MarksheetDocument {
		const doc = plain();
		doc.tiers[0].boundaries = [
			{ label: 'A', minimum: 8 },
			{ label: 'B', minimum: 5 },
			{ label: 'C', minimum: 2 }
		];
		doc.students = [student('ada', 'Ada', 'Lovelace'), student('bo', 'Bo', 'Brown')];
		// Paper total is 10: Ada's 3 + 5 takes A, Bo's 3 + 2 takes B.
		doc.marks = {
			ada: { 'entry-1': 3, 'entry-2': 5 },
			bo: { 'entry-1': 3, 'entry-2': 2 }
		};
		return doc;
	}

	/** Both students with a written report and no teacher edit. */
	function writtenPair(): MarksheetDocument {
		const doc = gradedPair();
		doc.reports = {};
		for (const id of ['ada', 'bo']) {
			const input = generationInputFor(doc, id);
			if (!input) throw new Error(`no input for ${id}`);
			doc.reports[id] = {
				strengths: ['Careful working'],
				areasForImprovement: ['Check units'],
				edit: null,
				input,
				model: 'test/model',
				generatedAt: '2026-01-01T10:00:00.000Z'
			};
		}
		return doc;
	}

	/** One eligible student with a written report and no teacher edit. */
	function soloWritten(): MarksheetDocument {
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

	it('shows grade and marks to next on each page, Top grade at the top', async () => {
		seed(writtenPair());
		stubFetch();
		await openReports();

		await expect.element(page.getByRole('button', { name: 'Print all 2' })).toBeInTheDocument();
		const ada = document.querySelector('main [data-report-id="ada"]');
		expect(ada?.querySelector('[data-testid="report-grade"]')?.textContent).toMatch(/Grade\s+A/);
		expect(ada?.querySelector('[data-testid="report-to-next"]')?.textContent?.trim()).toBe(
			'Top grade'
		);
		const bo = document.querySelector('main [data-report-id="bo"]');
		expect(bo?.querySelector('[data-testid="report-grade"]')?.textContent).toMatch(/Grade\s+B/);
		expect(bo?.querySelector('[data-testid="report-to-next"]')?.textContent?.trim()).toBe(
			'3 more marks for grade A'
		);
	});

	it('sends no grade fields in the report request', async () => {
		const doc = solo();
		doc.tiers[0].boundaries = [
			{ label: 'B', minimum: 5 },
			{ label: 'C', minimum: 2 }
		];
		seed(doc);
		const { stub } = stubFetch();
		await openReports();

		// No specification points: the flow starts at the Grades step.
		await skipGrades();
		await page.getByRole('button', { name: 'Write 1 report' }).click();

		await expect.element(page.getByRole('button', { name: 'Print all 1' })).toBeInTheDocument();
		const bodies = stub.mock.calls
			.filter(([url]) => String(url) === '/api/report')
			.map(([, init]) => JSON.parse((init as { body: string }).body));
		expect(bodies.length).toBeGreaterThan(0);
		for (const body of bodies) {
			expect(Object.keys(body).sort()).toEqual(['entries', 'paperLabel']);
			for (const entry of body.entries) {
				expect(entry).not.toHaveProperty('grade');
			}
		}
	});

	it('omits every grade cell when the paper has no boundaries', async () => {
		seed(soloWritten());
		stubFetch();
		await openReports();

		await expect.element(page.getByRole('button', { name: 'Print all 1' })).toBeInTheDocument();
		expect(document.querySelector('main [data-testid="report-grade"]')).toBeNull();
		expect(document.querySelector('main [data-testid="report-to-next"]')).toBeNull();
	});

	it('walks Topic names, Grades, Who gets one when the paper has codes', async () => {
		seed(h556());
		stubFetch(() => topicNames());
		await openReports();

		await expect.element(page.getByRole('heading', { name: 'Topic names' })).toBeInTheDocument();
		await page.getByRole('button', { name: 'Next' }).click();

		await expect.element(page.getByRole('heading', { name: 'Grades' })).toBeInTheDocument();
		// The same editor as the dialog: raw marks, never percentages.
		await expect.element(page.getByText('Raw marks out of 12.')).toBeInTheDocument();
		await page.getByRole('button', { name: 'Skip: no grades on these reports' }).click();
		await expect
			.element(page.getByRole('heading', { name: '7 students get a report' }))
			.toBeInTheDocument();
		expect(marksheetStore().document?.tiers[0].boundaries).toBeNull();
	});

	it('saving in the Grades step updates the marksheet columns', async () => {
		seed(h556());
		stubFetch(() => topicNames());
		await openReports();

		await expect.element(page.getByRole('heading', { name: 'Topic names' })).toBeInTheDocument();
		await page.getByRole('button', { name: 'Next' }).click();
		await expect.element(page.getByRole('heading', { name: 'Grades' })).toBeInTheDocument();

		await page.getByRole('radio', { name: 'GCSE 9–1' }).click();
		// Paper total is 12: the 9-boundary at 10 keeps every minimum under it.
		await userEvent.fill(page.getByLabelText('Lowest mark for 9'), '10');
		await page.getByRole('button', { name: 'Save boundaries' }).click();
		expect(marksheetStore().document?.tiers[0].boundaries?.[0]).toEqual({
			label: '9',
			minimum: 10
		});

		await expect
			.element(page.getByRole('heading', { name: '7 students get a report' }))
			.toBeInTheDocument();

		// The same stored boundaries drive the marksheet's Total | Grade | To next
		// columns: Ada's 7 of 12 takes U, three marks short of 9.
		openPage(MarksheetPage);
		expect(
			document
				.querySelector('[data-testid="total-cell"][data-student-id="ada"]')
				?.textContent?.trim()
		).toBe('7');
		expect(
			document
				.querySelector('[data-testid="grade-cell"][data-student-id="ada"]')
				?.textContent?.trim()
		).toBe('U');
		expect(
			document
				.querySelector('[data-testid="to-next-cell"][data-student-id="ada"]')
				?.textContent?.trim()
		).toBe('3 to 9');
	});

	it('skipping with saved grades keeps them and says so', async () => {
		const doc = h556();
		doc.tiers[0].boundaries = [{ label: 'B', minimum: 5 }];
		seed(doc);
		stubFetch(() => topicNames());
		await openReports();

		await expect.element(page.getByRole('heading', { name: 'Topic names' })).toBeInTheDocument();
		await page.getByRole('button', { name: 'Next' }).click();
		await expect.element(page.getByRole('heading', { name: 'Grades' })).toBeInTheDocument();

		await page.getByRole('button', { name: 'Next' }).click();
		await expect
			.element(page.getByRole('heading', { name: '7 students get a report' }))
			.toBeInTheDocument();
		expect(marksheetStore().document?.tiers[0].boundaries).toEqual([{ label: 'B', minimum: 5 }]);
	});
});

describe('tiered report figures', () => {
	it("shows each student's own tier's questions, total and grade", async () => {
		const doc = namedTwoTiers();
		writeFor(doc, ['ada', 'bo']);
		seed(doc);
		stubFetch();
		await openReports('/reports/review');

		await expect.element(page.getByRole('button', { name: 'Print all 2' })).toBeInTheDocument();
		const ada = document.querySelector('main [data-report-id="ada"]');
		expect(ada?.textContent).toContain('H1');
		expect(ada?.textContent).toContain('H2');
		expect(ada?.textContent).not.toContain('F1');
		expect(ada?.textContent).toContain('8/10');
		// Higher boundaries: 8 is the top grade.
		expect(ada?.querySelector('[data-testid="report-grade"]')?.textContent).toMatch(/Grade\s+A/);
		expect(ada?.querySelector('[data-testid="report-to-next"]')?.textContent?.trim()).toBe(
			'Top grade'
		);

		const bo = document.querySelector('main [data-report-id="bo"]');
		expect(bo?.textContent).toContain('F1');
		expect(bo?.textContent).toContain('F2');
		expect(bo?.textContent).not.toContain('H1');
		expect(bo?.textContent).toContain('3/8');
		// Foundation boundaries, not Higher's: 3 is F-B, three short of F-A.
		expect(bo?.querySelector('[data-testid="report-grade"]')?.textContent).toMatch(/Grade\s+F-B/);
		expect(bo?.querySelector('[data-testid="report-to-next"]')?.textContent?.trim()).toBe(
			'3 more marks for grade F-A'
		);
	});

	it('never sends the tier name or the other tier to the report model', () => {
		const doc = namedTwoTiers();
		doc.tiers[0].tierName = 'Higher Tier';
		const input = generationInputFor(doc, 'ada');
		expect(input?.entries.map((entry) => entry.label)).toEqual(['H1', 'H2']);
		expect(input?.paperLabel).toBe('10X Ph1');
		expect(input).not.toHaveProperty('tier');
		expect(input).not.toHaveProperty('tierName');
		expect(JSON.stringify(input)).not.toContain('Higher Tier');
		expect(JSON.stringify(input)).not.toContain('Foundation');
	});

	it('offers a tier toggle on two tiers and saves against the chosen tier', async () => {
		seed(namedTwoTiers());
		stubFetch();
		const { router } = await openReports('/reports/grades');
		expect(router.path).toBe('/reports/grades');

		const first = page.getByRole('button', { name: 'Tier 1 · Higher', exact: true });
		const second = page.getByRole('button', { name: 'Tier 2 · Foundation', exact: true });
		await expect.element(first).toHaveAttribute('aria-pressed', 'true');
		await expect.element(page.getByText('Raw marks out of 10.')).toBeInTheDocument();

		await second.click();
		await expect.element(second).toHaveAttribute('aria-pressed', 'true');
		await expect.element(page.getByText('Raw marks out of 8.')).toBeInTheDocument();

		// Save Tier 2's scale: its 9-boundary is 6 of 8, and Tier 1 keeps its own.
		await page.getByRole('radio', { name: 'GCSE 9–1' }).click();
		await userEvent.fill(page.getByLabelText('Lowest mark for 9'), '6');
		await page.getByRole('button', { name: 'Save boundaries' }).click();
		// Two tiers stay on the step so the other tier can be set in the same visit.
		await expect.element(page.getByRole('heading', { name: 'Grades' })).toBeInTheDocument();
		await expect
			.element(page.getByText('Tier 2 · Foundation boundaries saved.'))
			.toBeInTheDocument();

		expect(marksheetStore().document?.tiers[1].boundaries?.[0]).toEqual({
			label: '9',
			minimum: 6
		});
		expect(marksheetStore().document?.tiers[0].boundaries).toEqual([
			{ label: 'A', minimum: 8 },
			{ label: 'B', minimum: 5 },
			{ label: 'C', minimum: 2 }
		]);

		// The offer moves straight to the other tier, with its own rows.
		await page.getByRole('button', { name: 'Set Tier 1 · Higher grades' }).click();
		await expect.element(first).toHaveAttribute('aria-pressed', 'true');
		await expect.element(page.getByLabelText('Lowest mark for A')).toHaveValue('8');

		await page.getByRole('button', { name: 'Next' }).click();
		await expect
			.element(page.getByRole('heading', { name: '2 students get a report' }))
			.toBeInTheDocument();
	});

	it('shows each tier’s own stored rows when the tier changes, and keeps them when saved untouched', async () => {
		seed(namedTwoTiers());
		stubFetch();
		await openReports('/reports/grades');

		// Tier 1's stored scale, as the form reads it on arrival.
		await expect.element(page.getByLabelText('Lowest mark for A')).toHaveValue('8');
		// Re-clicking the scale that is already chosen keeps it chosen.
		await page.getByRole('radio', { name: 'Custom' }).click();
		await expect
			.element(page.getByRole('radio', { name: 'Custom' }))
			.toHaveAttribute('aria-checked', 'true');
		await expect.element(page.getByLabelText('Lowest mark for A')).toHaveValue('8');

		// Tier 2's stored rows replace them: the form is a fresh one for that tier.
		await page.getByRole('button', { name: 'Tier 2 · Foundation', exact: true }).click();
		await expect.element(page.getByLabelText('Lowest mark for F-A')).toHaveValue('6');
		await expect.element(page.getByLabelText('Lowest mark for F-B')).toHaveValue('3');
		expect(page.getByLabelText('Lowest mark for A').query()).toBeNull();

		// Saving without typing anything stores the rows shown, not Tier 1's, and
		// stays on the step for the other tier.
		await page.getByRole('button', { name: 'Save boundaries' }).click();
		await expect
			.element(page.getByText('Tier 2 · Foundation boundaries saved.'))
			.toBeInTheDocument();
		expect(marksheetStore().document?.tiers[1].boundaries).toEqual([
			{ label: 'F-A', minimum: 6 },
			{ label: 'F-B', minimum: 3 }
		]);
		expect(marksheetStore().document?.tiers[0].boundaries).toEqual([
			{ label: 'A', minimum: 8 },
			{ label: 'B', minimum: 5 },
			{ label: 'C', minimum: 2 }
		]);

		// And the other way: Tier 2 keeps its rows, Tier 1 shows its own again.
		await page.getByRole('button', { name: 'Tier 1 · Higher', exact: true }).click();
		await expect.element(page.getByLabelText('Lowest mark for A')).toHaveValue('8');
		await page.getByRole('button', { name: 'Tier 2 · Foundation', exact: true }).click();
		await expect.element(page.getByLabelText('Lowest mark for F-A')).toHaveValue('6');
		await page.getByRole('button', { name: 'Tier 1 · Higher', exact: true }).click();
		await expect.element(page.getByLabelText('Lowest mark for A')).toHaveValue('8');

		await page.getByRole('button', { name: 'Save boundaries' }).click();
		await expect.element(page.getByText('Tier 1 · Higher boundaries saved.')).toBeInTheDocument();
		expect(marksheetStore().document?.tiers[0].boundaries).toEqual([
			{ label: 'A', minimum: 8 },
			{ label: 'B', minimum: 5 },
			{ label: 'C', minimum: 2 }
		]);
		expect(marksheetStore().document?.tiers[1].boundaries).toEqual([
			{ label: 'F-A', minimum: 6 },
			{ label: 'F-B', minimum: 3 }
		]);

		await page.getByRole('button', { name: 'Next' }).click();
		await expect
			.element(page.getByRole('heading', { name: '2 students get a report' }))
			.toBeInTheDocument();
	});

	it('keeps today’s single form and no toggle on one tier', async () => {
		seed(plain());
		stubFetch();
		await openReports('/reports/grades');

		await expect.element(page.getByRole('heading', { name: 'Grades' })).toBeInTheDocument();
		expect(document.querySelector('[role="group"][aria-label="Tier"]')).toBeNull();
		await expect.element(page.getByText('Raw marks out of 10.')).toBeInTheDocument();
	});
});
