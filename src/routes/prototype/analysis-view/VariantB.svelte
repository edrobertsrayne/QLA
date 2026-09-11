<!--
	PROTOTYPE — Variant B: no second surface. The analysis is a facility row pinned to the bottom of the
	grid itself, one cell per leaf, with the run button in the row's frozen label cell and a "hardest
	questions" strip above the grid standing in for worst-first ordering (columns can't be re-sorted).
-->
<script lang="ts">
	import type { GridEngine } from '$lib/prototypes/marksheet-grid/grid-state.svelte.js';
	import {
		describeSnapshot,
		worstFirst,
		type AnalysisState,
		type LeafResult
	} from '$lib/prototypes/analysis-view/analysis.svelte.js';
	import { Button } from '$lib/components/ui/button';
	import MarksGrid from './MarksGrid.svelte';
	import RagChip from './RagChip.svelte';
	import PlayIcon from '@lucide/svelte/icons/play';
	import RotateCwIcon from '@lucide/svelte/icons/rotate-cw';

	let { engine, analysis }: { engine: GridEngine; analysis: AnalysisState } = $props();

	const byId = $derived(
		new Map((analysis.snapshot?.results ?? []).map((r) => [r.leaf.id, r] as const))
	);
	const hardest = $derived(
		analysis.snapshot
			? worstFirst(analysis.snapshot.results)
					.filter((r) => analysis.band(r) === 'red')
					.slice(0, 8)
			: []
	);
	const dim = $derived(analysis.stale && analysis.stalePolicy !== 'clear');

	const tint = { red: 'bg-red-500/25', amber: 'bg-amber-400/30', green: 'bg-emerald-500/20' };
	const glyph = { red: '▼', amber: '–', green: '✓' };

	function jumpTo(leafId: string) {
		const col = engine.leaves.findIndex((l) => l.id === leafId);
		if (col >= 0) {
			engine.cursor = { row: engine.cursor.row, col };
			engine.focusProxy();
		}
	}

	function cellTitle(r: LeafResult) {
		if (r.facility == null) return `${r.leaf.id}: ${r.reason === 'no-max' ? 'max unknown' : 'not marked'}`;
		return `${r.leaf.id} — ${r.leaf.summary}\nFacility ${Math.round(r.facility * 100)}% (mean ${r.mean!.toFixed(1)}/${r.leaf.marks})\nSpec point ${r.leaf.specPoint ?? '—'} · ${r.leaf.ao ?? 'AO —'}\nMarked ${r.n}/${r.of}${r.provisional ? ' — provisional' : ''}`;
	}
</script>

<div class="mx-4 mt-3 mb-2 flex min-h-8 flex-wrap items-center gap-2 text-xs">
	{#if analysis.snapshot}
		<span class="text-muted-foreground">{describeSnapshot(analysis.snapshot)}</span>
		{#if dim}
			<span
				class="rounded-full border border-amber-500 bg-amber-400/15 px-2 py-0.5 font-medium text-amber-800"
				>Out of date</span
			>
		{/if}
		<span class="ml-4 font-medium">Hardest:</span>
		{#each hardest as r (r.leaf.id)}
			<button
				type="button"
				class="rounded border border-red-600/50 bg-red-500/10 px-1.5 py-0.5 tabular-nums hover:bg-red-500/20"
				onclick={() => jumpTo(r.leaf.id)}
				>{r.leaf.id} <span class="text-muted-foreground">{Math.round(r.facility! * 100)}%</span></button
			>
		{:else}
			<span class="text-muted-foreground">no red questions</span>
		{/each}
	{:else}
		<span class="text-muted-foreground"
			>Run the analysis to add a facility row along the bottom of the grid.</span
		>
	{/if}
</div>

<MarksGrid {engine}>
	{#snippet footer({ groupStarts })}
		<tr class="border-t-2 border-foreground/40">
			<td
				class="sticky left-0 z-10 w-44 max-w-44 min-w-44 border-b border-border bg-card px-1.5 py-1"
			>
				{#if !analysis.snapshot}
					<Button size="sm" class="h-7 w-full" disabled={analysis.running} onclick={() => analysis.run()}>
						<PlayIcon /> Run analysis
					</Button>
				{:else}
					<div class="flex items-center justify-between gap-1">
						<span class="text-xs font-semibold">Facility</span>
						<Button
							size="sm"
							variant={dim ? 'default' : 'ghost'}
							class="h-6 px-2 text-xs"
							disabled={analysis.running}
							onclick={() => analysis.run()}
						>
							<RotateCwIcon class={analysis.running ? 'animate-spin' : ''} />
							{dim ? 'Re-run' : ''}
						</Button>
					</div>
				{/if}
			</td>
			<td class="sticky left-44 z-10 w-14 min-w-14 border-b border-l border-border bg-card"></td>
			{#each engine.leaves as leaf, col (leaf.id)}
				{@const r = byId.get(leaf.id)}
				{@const band = r ? analysis.band(r) : null}
				<td
					class={`w-10 min-w-10 border-b border-l border-border bg-card px-0 py-1 text-center text-[11px] leading-tight tabular-nums ${groupStarts.has(col) ? 'border-l-2 border-l-foreground/25' : ''}`}
					title={r ? cellTitle(r) : undefined}
				>
					{#if r && r.facility != null}
						<div
							class={`${dim ? 'opacity-35' : ''} ${analysis.rag === 'tint' || analysis.rag === 'chip' ? (band ? tint[band] : '') : ''} ${r.provisional ? 'italic outline-1 -outline-offset-2 outline-amber-600 outline-dashed' : ''} mx-0.5 rounded-sm py-0.5`}
						>
							{#if analysis.rag === 'bar'}
								<div class="mx-auto flex h-6 w-3 items-end rounded-sm bg-muted">
									<div
										class={`w-full rounded-sm ${band === 'red' ? 'bg-red-500' : band === 'amber' ? 'bg-amber-400' : 'bg-emerald-600'}`}
										style:height={`${r.facility * 100}%`}
									></div>
								</div>
							{:else if analysis.rag === 'chip' && band}
								<div class="font-bold">{glyph[band]}</div>
							{/if}
							<div class="font-semibold">{Math.round(r.facility * 100)}</div>
						</div>
					{:else if r}
						<span class="text-muted-foreground">{r.reason === 'no-max' ? '?' : '—'}</span>
					{/if}
				</td>
			{/each}
		</tr>
		{#if analysis.snapshot && analysis.columns.n}
			<tr>
				<td
					class="sticky left-0 z-10 w-44 max-w-44 min-w-44 border-b border-border bg-card px-1.5 text-[11px] text-muted-foreground"
					>Marked (if partial)</td
				>
				<td class="sticky left-44 z-10 w-14 min-w-14 border-b border-l border-border bg-card"></td>
				{#each engine.leaves as leaf, col (leaf.id)}
					{@const r = byId.get(leaf.id)}
					<td
						class={`w-10 min-w-10 border-b border-l border-border bg-card px-0 text-center text-[10px] text-amber-700 tabular-nums ${groupStarts.has(col) ? 'border-l-2 border-l-foreground/25' : ''} ${dim ? 'opacity-35' : ''}`}
						>{r?.provisional ? `${r.n}/${r.of}` : ''}</td
					>
				{/each}
			</tr>
		{/if}
		{#if dim && analysis.stalePolicy === 'prompt'}
			<tr>
				<td colspan={engine.leaves.length + 2} class="bg-amber-50 p-0">
					<div class="sticky left-0 flex w-fit items-center gap-3 px-3 py-1.5 text-xs">
						<span class="font-medium">Marks have changed since this analysis was run.</span>
						<Button size="sm" class="h-6 text-xs" onclick={() => analysis.run()}
							><RotateCwIcon /> Re-run</Button
						>
					</div>
				</td>
			</tr>
		{/if}
	{/snippet}
</MarksGrid>

{#if analysis.rag === 'chip'}
	<div class="mx-4 mt-2 flex items-center gap-3 text-xs text-muted-foreground">
		Key: <RagChip band="red" /> <RagChip band="amber" /> <RagChip band="green" /> ·
		<span class="rounded-sm px-1 italic outline-1 outline-amber-600 outline-dashed">dashed</span> = part-marked
		(provisional)
	</div>
{/if}
