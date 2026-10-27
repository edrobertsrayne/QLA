import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { confirmed, entry, seed, student, tier } from '$lib/marksheet/fixtures.spec-helpers.js';
import { marksheetStore } from '$lib/marksheet/index.js';
import { goto } from '$app/navigation';
import {
	commonOrder,
	commonRow,
	figureText,
	openAnalysisAt,
	seedTwoTierAnalysis,
	tierOrder,
	tierRow,
	trackValue,
	twoTierAnalysisDocument
} from './analysis.spec-helpers.js';

/** One tier of four entries: red, amber, green and unmarked, each figure over two students. */
function seedSingleTierAnalysis(): void {
	seed(
		confirmed({
			tiers: [
				tier({
					breakdown: {
						entries: [
							entry('entry-red', '1a', '1', { marks: 10, summary: 'Red question' }),
							entry('entry-amber', '1b', '1', { marks: 10, summary: 'Amber question' }),
							entry('entry-green', '1c', '1', { marks: 10, summary: 'Green question' }),
							entry('entry-unmarked', '1d', '1', { marks: 10, summary: 'Unmarked question' })
						],
						warnings: []
					}
				})
			],
			students: [student('s1', 'Ada', 'Lovelace'), student('s2', 'Grace', 'Hopper')],
			marks: {
				s1: { 'entry-red': 2, 'entry-amber': 5, 'entry-green': 9 },
				s2: { 'entry-red': 2, 'entry-amber': 5, 'entry-green': 9 }
			}
		})
	);
}

describe('analysis', () => {
	it('draws a single tier as band sections over track charts, with no tabs and no tier name', async () => {
		seedSingleTierAnalysis();
		const screen = openAnalysisAt();

		await expect.element(page.getByTestId('analysis-view')).toBeInTheDocument();
		expect(screen.container.querySelector('[data-testid="analysis-tabs"]')).toBeNull();
		await expect
			.element(page.getByRole('heading', { level: 2 }))
			.toHaveTextContent('Question analysis — 10X Ph1');

		const red = tierRow(screen.container, 'entry-red');
		expect(figureText(red, 'facility')).toBe('20%');
		expect(figureText(red, 'coverage')).toBe('2/2');
		expect(trackValue(red, 'tier1')).toBe('20');
		expect(trackValue(red, 'tier2')).toBe('');
		expect(trackValue(red, 'pooled')).toBe('');

		const amber = tierRow(screen.container, 'entry-amber');
		expect(figureText(amber, 'facility')).toBe('50%');
		expect(trackValue(amber, 'tier1')).toBe('50');

		// Today's sections, green folded, the unmarked entry last.
		await expect
			.element(page.getByRole('heading', { name: 'Red — below 40%' }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('heading', { name: 'Amber — 40% to below 70%' }))
			.toBeInTheDocument();
		// Green is folded: its row stays in the page for print, hidden on screen.
		expect(tierRow(screen.container, 'entry-green').checkVisibility()).toBe(false);
		expect(figureText(tierRow(screen.container, 'entry-unmarked'), 'facility')).toBe(
			'Not marked yet'
		);

		await page.getByRole('button', { name: 'Green — 70% and above' }).click();
		await vi.waitFor(() =>
			expect(tierRow(screen.container, 'entry-green').checkVisibility()).toBe(true)
		);
		await vi.waitFor(() =>
			expect(figureText(tierRow(screen.container, 'entry-green'), 'facility')).toBe('90%')
		);
		await vi.waitFor(() =>
			expect(tierOrder(screen.container)).toEqual([
				'entry-red',
				'entry-amber',
				'entry-green',
				'entry-unmarked'
			])
		);
	});

	it('names each tier and the common questions, with figures over that tier’s students', async () => {
		seedTwoTierAnalysis();
		const screen = openAnalysisAt();

		await expect.element(page.getByRole('radio', { name: 'Tier 1 · Higher' })).toBeInTheDocument();
		await expect
			.element(page.getByRole('radio', { name: 'Tier 2 · Foundation' }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('radio', { name: 'Common questions (4)' }))
			.toBeInTheDocument();

		// Tier 1's own students: two present, one absent; Flo's off-tier mark is not counted.
		await page.getByRole('button', { name: 'Green — 70% and above' }).click();
		await vi.waitFor(() =>
			expect(screen.container.querySelector('[data-entry-id="e-a"]')).not.toBeNull()
		);
		const pair = tierRow(screen.container, 'e-a');
		expect(figureText(pair, 'facility')).toBe('70%');
		expect(figureText(pair, 'coverage')).toBe('H 2/2');
		expect(figureText(pair, 'partner-chip')).toBe('⇔ F 8a');
		expect(trackValue(pair, 'tier1')).toBe('70');
		expect(trackValue(pair, 'tier2')).toBe('50');
		expect(trackValue(pair, 'pooled')).toBe('60');
		await expect.element(page.getByTestId('analysis-view')).toHaveTextContent('2 students counted');
		await expect.element(page.getByTestId('analysis-view')).toHaveTextContent('1 absent excluded');
		expect(screen.container.querySelector('[data-entry-id="f-a"]')).toBeNull();

		await page.getByRole('radio', { name: 'Tier 2 · Foundation' }).click();
		await vi.waitFor(() =>
			expect(figureText(tierRow(screen.container, 'f-a'), 'facility')).toBe('50%')
		);
		const foundation = tierRow(screen.container, 'f-a');
		expect(figureText(foundation, 'coverage')).toBe('F 2/2');
		expect(figureText(foundation, 'partner-chip')).toBe('⇔ H 1a');
		expect(trackValue(foundation, 'tier1')).toBe('70');
		expect(trackValue(foundation, 'tier2')).toBe('50');
		expect(trackValue(foundation, 'pooled')).toBe('60');
		expect(screen.container.querySelector('[data-entry-id="e-a"]')).toBeNull();
		expect(figureText(tierRow(screen.container, 'f-d'), 'facility')).toBe('Not marked yet');
	});

	it('stays on the tab clicked twice, and keys every track by tier, not by the open tab', async () => {
		seedTwoTierAnalysis();
		const screen = openAnalysisAt();

		const legend = screen.container.querySelector('[data-testid="track-legend"]');
		const keys = [...(legend?.querySelectorAll<HTMLElement>('[data-testid="legend-tier"]') ?? [])];
		expect(keys.map((key) => key.dataset.tier)).toEqual(['0', '1']);
		// Filled is always Tier 1's figure; hollow always Tier 2's.
		expect(keys[0].textContent).toContain('Higher');
		expect(keys[1].textContent).toContain('Foundation');
		expect(keys[0].classList.contains('opacity-40')).toBe(false);
		expect(keys[1].classList.contains('opacity-40')).toBe(true);

		await page.getByRole('radio', { name: 'Tier 2 · Foundation' }).click();
		await vi.waitFor(() => expect(tierRow(screen.container, 'f-a').checkVisibility()).toBe(true));
		await vi.waitFor(() => expect(keys[0].classList.contains('opacity-40')).toBe(true));
		expect(keys[1].classList.contains('opacity-40')).toBe(false);

		// Re-clicking the open tab reports no value; it must stay open rather than fall back.
		await page.getByRole('radio', { name: 'Tier 2 · Foundation' }).click();
		await expect.element(page.getByRole('radio', { name: 'Tier 2 · Foundation' })).toBeChecked();
		expect(tierRow(screen.container, 'f-a').checkVisibility()).toBe(true);
		expect(screen.container.querySelector('[data-entry-id="e-a"]')).toBeNull();
	});

	it('keeps the band sections on a tier tab, worst first within each, with the band in every heading', async () => {
		seedTwoTierAnalysis();
		const screen = openAnalysisAt();

		await expect
			.element(page.getByRole('heading', { name: 'Red — below 40%' }))
			.toBeInTheDocument();
		await vi.waitFor(() => expect(tierOrder(screen.container)).toEqual(['e-b', 'e-d', 'e-c']));

		await page.getByRole('button', { name: 'Green — 70% and above' }).click();
		await vi.waitFor(() =>
			expect(tierOrder(screen.container)).toEqual(['e-b', 'e-d', 'e-c', 'e-a'])
		);

		await page.getByRole('radio', { name: 'Tier 2 · Foundation' }).click();
		await vi.waitFor(() =>
			expect(screen.container.querySelector('[data-entry-id="f-d"]')).not.toBeNull()
		);
		// The fold carries across the tabs: green stays open where the teacher left it.
		expect(screen.container.querySelector('[data-entry-id="f-b"]')).not.toBeNull();
		await vi.waitFor(() =>
			expect(tierOrder(screen.container)).toEqual(['f-a', 'f-c', 'f-b', 'f-d'])
		);
	});

	it('compares each pair on the common tab and leaves pooled and gap blank until both tiers are marked', async () => {
		seedTwoTierAnalysis();
		const screen = openAnalysisAt('?tier=common');

		await expect.element(page.getByTestId('common-questions')).toBeInTheDocument();

		const both = commonRow(screen.container, 'e-a');
		expect(both.textContent).toContain('1a ↔ 8a');
		expect(figureText(both, 'common-coverage')).toBe('H 2/2 · F 2/2');
		expect(figureText(both, 'common-gap')).toBe('+20');
		expect(figureText(both, 'common-pooled')).toBe('pooled 60%');
		expect(trackValue(both, 'tier1')).toBe('70');
		expect(trackValue(both, 'tier2')).toBe('50');
		expect(trackValue(both, 'pooled')).toBe('60');

		const foundationAhead = commonRow(screen.container, 'e-b');
		expect(figureText(foundationAhead, 'common-gap')).toBe('-70');
		expect(figureText(foundationAhead, 'common-pooled')).toBe('pooled 45%');

		const level = commonRow(screen.container, 'e-c');
		expect(figureText(level, 'common-gap')).toBe('0');
		expect(figureText(level, 'common-pooled')).toBe('pooled 50%');

		// Foundation has no mark on the fourth pair: no pooled figure, no gap.
		const oneSided = commonRow(screen.container, 'e-d');
		expect(figureText(oneSided, 'common-gap')).toBe('—');
		expect(figureText(oneSided, 'common-pooled')).toBe('—');
		expect(trackValue(oneSided, 'tier1')).toBe('40');
		expect(trackValue(oneSided, 'tier2')).toBe('');
		expect(trackValue(oneSided, 'pooled')).toBe('');
		expect(figureText(oneSided, 'common-note-tier2')).toBe('F Not marked yet');
		expect(oneSided.querySelector('[data-testid="common-note-tier1"]')).toBeNull();
	});

	it('names what one side of a pair leaves out of its figure', async () => {
		const document = twoTierAnalysisDocument();
		// Flo's only mark on 8d is above its available marks: marked, but nothing counted.
		document.marks.f1 = { 'f-a': 5, 'f-b': 8, 'f-c': 5, 'e-a': 10, 'f-d': 11 };
		seed(document);
		const screen = openAnalysisAt('?tier=common');

		const pair = commonRow(screen.container, 'e-d');
		expect(figureText(pair, 'common-coverage')).toBe('H 2/2 · F 1/2');
		expect(figureText(pair, 'common-note-tier2')).toBe(
			'F No mark within the available marks · F 1 above max — not counted'
		);
		expect(pair.querySelector('[data-testid="common-note-tier1"]')).toBeNull();
	});

	it('says when students without a tier are left out of the common facts', async () => {
		const document = twoTierAnalysisDocument();
		document.students.push(student('u1', 'Una', 'Tierless', false, null));
		seed(document);
		openAnalysisAt('?tier=common');

		await expect
			.element(page.getByTestId('analysis-view'))
			.toHaveTextContent('1 student without a tier excluded');
	});

	it('falls back to T1 and T2 when two tier names share an initial', async () => {
		const document = twoTierAnalysisDocument();
		document.tiers[0].tierName = 'Higher';
		document.tiers[1].tierName = 'Higher Prep';
		seed(document);
		const screen = openAnalysisAt('?tier=common');

		await expect.element(page.getByRole('columnheader', { name: 'T1 ↔ T2' })).toBeInTheDocument();
		expect(
			screen.container
				.querySelector('[data-testid="common-coverage"]')
				?.textContent?.replace(/\s+/g, ' ')
				.trim()
		).toContain('T1 2/2 · T2 2/2');
	});

	it('draws the gap line between the whole percentages its labels show', async () => {
		const document = twoTierAnalysisDocument();
		// 5/13 = 38.46% and 3/8 = 37.5% both label 38%, so the line has no length.
		document.tiers[0].breakdown.entries = [entry('e-a', '1a', '1', { marks: 13 })];
		document.tiers[1].breakdown.entries = [entry('f-a', '8a', '8', { marks: 8 })];
		document.commonQuestions = [{ tier1EntryId: 'e-a', tier2EntryId: 'f-a' }];
		document.students = [
			student('h1', 'Ada', 'Lovelace', false, 0),
			student('f1', 'Flo', 'Found', false, 1)
		];
		document.marks = { h1: { 'e-a': 5 }, f1: { 'f-a': 3 } };
		seed(document);
		const screen = openAnalysisAt('?tier=common');

		const row = commonRow(screen.container, 'e-a');
		const gap = row.querySelector<HTMLElement>('[data-testid="track-gap"]');
		expect(gap?.style.left).toBe('38%');
		expect(gap?.style.width).toBe('0%');
	});

	it('keeps the open tier and sort selected when they are clicked again', async () => {
		seedTwoTierAnalysis();
		openAnalysisAt('?tier=common');

		const common = page.getByRole('radio', { name: /Common questions/ });
		await expect.element(common).toHaveAttribute('aria-checked', 'true');
		await common.click();
		await expect.element(common).toHaveAttribute('aria-checked', 'true');

		const sort = page.getByRole('radio', { name: 'Biggest gap' });
		await sort.click();
		await expect.element(sort).toHaveAttribute('aria-checked', 'true');
	});

	it('sorts the common questions by biggest gap, then by pooled and paper order', async () => {
		seedTwoTierAnalysis();
		const screen = openAnalysisAt('?tier=common');

		await vi.waitFor(() =>
			expect(commonOrder(screen.container)).toEqual(['e-b', 'e-a', 'e-c', 'e-d'])
		);

		await page.getByRole('radio', { name: 'Pooled, worst first' }).click();
		await vi.waitFor(() =>
			expect(commonOrder(screen.container)).toEqual(['e-b', 'e-c', 'e-a', 'e-d'])
		);

		// Re-clicking the chosen sort keeps it: the order must not quietly fall back.
		await page.getByRole('radio', { name: 'Pooled, worst first' }).click();
		await expect.element(page.getByRole('radio', { name: 'Pooled, worst first' })).toBeChecked();
		await vi.waitFor(() =>
			expect(commonOrder(screen.container)).toEqual(['e-b', 'e-c', 'e-a', 'e-d'])
		);

		await page.getByRole('radio', { name: 'Tier 1 paper order' }).click();
		await vi.waitFor(() =>
			expect(commonOrder(screen.container)).toEqual(['e-a', 'e-b', 'e-c', 'e-d'])
		);
	});

	it('leaves the Common tab out when no pairs were confirmed', async () => {
		seed({ ...twoTierAnalysisDocument(), commonQuestions: [] });
		const screen = openAnalysisAt();

		await expect.element(page.getByRole('radio', { name: 'Tier 1 · Higher' })).toBeInTheDocument();
		expect(
			screen.container.querySelector('[data-testid="analysis-tabs"]')?.textContent
		).not.toContain('Common questions');
		expect(tierRow(screen.container, 'e-b')).not.toBeNull();
	});

	it('opens at the requested tab and highlights that entry, or its pair on the common tab', async () => {
		seedTwoTierAnalysis();
		const screen = openAnalysisAt('?tier=1&entry=f-b');

		await vi.waitFor(() =>
			expect(tierRow(screen.container, 'f-b').dataset.highlighted).toBe('true')
		);
		expect(screen.container.querySelector('[data-entry-id="e-b"]')).toBeNull();
		screen.unmount();

		const common = openAnalysisAt('?tier=common&entry=e-b');
		await vi.waitFor(() =>
			expect(commonRow(common.container, 'e-b').dataset.highlighted).toBe('true')
		);
		common.unmount();

		// Either side of a pair opens the same line: Tier 1's id is only the preference.
		const byPartner = openAnalysisAt('?tier=common&entry=f-b');
		await vi.waitFor(() =>
			expect(commonRow(byPartner.container, 'e-b').dataset.highlighted).toBe('true')
		);
		byPartner.unmount();

		// An absent or invalid tier opens Tier 1's chart; an unknown entry outlines nothing.
		const fallback = openAnalysisAt('?tier=9&entry=e-b');
		await vi.waitFor(() =>
			expect(tierRow(fallback.container, 'e-b').dataset.highlighted).toBe('true')
		);
		expect(fallback.container.querySelector('[data-entry-id="f-b"]')).toBeNull();
		fallback.unmount();

		const unknown = openAnalysisAt('?entry=nope');
		await expect.element(page.getByTestId('analysis-view')).toBeInTheDocument();
		expect(unknown.container.querySelector('[data-highlighted]')).toBeNull();
	});

	it('unfolds green to reveal the entry the view opened at', async () => {
		seedSingleTierAnalysis();
		const screen = openAnalysisAt('?entry=entry-green');

		await vi.waitFor(() =>
			expect(tierRow(screen.container, 'entry-green').dataset.highlighted).toBe('true')
		);
		const box = tierRow(screen.container, 'entry-green').getBoundingClientRect();
		expect(box.top).toBeGreaterThanOrEqual(0);
		expect(box.bottom).toBeLessThanOrEqual(window.innerHeight);
	});

	it('takes a single tier asked for Tier 2 or the common tab back to its one chart', async () => {
		seedSingleTierAnalysis();
		const asked = openAnalysisAt('?tier=1&entry=entry-red');

		await vi.waitFor(() =>
			expect(tierRow(asked.container, 'entry-red').dataset.highlighted).toBe('true')
		);
		expect(asked.container.querySelector('[data-testid="analysis-tabs"]')).toBeNull();
		asked.unmount();

		const common = openAnalysisAt('?tier=common');
		await expect.element(page.getByTestId('analysis-view')).toBeInTheDocument();
		expect(common.container.querySelector('[data-testid="analysis-tabs"]')).toBeNull();
		expect(common.container.querySelector('[data-testid="common-questions"]')).toBeNull();
		expect(tierRow(common.container, 'entry-red')).not.toBeNull();
	});

	it('recomputes when a student changes tier, without a reload', async () => {
		seedTwoTierAnalysis();
		const screen = openAnalysisAt();

		await page.getByRole('button', { name: 'Green — 70% and above' }).click();
		await vi.waitFor(() =>
			expect(figureText(tierRow(screen.container, 'e-a'), 'facility')).toBe('70%')
		);

		// Flo joins Tier 1: her mark on the Higher entry is now counted, not off-tier.
		marksheetStore().setStudentTier('f1', 0);

		await vi.waitFor(() =>
			expect(figureText(tierRow(screen.container, 'e-a'), 'facility')).toBe('80%')
		);
		expect(figureText(tierRow(screen.container, 'e-a'), 'coverage')).toBe('H 3/3');
	});

	it('reads a tier by topic or by AO in separate lists, weakest first, each row opening to its questions', async () => {
		seed(
			confirmed({
				tiers: [
					tier({
						breakdown: {
							entries: [
								entry('q1', '1a', '1', { marks: 4, specPoint: '1.1, 2.2', ao: 'AO1' }),
								entry('q2', '1b', '1', { marks: 4, specPoint: '2.2', ao: 'AO2' }),
								entry('q3', '1c', '1', { marks: 4, specPoint: null, ao: 'AO2' })
							],
							warnings: []
						}
					})
				],
				students: [student('s1', 'Ada', 'Lovelace'), student('s2', 'Grace', 'Hopper')],
				marks: { s1: { q1: 4, q2: 0, q3: 2 }, s2: { q1: 4, q2: 1, q3: 2 } },
				topicNames: { '2.2': 'Energy' }
			})
		);
		const screen = openAnalysisAt();
		const topicRows = () => [
			...screen.container.querySelectorAll<HTMLElement>('[data-testid="topic-row"]')
		];
		const topicRowOf = (code: string) => {
			const row = topicRows().find((candidate) => candidate.dataset.topic === code);
			if (!row) throw new Error(`no topic row for ${code}`);
			return row;
		};

		// Opens on the question chart, with no topic rows in sight.
		await expect.element(page.getByRole('radio', { name: 'By questions' })).toBeChecked();
		expect(tierRow(screen.container, 'q2')).not.toBeNull();
		expect(topicRows()).toEqual([]);

		await page.getByRole('radio', { name: 'By topic' }).click();
		await vi.waitFor(() =>
			expect(topicRows().map((row) => row.dataset.topic)).toEqual(['2.2', '1.1'])
		);
		expect(screen.container.querySelector('[data-testid="analysis-row"]')).toBeNull();
		const energy = topicRowOf('2.2');
		// A named topic shows its name and its code; an unnamed one its code once.
		expect(figureText(energy, 'topic-name')).toBe('Energy 2.2');
		expect(figureText(topicRowOf('1.1'), 'topic-name')).toBe('1.1');
		// q1 carries both codes, so its full marks count toward each: 9 of 16.
		expect(figureText(energy, 'facility')).toBe('56%');
		expect(figureText(energy, 'coverage')).toBe('9/16 marks · 2 questions');
		expect(trackValue(energy, 'tier1')).toBe('56');
		expect(figureText(topicRowOf('1.1'), 'facility')).toBe('100%');

		await page.getByRole('button', { name: /Energy/ }).click();
		await vi.waitFor(() =>
			expect(
				[...energy.querySelectorAll<HTMLElement>('[data-testid="topic-entry"]')].map(
					(row) => `${row.dataset.entryId} ${figureText(row, 'facility')}`
				)
			).toEqual(['q1 100%', 'q2 13%'])
		);

		// The open reading recomputes when a mark or an absent flag changes.
		marksheetStore().setMark('s1', 'q2', 4);
		await vi.waitFor(() => expect(figureText(topicRowOf('2.2'), 'facility')).toBe('81%'));
		marksheetStore().setStudentAbsent('s2', true);
		await vi.waitFor(() => expect(figureText(topicRowOf('2.2'), 'facility')).toBe('100%'));

		await page.getByRole('radio', { name: 'By AO' }).click();
		await vi.waitFor(() =>
			expect(topicRows().map((row) => row.dataset.topic)).toEqual(['AO2', 'AO1'])
		);
		expect(topicRows().every((row) => row.dataset.kind === 'ao')).toBe(true);
		expect(figureText(topicRowOf('AO2'), 'coverage')).toBe('6/8 marks · 2 questions');
	});

	it('pools topics over the open tier only, on that tier’s dot', async () => {
		seedTwoTierAnalysis();
		const screen = openAnalysisAt();
		const topicRow = () => {
			const row = screen.container.querySelector<HTMLElement>('[data-testid="topic-row"]');
			if (!row) throw new Error('no topic row');
			return row;
		};

		await page.getByRole('radio', { name: 'By topic' }).click();
		// Higher: 34 of 80, with Flo's off-tier mark left out.
		await vi.waitFor(() =>
			expect(figureText(topicRow(), 'coverage')).toBe('34/80 marks · 4 questions')
		);
		expect(trackValue(topicRow(), 'tier1')).toBe('43');
		expect(trackValue(topicRow(), 'tier2')).toBe('');

		await page.getByRole('radio', { name: 'Tier 2 · Foundation' }).click();
		await vi.waitFor(() => expect(figureText(topicRow(), 'facility')).toBe('60%'));
		expect(figureText(topicRow(), 'coverage')).toBe('36/60 marks · 4 questions');
		expect(trackValue(topicRow(), 'tier1')).toBe('');
		expect(trackValue(topicRow(), 'tier2')).toBe('60');
	});

	it('takes the back link to the marksheet', async () => {
		seedSingleTierAnalysis();
		openAnalysisAt();

		await page.getByRole('button', { name: 'Back to marksheet' }).click();
		expect(goto).toHaveBeenCalledWith('/marksheet');
	});

	it('names the analysis in the page title', async () => {
		seedSingleTierAnalysis();
		marksheetStore().load();
		marksheetStore().setClassName('10C1');
		openAnalysisAt();

		await vi.waitFor(() => expect(document.title).toBe('10C1 · Analysis · QLA'));
	});
});
