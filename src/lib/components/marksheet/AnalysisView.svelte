<!--
	The whole sheet at once, as track charts: one tab per tier and, when pairs
	exist, a Common questions tab. Every figure is read from the marksheet as it
	stands, so there is no run step and no out-of-date state. A tier tab keeps
	today's band sections, green folded; the common tab compares each pair on
	one track. Print and the PDF render the open tab, green unfolded; the CSV
	follows the tab.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import { Button } from '$lib/components/ui/button';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { analyseCommonQuestions, sortCommonQuestions } from '$lib/marksheet/analysis.js';
	import type { AnalysisTab } from './analysis-tab.js';
	import type { TierIndex } from '$lib/marksheet/document.js';
	import { exportAnalysisNow, marksheetStore } from '$lib/marksheet/index.js';
	import { toastPdfFailure } from '$lib/print-pdf.js';
	import { count, agree } from '$lib/prose.js';
	import CommonQuestions from './CommonQuestions.svelte';
	import TierAnalysis from './TierAnalysis.svelte';
	import { downloadAnalysisPdf } from './analysis-pdf.js';

	interface Props {
		/** The tab the URL asked for; the document decides whether it can be opened. */
		tab?: AnalysisTab | null;
		/** The entry this view was opened at, scrolled to and outlined, or null for all of them. */
		highlight?: string | null;
		/** Back to the marksheet. */
		onBack: () => void;
	}

	let { tab: requestedTab = null, highlight = null, onBack }: Props = $props();

	const store = marksheetStore();
	const twoTiers = $derived(store.tierCount === 2);

	/** Every pair's figures, in Tier 1's paper order; the tab count and sort read from them. */
	const allCommon = $derived.by(() => {
		const document = store.document;
		return document ? analyseCommonQuestions(document) : [];
	});
	const hasPairs = $derived(allCommon.length > 0);

	/** The tab the teacher last chose; until then, the URL's tab decides. */
	let chosen = $state<string | null>(null);

	/** The URL's tier as a tab this document has, falling back to Tier 1's chart. */
	function initialSelection(tab: AnalysisTab | null): string {
		if (tab === 'common' && store.tierCount === 2 && store.commonQuestions.length > 0)
			return 'common';
		if (tab === 1 && store.tierCount === 2) return '1';
		return '0';
	}

	const selected = $derived(chosen ?? initialSelection(requestedTab));
	/** The Common tab is absent with no pairs, so the view falls back to Tier 1's chart. */
	const openTab = $derived<AnalysisTab>(
		!twoTiers ? 0 : selected === 'common' && hasPairs ? 'common' : selected === '1' ? 1 : 0
	);
	/** The open tier, or null while the common tab is open. */
	const openTier = $derived(openTab === 'common' ? null : openTab);

	/** Green is the band a teacher is least likely to act on, so it starts folded. */
	let greenOpen = $state(false);
	/** The common questions' order: the most revealing pairs first. */
	let commonSort = $state('gap');

	let view = $state<HTMLElement>();
	/** The element the PDF renders: the whole view, tabs and legend included. */
	const captureView: Attachment<HTMLElement> = (node) => {
		view = node;
	};
	let makingPdf = $state(false);

	/** One tier's figures, or null while the common tab is open. */
	const tierAnalysis = $derived(openTier === null ? null : store.analysisOf(openTier));
	const tierRows = $derived(tierAnalysis?.ordered ?? []);
	const commonRows = $derived(
		sortCommonQuestions(
			allCommon,
			commonSort === 'pooled' || commonSort === 'paper' ? commonSort : 'gap'
		)
	);

	/** The tier name as printed, or null when there is none to show. */
	function printedName(tier: TierIndex): string | null {
		const name = store.tiers[tier]?.tierName?.trim() ?? '';
		return name === '' ? null : name;
	}

	/** A tier named the way the marksheet names it, falling back to its number. */
	function tierTitle(tier: TierIndex): string {
		return printedName(tier) ?? `Tier ${tier + 1}`;
	}

	function tierTabLabel(tier: TierIndex): string {
		const name = printedName(tier);
		return name === null ? `Tier ${tier + 1}` : `Tier ${tier + 1} · ${name}`;
	}

	/** A tier's initial, as coverage and the partner chip shorten it. */
	function tierShort(tier: TierIndex): string {
		return printedName(tier)?.charAt(0).toUpperCase() ?? `T${tier + 1}`;
	}

	/** The paper and class the figures belong to, as far as they are named. */
	const heading = $derived(
		[store.label, store.className].filter((part) => part !== null && part !== '').join(' · ')
	);

	const headingText = $derived.by(() => {
		if (openTier === null) return `Common questions — ${tierTitle(0)} and ${tierTitle(1)}`;
		if (twoTiers) return `Question analysis — ${tierTabLabel(openTier)}`;
		return 'Question analysis';
	});

	/**
	 * What the figures rest on: who was counted, what was left out of them, and
	 * how much of the class each one rests on. Every fact is stated, zeros
	 * included — "0 absent excluded" is as much a part of trusting the figure as
	 * any other, and a fact that appears only sometimes reads as one that was
	 * forgotten.
	 */
	const tierFacts = $derived.by(() => {
		if (tierAnalysis === null) return '';
		const { studentsCounted, absentExcluded, marksCounted, partMarked } = tierAnalysis.summary;
		return [
			`${count(studentsCounted, 'student')} counted`,
			`${absentExcluded} absent excluded`,
			`${count(marksCounted, 'mark')} counted`,
			`${partMarked} part-marked`
		].join(' · ');
	});

	const commonFacts = $derived.by(() => {
		const tier1Present = store.studentsOf(0).filter((student) => !student.absent).length;
		const tier2Present = store.studentsOf(1).filter((student) => !student.absent).length;
		const absentExcluded = store.students.filter(
			(student) => student.tier !== null && student.absent
		).length;
		const marks = allCommon.reduce((total, row) => total + (row.tier1.entry.marks ?? 0), 0);
		return [
			count(allCommon.length, 'common question'),
			`${marks} marks`,
			`${tier1Present} ${tierTitle(0)} + ${tier2Present} ${tierTitle(1)} students counted`,
			`${absentExcluded} absent excluded`
		].join(' · ');
	});

	/**
	 * Green unfolded for the moment the page is read, so the file does not
	 * depend on what is open on screen. The common tab has nothing folded, so
	 * unfolding it changes nothing there.
	 */
	async function unfoldGreen(): Promise<() => void> {
		const wasOpen = greenOpen;
		greenOpen = true;
		await tick();
		return () => (greenOpen = wasOpen);
	}

	async function downloadPdf(): Promise<void> {
		const document = store.document;
		const element = view;
		if (!element || !document) return;
		makingPdf = true;
		try {
			await toastPdfFailure(() => downloadAnalysisPdf(element, document, new Date(), unfoldGreen));
		} finally {
			makingPdf = false;
		}
	}

	/** A print holds every band, as a paper copy has no fold to open. */
	async function printPage(): Promise<void> {
		const restore = await unfoldGreen();
		try {
			window.print();
		} finally {
			restore();
		}
	}

	/** The row the view was opened at: its entry's row, or on the common tab its pair. */
	function highlightTarget(): string | null {
		if (highlight === null) return null;
		if (openTier === null) {
			const onTier1 = commonRows.find((row) => row.tier1.entry.id === highlight);
			if (onTier1) return `analysis-pair-${onTier1.tier1.entry.id}`;
			const onTier2 = commonRows.find((row) => row.tier2.entry.id === highlight);
			return onTier2 ? `analysis-pair-${onTier2.tier1.entry.id}` : null;
		}
		const row = tierRows.find((candidate) => candidate.entry.id === highlight);
		return row === undefined ? null : `analysis-${row.entry.id}`;
	}

	/** What the view was opened at, unfolded if it must be, and brought into sight. */
	onMount(() => {
		if (openTier !== null && highlight !== null) {
			const row = tierRows.find((candidate) => candidate.entry.id === highlight);
			if (row?.band === 'green') greenOpen = true;
		}
		void tick().then(() => {
			const id = highlightTarget();
			if (id !== null) document.getElementById(id)?.scrollIntoView({ block: 'center' });
		});
	});
</script>

<div class="mx-auto max-w-5xl space-y-4" data-testid="analysis-view" {@attach captureView}>
	<div class="flex flex-wrap items-center gap-2 print:hidden">
		<Button variant="ghost" size="sm" onclick={onBack}>
			<ArrowLeftIcon class="size-4" /> Back to marksheet
		</Button>
		<Button variant="outline" size="sm" class="ml-auto" onclick={() => void printPage()}>
			<PrinterIcon class="size-4" /> Print
		</Button>
		<Button variant="outline" size="sm" disabled={makingPdf} onclick={() => void downloadPdf()}>
			<DownloadIcon class="size-4" />
			{makingPdf ? 'Preparing PDF…' : 'Download PDF'}
		</Button>
		<Button variant="outline" size="sm" onclick={() => exportAnalysisNow(openTab)}>
			<DownloadIcon class="size-4" /> Download CSV
		</Button>
	</div>

	<div class="flex flex-wrap items-center gap-3 print:hidden">
		{#if twoTiers}
			<ToggleGroup.Root
				type="single"
				variant="outline"
				value={selected}
				onValueChange={(value) => {
					if (value === '0' || value === '1' || value === 'common') chosen = value;
				}}
				class="w-fit"
				data-testid="analysis-tabs"
			>
				{#each [0, 1] as const as tier (tier)}
					<ToggleGroup.Item value={String(tier)} class="px-4">
						{tierTabLabel(tier)}
					</ToggleGroup.Item>
				{/each}
				{#if hasPairs}
					<ToggleGroup.Item value="common" class="px-4">
						Common questions <span class="text-muted-foreground tabular-nums"
							>({allCommon.length})</span
						>
					</ToggleGroup.Item>
				{/if}
			</ToggleGroup.Root>
		{/if}

		{#if openTier === null}
			<span class="ml-auto text-sm text-muted-foreground">Sort</span>
			<ToggleGroup.Root type="single" variant="outline" size="sm" bind:value={commonSort}>
				<ToggleGroup.Item value="gap" class="px-3">Biggest gap</ToggleGroup.Item>
				<ToggleGroup.Item value="pooled" class="px-3">Pooled, worst first</ToggleGroup.Item>
				<ToggleGroup.Item value="paper" class="px-3">Tier 1 paper order</ToggleGroup.Item>
			</ToggleGroup.Root>
		{/if}
	</div>

	<header class="space-y-1">
		<h2 class="text-xl font-semibold">
			{headingText}{heading === '' ? '' : ` — ${heading}`}
		</h2>
		<p class="text-sm text-muted-foreground">{openTier === null ? commonFacts : tierFacts}</p>
		{#if openTier !== null && tierAnalysis !== null && tierAnalysis.summary.invalid > 0}
			<p class="text-xs text-destructive">
				{count(tierAnalysis.summary.invalid, 'entry', 'entries')}
				{agree(tierAnalysis.summary.invalid, 'carries', 'carry')}
				a mark above the available marks, which no figure counts.
			</p>
		{/if}
		<div class="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
			{#if openTier === null}
				<span class="inline-flex items-center gap-1.5">
					<span class="size-3 rounded-full bg-foreground"></span>{tierTitle(0)}
				</span>
				<span class="inline-flex items-center gap-1.5">
					<span class="size-3 rounded-full border-2 border-foreground bg-background"></span>
					{tierTitle(1)}
				</span>
				<span class="inline-flex items-center gap-1.5">
					<span class="h-3.5 w-1 rounded-sm bg-primary"></span>Pooled (both tiers' students)
				</span>
				<span>Gap = {tierTitle(0)} − {tierTitle(1)}, points.</span>
			{:else if twoTiers}
				<span class="inline-flex items-center gap-1.5">
					<span class="size-3 rounded-full bg-foreground"></span>{tierTitle(openTier)}
				</span>
				{#if hasPairs}
					<span class="inline-flex items-center gap-1.5">
						<span class="size-3 rounded-full border-2 border-foreground bg-background opacity-40">
						</span>
						{tierTitle(openTier === 0 ? 1 : 0)}, on common questions
					</span>
					<span class="inline-flex items-center gap-1.5">
						<span class="h-3.5 w-1 rounded-sm bg-primary"></span>Pooled
					</span>
				{/if}
			{/if}
			<span>Faded / dashed = part-marked.</span>
		</div>
	</header>

	{#if openTier === null}
		<CommonQuestions
			rows={commonRows}
			{highlight}
			tier1Short={tierShort(0)}
			tier2Short={tierShort(1)}
		/>
	{:else}
		<TierAnalysis
			rows={tierRows}
			bind:greenOpen
			{highlight}
			tier={openTier}
			tierShort={twoTiers ? tierShort(openTier) : null}
			otherShort={twoTiers ? tierShort(openTier === 0 ? 1 : 0) : ''}
			otherTierName={twoTiers ? tierTitle(openTier === 0 ? 1 : 0) : ''}
			pairs={allCommon}
		/>
	{/if}
</div>
