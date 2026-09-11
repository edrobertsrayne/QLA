<!--
	PROTOTYPE — Variant D (round 2, from the user's round-1 verdict): "C's approach with the View
	Analysis button … a Generate / Regenerate button in the same place depending on state … once run,
	keep B's quick visualisation on the marksheet, and C's layout for the detailed analysis."
	One toolbar slot cycles Generate → View → Regenerate; the facility row appears under the grid only
	once an analysis exists; clicking a facility cell opens the report at that question.
-->
<script lang="ts">
	import { tick } from 'svelte';
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
	import FacilityRow from './FacilityRow.svelte';
	import RagChip from './RagChip.svelte';
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import RotateCwIcon from '@lucide/svelte/icons/rotate-cw';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';

	let { engine, analysis }: { engine: GridEngine; analysis: AnalysisState } = $props();

	let view = $state<'marks' | 'report'>('marks');
	let greenOpen = $state(false);
	let highlight = $state<string | null>(null);

	const stale = $derived(analysis.stale && analysis.stalePolicy !== 'clear');
	const phase = $derived(!analysis.snapshot ? 'none' : stale ? 'stale' : 'fresh');

	const sections = $derived.by(() => {
		const all = analysis.snapshot ? worstFirst(analysis.snapshot.results) : [];
		const by = (b: Band | null) => all.filter((r) => analysis.band(r) === b);
		return { red: by('red'), amber: by('amber'), green: by('green'), none: by(null) };
	});
	const banded = $derived([
		{ band: 'red' as const, title: 'Red — the class struggled', rows: sections.red },
		{ band: 'amber' as const, title: 'Amber — mixed', rows: sections.amber }
	]);
	const hardest = $derived(sections.red.slice(0, 8));

	function generate() {
		analysis.run(() => {
			if (analysis.afterGenerate === 'open-report') openReport(null);
		});
	}

	async function openReport(leafId: string | null) {
		highlight = leafId;
		if (leafId && sections.green.some((r) => r.leaf.id === leafId)) greenOpen = true;
		view = 'report';
		await tick();
		if (leafId)
			document.getElementById(`analysis-leaf-${leafId}`)?.scrollIntoView({ block: 'center' });
		else window.scrollTo({ top: 0 });
	}

	function time(d: Date) {
		return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	$effect(() => {
		if (view === 'report' && !analysis.snapshot && !analysis.running) view = 'marks';
	});
</script>

{#if view === 'marks'}
	<div class="mx-4 mt-3 mb-2 flex flex-wrap items-center gap-3">
		<span class="text-sm font-medium">Marksheet</span>
		{#if phase === 'fresh' && analysis.snapshot}
			<span class="text-xs text-muted-foreground"
				>Analysis generated at {time(analysis.snapshot.at)}</span
			>
		{:else if phase === 'stale'}
			<span
				class="rounded-full border border-amber-500 bg-amber-400/15 px-2 py-0.5 text-xs font-medium text-amber-800"
				>Marks changed since the analysis was generated</span
			>
		{/if}
		{#if analysis.hardestStrip && analysis.snapshot && hardest.length}
			<span class={`flex flex-wrap items-center gap-1.5 text-xs ${stale ? 'opacity-40' : ''}`}>
				<span class="font-medium">Hardest:</span>
				{#each hardest as r (r.leaf.id)}
					<button
						type="button"
						class="rounded border border-red-600/50 bg-red-500/10 px-1.5 py-0.5 tabular-nums hover:bg-red-500/20"
						onclick={() => openReport(r.leaf.id)}
						>{r.leaf.id}
						<span class="text-muted-foreground">{Math.round(r.facility! * 100)}%</span></button
					>
				{/each}
			</span>
		{/if}
		<div class="ml-auto flex items-center gap-2">
			{#if phase === 'stale'}
				<Button variant="ghost" size="sm" onclick={() => openReport(null)}>View previous</Button>
			{/if}
			{#if phase === 'none'}
				<Button disabled={analysis.running} onclick={generate}>
					<SparklesIcon class={analysis.running ? 'animate-pulse' : ''} /> Generate analysis
				</Button>
			{:else if phase === 'fresh'}
				<Button onclick={() => openReport(null)}><ChartColumnIcon /> View analysis</Button>
			{:else}
				<Button disabled={analysis.running} onclick={generate}>
					<RotateCwIcon class={analysis.running ? 'animate-spin' : ''} /> Regenerate analysis
				</Button>
			{/if}
		</div>
	</div>
	<MarksGrid {engine}>
		{#snippet footer({ groupStarts })}
			{#if analysis.snapshot}
				<FacilityRow
					{engine}
					{analysis}
					{groupStarts}
					dim={stale}
					onSelect={(id) => openReport(id)}
				/>
			{/if}
		{/snippet}
	</MarksGrid>
{:else}
	<div class="mx-auto max-w-5xl px-4 pt-4">
		<div class="mb-4 flex flex-wrap items-center gap-2 print:hidden">
			<Button variant="ghost" size="sm" onclick={() => (view = 'marks')}
				><ArrowLeftIcon /> Back to marksheet</Button
			>
			<Button variant="outline" size="sm" class="ml-auto" onclick={() => window.print()}
				><PrinterIcon /> Print</Button
			>
			<Button
				variant={stale ? 'default' : 'outline'}
				size="sm"
				disabled={analysis.running}
				onclick={() => analysis.run()}
				><RotateCwIcon class={analysis.running ? 'animate-spin' : ''} /> Regenerate analysis</Button
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
				Out of date: marks have changed since this was generated.
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
							<AnalysisTable {analysis} results={rows} {highlight} />
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
						<AnalysisTable {analysis} results={sections.green} {highlight} />
					</div>
				{/if}
			</section>
			{#if sections.none.length}
				<section>
					<h3 class="mb-2 text-base font-semibold text-muted-foreground">
						Not scored ({sections.none.length})
					</h3>
					<div class="overflow-hidden rounded-lg border border-border">
						<AnalysisTable {analysis} results={sections.none} {highlight} />
					</div>
				</section>
			{/if}
		</div>

		{#if stale && analysis.stalePolicy === 'prompt'}
			<div
				class="fixed top-1/3 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-3 rounded-lg border border-border bg-card p-6 shadow-lg"
			>
				<p class="text-sm font-medium">Marks have changed since this analysis was generated.</p>
				<Button onclick={() => analysis.run()}><RotateCwIcon /> Regenerate analysis</Button>
			</div>
		{/if}
	</div>
{/if}
