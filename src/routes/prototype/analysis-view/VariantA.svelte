<!--
	PROTOTYPE — Variant A: the analysis lives on its own tab beside the marks grid. The grid stays
	uncoloured; the Analysis tab is a flat worst-first table with the run button in its toolbar.
-->
<script lang="ts">
	import type { GridEngine } from '$lib/prototypes/marksheet-grid/grid-state.svelte.js';
	import {
		describeSnapshot,
		worstFirst,
		type AnalysisState
	} from '$lib/prototypes/analysis-view/analysis.svelte.js';
	import { Button } from '$lib/components/ui/button';
	import MarksGrid from './MarksGrid.svelte';
	import AnalysisTable from './AnalysisTable.svelte';
	import PlayIcon from '@lucide/svelte/icons/play';
	import RotateCwIcon from '@lucide/svelte/icons/rotate-cw';
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';

	let { engine, analysis }: { engine: GridEngine; analysis: AnalysisState } = $props();

	let tab = $state<'marks' | 'analysis'>('marks');

	function openAnalysis() {
		tab = 'analysis';
		if (analysis.trigger === 'on-open' && (!analysis.snapshot || analysis.stale)) analysis.run();
	}

	const results = $derived(analysis.snapshot ? worstFirst(analysis.snapshot.results) : []);
	const progress = $derived(analysis.liveProgress);
</script>

<div class="flex items-end gap-1 border-b border-border px-4 pt-3">
	<button
		type="button"
		class={`rounded-t-md border border-b-0 px-4 py-1.5 text-sm ${tab === 'marks' ? 'border-border bg-background font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
		onclick={() => (tab = 'marks')}>Marks</button
	>
	<button
		type="button"
		class={`flex items-center gap-1.5 rounded-t-md border border-b-0 px-4 py-1.5 text-sm ${tab === 'analysis' ? 'border-border bg-background font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
		onclick={openAnalysis}
	>
		Analysis
		{#if analysis.stale && analysis.stalePolicy !== 'clear'}
			<span class="size-2 rounded-full bg-amber-500" title="Out of date"></span>
		{/if}
	</button>
</div>

{#if tab === 'marks'}
	<div class="pt-3"><MarksGrid {engine} /></div>
{:else}
	<div class="mx-4 mt-3">
		{#if analysis.snapshot}
			<div class="mb-2 flex flex-wrap items-center gap-3">
				<span class="text-xs text-muted-foreground">{describeSnapshot(analysis.snapshot)}</span>
				{#if analysis.stale && analysis.stalePolicy === 'badge'}
					<span
						class="rounded-full border border-amber-500 bg-amber-400/15 px-2 py-0.5 text-xs font-medium text-amber-800"
						>Out of date — marks changed since this run</span
					>
				{/if}
				<Button
					class="ml-auto"
					size="sm"
					variant={analysis.stale ? 'default' : 'outline'}
					disabled={analysis.running}
					onclick={() => analysis.run()}
				>
					<RotateCwIcon class={analysis.running ? 'animate-spin' : ''} /> Re-run analysis
				</Button>
			</div>
			<div class="relative max-h-[calc(100vh-13rem)] overflow-auto rounded-lg border border-border">
				<div class={analysis.stale && analysis.stalePolicy === 'prompt' ? 'opacity-30' : ''}>
					<AnalysisTable {analysis} {results} />
				</div>
				{#if analysis.stale && analysis.stalePolicy === 'prompt'}
					<div class="absolute inset-0 flex items-start justify-center pt-24">
						<div
							class="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-6 shadow-lg"
						>
							<p class="text-sm font-medium">Marks have changed since this analysis was run.</p>
							<Button onclick={() => analysis.run()}><RotateCwIcon /> Re-run analysis</Button>
						</div>
					</div>
				{/if}
			</div>
		{:else}
			<div
				class="mx-auto mt-10 flex max-w-lg flex-col items-center gap-4 rounded-lg border border-dashed border-border p-10 text-center"
			>
				<ChartColumnIcon class="size-10 text-muted-foreground" />
				<div>
					<p class="font-medium">See which questions the class found hardest</p>
					<p class="mt-1 text-sm text-muted-foreground">
						Uses the marks entered so far ({progress.entered} of {progress.total}). Blank cells are
						skipped and absent students are left out.
					</p>
				</div>
				<Button disabled={analysis.running} onclick={() => analysis.run()}>
					<PlayIcon /> Run analysis
				</Button>
			</div>
		{/if}
	</div>
{/if}
