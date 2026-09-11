<!--
	PROTOTYPE — Variant B's facility footer, lifted out for Variant D. Rendered only once an analysis
	exists: one cell per leaf (band glyph/tint/bar + facility %), a part-marked count row beneath.
	No run button here — D keeps the trigger in the toolbar. Clicking a cell calls onSelect(leafId).
-->
<script lang="ts">
	import type { GridEngine } from '$lib/prototypes/marksheet-grid/grid-state.svelte.js';
	import type { AnalysisState, LeafResult } from '$lib/prototypes/analysis-view/analysis.svelte.js';

	let {
		engine,
		analysis,
		groupStarts,
		dim,
		onSelect
	}: {
		engine: GridEngine;
		analysis: AnalysisState;
		groupStarts: Set<number>;
		dim: boolean;
		onSelect: (leafId: string) => void;
	} = $props();

	const byId = $derived(
		new Map((analysis.snapshot?.results ?? []).map((r) => [r.leaf.id, r] as const))
	);
	const tint = { red: 'bg-red-500/25', amber: 'bg-amber-400/30', green: 'bg-emerald-500/20' };
	const glyph = { red: '▼', amber: '–', green: '✓' };
	const edge = 'border-l-2 border-l-foreground/25';

	function cellTitle(r: LeafResult) {
		if (r.facility == null)
			return `${r.leaf.id}: ${r.reason === 'no-max' ? 'max unknown' : 'not marked'}`;
		return `${r.leaf.id} — ${r.leaf.summary}\nFacility ${Math.round(r.facility * 100)}%${r.provisional ? ` (provisional, ${r.n}/${r.of} marked)` : ''}\nClick for detail`;
	}
</script>

<tr class="border-t-2 border-foreground/40">
	<td
		class="sticky left-0 z-10 w-44 max-w-44 min-w-44 border-b border-border bg-card px-2 py-1 text-xs font-semibold"
	>
		Facility %
		{#if dim}<span class="ml-1 font-medium text-amber-700">· out of date</span>{/if}
	</td>
	<td class="sticky left-44 z-10 w-14 min-w-14 border-b border-l border-border bg-card"></td>
	{#each engine.leaves as leaf, col (leaf.id)}
		{@const r = byId.get(leaf.id)}
		{@const band = r ? analysis.band(r) : null}
		<td
			class={`w-10 min-w-10 border-b border-l border-border bg-card p-0 text-center text-[11px] leading-tight tabular-nums ${groupStarts.has(col) ? edge : ''}`}
			title={r ? cellTitle(r) : undefined}
		>
			{#if r && r.facility != null}
				<button
					type="button"
					class={`${dim ? 'opacity-35' : ''} ${analysis.rag !== 'bar' && band ? tint[band] : ''} ${r.provisional ? 'italic outline-1 -outline-offset-2 outline-amber-600 outline-dashed' : ''} my-1 w-[calc(100%-4px)] rounded-sm py-0.5 hover:ring-2 hover:ring-primary`}
					onclick={() => onSelect(leaf.id)}
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
				</button>
			{:else if r}
				<span class="text-muted-foreground">{r.reason === 'no-max' ? '?' : '—'}</span>
			{/if}
		</td>
	{/each}
</tr>
{#if analysis.columns.n}
	<tr>
		<td
			class="sticky left-0 z-10 w-44 max-w-44 min-w-44 border-b border-border bg-card px-2 text-[11px] text-muted-foreground"
			>Marked (if partial)</td
		>
		<td class="sticky left-44 z-10 w-14 min-w-14 border-b border-l border-border bg-card"></td>
		{#each engine.leaves as leaf, col (leaf.id)}
			{@const r = byId.get(leaf.id)}
			<td
				class={`w-10 min-w-10 border-b border-l border-border bg-card px-0 text-center text-[10px] text-amber-700 tabular-nums ${groupStarts.has(col) ? edge : ''} ${dim ? 'opacity-35' : ''}`}
				>{r?.provisional ? `${r.n}/${r.of}` : ''}</td
			>
		{/each}
	</tr>
{/if}
