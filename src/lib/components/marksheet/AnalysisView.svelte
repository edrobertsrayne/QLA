<!--
	The whole sheet at once: every breakdown entry's facility, band and coverage,
	grouped so the questions to reteach come first and the secure ones are out of
	the way. There is no run step and no out-of-date state — the figures are read
	from the marksheet as it stands, so they are current the moment the view
	opens, and it is the view a teacher prints for a department meeting.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import {
		facilityPercent,
		GREEN_FROM,
		notScoredLabel,
		RED_BELOW,
		type EntryAnalysis,
		type RagBand
	} from '$lib/marksheet/analysis.js';
	import { entryName } from '$lib/marksheet/breakdown.js';
	import { downloadAnalysisPdf } from './analysis-pdf.js';
	import { exportAnalysisNow, marksheetStore } from '$lib/marksheet/index.js';
	import { toastPdfFailure } from '$lib/print-pdf.js';
	import { count, agree } from '$lib/prose.js';
	import { cn } from '$lib/utils.js';

	interface Props {
		/** The entry this view was opened at, scrolled to and outlined, or null for all of them. */
		highlight?: string | null;
		/** Back to the marksheet. */
		onBack: () => void;
	}

	let { highlight = null, onBack }: Props = $props();

	const store = marksheetStore();
	const analysis = $derived(store.analysis);
	const paper = $derived(store.document?.paper ?? null);
	/** Green is the band a teacher is least likely to act on, so it starts folded. */
	let greenOpen = $state(false);

	let view = $state<HTMLElement>();
	let makingPdf = $state(false);

	/** Green unfolded for the moment the page is read, so the file does not depend on what is open on screen. */
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

	/** The bands, each worst first, in the order a teacher reads them. */
	const sections = $derived.by(() => {
		const band = (wanted: RagBand) => analysis.ordered.filter((row) => row.band === wanted);
		return {
			red: band('red'),
			amber: band('amber'),
			green: band('green'),
			notScored: analysis.ordered.filter((row) => row.band === null)
		};
	});

	/** The paper and class the figures belong to, as far as they are named. */
	const heading = $derived(
		[paper?.label, paper?.className].filter((part) => part !== null && part !== '').join(' · ')
	);

	/**
	 * What the figures rest on: who was counted, what was left out of them, and
	 * how much of the class each one rests on. Every fact is stated, zeros
	 * included — "0 absent excluded" is as much a part of trusting the figure as
	 * any other, and a fact that appears only sometimes reads as one that was
	 * forgotten.
	 */
	const facts = $derived.by(() => {
		const { studentsCounted, absentExcluded, marksCounted, partMarked } = analysis.summary;
		return [
			`${count(studentsCounted, 'student')} counted`,
			`${absentExcluded} absent excluded`,
			`${count(marksCounted, 'mark')} counted`,
			`${partMarked} part-marked`
		].join(' · ');
	});

	/** The fixed band thresholds, as the whole percentages a heading states them in. */
	const redBelow = Math.round(RED_BELOW * 100);
	const greenFrom = Math.round(GREEN_FROM * 100);

	/** A mean mark as a teacher reads it: one decimal, and only where it has one. */
	function meanLabel(row: EntryAnalysis): string {
		return row.mean === null ? '' : `${Number(row.mean.toFixed(1))}`;
	}

	/** A field the paper or the model left empty reads as a gap, never as blank space. */
	function shown(value: string | null): string {
		return value === null || value.trim() === '' ? '—' : value;
	}

	/** The tints the rows carry: the band a teacher sees before reading the figure. */
	const TINT: Record<RagBand, string> = {
		red: 'bg-red-500/10',
		amber: 'bg-amber-400/15',
		green: 'bg-emerald-500/10'
	};

	/** What the view was opened at, unfolded if it must be, and brought into sight. */
	onMount(() => {
		if (highlight === null) return;
		if (sections.green.some((row) => row.entry.id === highlight)) greenOpen = true;
		void tick().then(() => {
			document.getElementById(rowId(highlight))?.scrollIntoView({ block: 'center' });
		});
	});

	function rowId(entryId: string): string {
		return `analysis-${entryId}`;
	}
</script>

{#snippet rowList(rows: EntryAnalysis[])}
	<!-- The band is in the section heading as well as the row, so a printed
	     greyscale copy still says which band each question is in. -->
	<Table.Root class="overflow-hidden rounded-lg border text-sm">
		<Table.Header>
			<Table.Row class="hover:bg-transparent">
				<Table.Head class="text-xs">Question</Table.Head>
				<Table.Head class="text-xs">Q</Table.Head>
				<Table.Head class="text-xs">Summary</Table.Head>
				<Table.Head class="text-right text-xs">Marks</Table.Head>
				<Table.Head class="text-xs">Spec point</Table.Head>
				<Table.Head class="text-xs">AO</Table.Head>
				<Table.Head class="text-xs">Facility</Table.Head>
				<Table.Head class="text-right text-xs">Marked</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each rows as row (row.entry.id)}
				{@const current = row.entry.id === highlight}
				<Table.Row
					id={rowId(row.entry.id)}
					data-testid="analysis-row"
					data-entry-id={row.entry.id}
					data-highlighted={current ? 'true' : undefined}
					class={cn(
						'scroll-mt-24',
						row.band !== null ? TINT[row.band] : 'text-muted-foreground',
						current && 'outline-2 -outline-offset-2 outline-primary'
					)}
				>
					<Table.Cell class="font-semibold tabular-nums">{entryName(row.entry)}</Table.Cell>
					<Table.Cell class="tabular-nums">{shown(row.entry.questionNumber)}</Table.Cell>
					<Table.Cell
						class="max-w-md truncate"
						title={row.entry.summary}
						data-testid="analysis-summary"
					>
						{shown(row.entry.summary)}
					</Table.Cell>
					<Table.Cell class="text-right tabular-nums">{row.entry.marks ?? '—'}</Table.Cell>
					<Table.Cell class="tabular-nums">{shown(row.entry.specPoint)}</Table.Cell>
					<Table.Cell>{row.entry.ao ?? '—'}</Table.Cell>
					<Table.Cell class="whitespace-nowrap">
						{#if row.facility !== null}
							<span class={cn('tabular-nums', row.coverage.partMarked && 'italic')}>
								{facilityPercent(row.facility)}%
								<span class="text-xs text-muted-foreground">{meanLabel(row)}/{row.entry.marks}</span
								>
							</span>
						{:else}
							<span class="text-xs">{notScoredLabel(row)}</span>
						{/if}
						{#if row.overMax > 0}
							<span class="ml-1 text-xs text-destructive">
								{row.overMax} above max — not counted
							</span>
						{/if}
					</Table.Cell>
					<Table.Cell
						class={cn(
							'text-right text-xs tabular-nums',
							row.coverage.partMarked && 'italic text-amber-700 dark:text-amber-300'
						)}
					>
						{row.coverage.marked}/{row.coverage.of}
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
{/snippet}

<div class="mx-auto max-w-5xl space-y-4" data-testid="analysis-view" bind:this={view}>
	<div class="flex flex-wrap items-center gap-2 print:hidden">
		<Button variant="ghost" size="sm" onclick={onBack}>
			<ArrowLeftIcon class="size-4" /> Back to marksheet
		</Button>
		<Button variant="outline" size="sm" class="ml-auto" onclick={() => window.print()}>
			<PrinterIcon class="size-4" /> Print
		</Button>
		<Button variant="outline" size="sm" disabled={makingPdf} onclick={() => void downloadPdf()}>
			<DownloadIcon class="size-4" />
			{makingPdf ? 'Preparing PDF…' : 'Download PDF'}
		</Button>
		<Button variant="outline" size="sm" onclick={exportAnalysisNow}>
			<DownloadIcon class="size-4" /> Download CSV
		</Button>
	</div>

	<header class="space-y-1">
		<h2 class="text-xl font-semibold">
			Question analysis{heading === '' ? '' : ` — ${heading}`}
		</h2>
		<p class="text-sm text-muted-foreground">{facts}</p>
		{#if analysis.summary.invalid > 0}
			<p class="text-xs text-destructive">
				{count(analysis.summary.invalid, 'entry', 'entries')}
				{agree(analysis.summary.invalid, 'carries', 'carry')}
				a mark above the available marks, which no figure counts.
			</p>
		{/if}
	</header>

	<section>
		<h3 class="mb-2 text-base font-semibold">
			Red — below {redBelow}%
			<span class="text-sm font-normal text-muted-foreground">({sections.red.length})</span>
		</h3>
		{#if sections.red.length > 0}
			{@render rowList(sections.red)}
		{:else}
			<p class="text-sm text-muted-foreground">None.</p>
		{/if}
	</section>

	<section>
		<h3 class="mb-2 text-base font-semibold">
			Amber — {redBelow}% to below {greenFrom}%
			<span class="text-sm font-normal text-muted-foreground">({sections.amber.length})</span>
		</h3>
		{#if sections.amber.length > 0}
			{@render rowList(sections.amber)}
		{:else}
			<p class="text-sm text-muted-foreground">None.</p>
		{/if}
	</section>

	<section>
		<Button
			variant="ghost"
			class="mb-2 h-auto gap-2 p-0 text-base font-semibold hover:bg-transparent"
			aria-expanded={greenOpen}
			onclick={() => (greenOpen = !greenOpen)}
		>
			<ChevronRightIcon class={cn('size-4', greenOpen && 'rotate-90')} />
			Green — {greenFrom}% and above
			<span class="text-sm font-normal text-muted-foreground">({sections.green.length})</span>
		</Button>
		{#if greenOpen}
			{@render rowList(sections.green)}
		{/if}
	</section>

	<section>
		<h3 class="mb-2 text-base font-semibold">Not scored ({sections.notScored.length})</h3>
		{#if sections.notScored.length > 0}
			{@render rowList(sections.notScored)}
		{:else}
			<p class="text-sm text-muted-foreground">None.</p>
		{/if}
	</section>
</div>
