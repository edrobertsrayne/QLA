<!--
	PROTOTYPE — Variant C: analysing is a deliberate step out of the marksheet. "Analyse marks" in the
	marksheet toolbar swaps the page to a print-friendly report where the band is the *section*, not a
	colour: Red / Amber / Green / Not scored, each worst-first. "Back to marks" returns to the grid.
-->
<script lang="ts">
	import type { GridEngine } from '$lib/prototypes/marksheet-grid/grid-state.svelte.js';
	import {
		describeSnapshot,
		worstFirst,
		type AnalysisState,
		type Band
	} from '$lib/prototypes/analysis-view/analysis.svelte.js';
	import { Button } from '$lib/components/ui/button';
	import MarksGrid from './MarksGrid.svelte';
	import AnalysisTable from './AnalysisTable.svelte';
	import RagChip from './RagChip.svelte';
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import RotateCwIcon from '@lucide/svelte/icons/rotate-cw';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';

	let { engine, analysis }: { engine: GridEngine; analysis: AnalysisState } = $props();

	let view = $state<'marks' | 'report'>('marks');
	let greenOpen = $state(false);

	function analyse() {
		if (!analysis.snapshot || analysis.stale) analysis.run();
		view = 'report';
	}

	const sections = $derived.by(() => {
		const all = analysis.snapshot ? worstFirst(analysis.snapshot.results) : [];
		const by = (b: Band | null) => all.filter((r) => analysis.band(r) === b);
		return { red: by('red'), amber: by('amber'), green: by('green'), none: by(null) };
	});
	const banded = $derived([
		{ band: 'red' as const, title: 'Red — the class struggled', rows: sections.red },
		{ band: 'amber' as const, title: 'Amber — mixed', rows: sections.amber }
	]);
	const stale = $derived(analysis.stale && analysis.stalePolicy !== 'clear');

	$effect(() => {
		// Auto-clear leaves the report with nothing to show: fall back to the marksheet.
		if (view === 'report' && !analysis.snapshot && !analysis.running) view = 'marks';
	});
</script>

{#if view === 'marks'}
	<div class="mx-4 mt-3 mb-2 flex items-center gap-3">
		<span class="text-sm font-medium">Marksheet</span>
		{#if stale}
			<span class="text-xs text-amber-700">Marks changed since the last analysis</span>
		{:else if analysis.snapshot}
			<button
				type="button"
				class="text-xs text-muted-foreground underline"
				onclick={() => (view = 'report')}
				>Last analysis: {analysis.snapshot.at.toLocaleTimeString([], {
					hour: '2-digit',
					minute: '2-digit'
				})}</button
			>
		{/if}
		<Button class="ml-auto" onclick={analyse}>
			<ChartColumnIcon />
			{analysis.snapshot && !stale ? 'View analysis' : stale ? 'Re-analyse marks' : 'Analyse marks'}
		</Button>
	</div>
	<MarksGrid {engine} />
{:else}
	<div class="mx-auto max-w-5xl px-4 pt-4">
		<div class="mb-4 flex flex-wrap items-center gap-2 print:hidden">
			<Button variant="ghost" size="sm" onclick={() => (view = 'marks')}
				><ArrowLeftIcon /> Back to marks</Button
			>
			<Button variant="outline" size="sm" class="ml-auto" onclick={() => window.print()}
				><PrinterIcon /> Print</Button
			>
			<Button
				variant={stale ? 'default' : 'outline'}
				size="sm"
				disabled={analysis.running}
				onclick={() => analysis.run()}
				><RotateCwIcon class={analysis.running ? 'animate-spin' : ''} /> Re-run</Button
			>
		</div>

		<h2 class="text-xl font-semibold">Question analysis — Year 11 Biology Paper 1 · 11B</h2>
		{#if analysis.snapshot}
			<p class="mt-1 text-sm text-muted-foreground">{describeSnapshot(analysis.snapshot)}</p>
			<p class="mt-0.5 text-xs text-muted-foreground">
				Facility = mean mark ÷ max. Red below {Math.round(analysis.thresholds.red * 100)}%, green
				from {Math.round(analysis.thresholds.green * 100)}%.
			</p>
		{/if}

		{#if stale && analysis.stalePolicy === 'badge'}
			<div
				class="mt-3 rounded-md border border-amber-500 bg-amber-400/10 px-3 py-2 text-sm text-amber-900"
			>
				Out of date: marks have changed since this was run.
			</div>
		{/if}

		<div
			class={`mt-5 flex flex-col gap-6 ${stale && analysis.stalePolicy === 'prompt' ? 'pointer-events-none opacity-30' : ''}`}
		>
			{#each banded as { band, title, rows } (band)}
				<section>
					<h3 class="mb-2 flex items-center gap-2 text-base font-semibold">
						<RagChip {band} />
						{title} <span class="text-sm font-normal text-muted-foreground">({rows.length})</span>
					</h3>
					{#if rows.length}
						<div class="overflow-hidden rounded-lg border border-border">
							<AnalysisTable {analysis} results={rows} />
						</div>
					{:else}
						<p class="text-sm text-muted-foreground">None.</p>
					{/if}
				</section>
			{/each}
			<section>
				<button
					type="button"
					class="mb-2 flex items-center gap-2 text-base font-semibold"
					onclick={() => (greenOpen = !greenOpen)}
				>
					<ChevronRightIcon class={`size-4 transition-transform ${greenOpen ? 'rotate-90' : ''}`} />
					<RagChip band="green" /> Green — secure
					<span class="text-sm font-normal text-muted-foreground">({sections.green.length})</span>
				</button>
				{#if greenOpen}
					<div class="overflow-hidden rounded-lg border border-border">
						<AnalysisTable {analysis} results={sections.green} />
					</div>
				{/if}
			</section>
			{#if sections.none.length}
				<section>
					<h3 class="mb-2 text-base font-semibold text-muted-foreground">
						Not scored ({sections.none.length})
					</h3>
					<div class="overflow-hidden rounded-lg border border-border">
						<AnalysisTable {analysis} results={sections.none} />
					</div>
				</section>
			{/if}
		</div>

		{#if stale && analysis.stalePolicy === 'prompt'}
			<div
				class="fixed top-1/3 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-3 rounded-lg border border-border bg-card p-6 shadow-lg"
			>
				<p class="text-sm font-medium">Marks have changed since this analysis was run.</p>
				<Button onclick={() => analysis.run()}><RotateCwIcon /> Re-run analysis</Button>
			</div>
		{/if}
	</div>
{/if}
