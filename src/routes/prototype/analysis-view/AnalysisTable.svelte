<!--
	PROTOTYPE — the per-question row list. Columns follow the controls panel's toggles; the RAG treatment
	(chip / row tint / bar) follows its cycle. Provisional rows (n < present) get italics, a dashed chip
	and "n=6/28"; nullable specPoint/AO render as an em dash.
-->
<script lang="ts">
	import type { AnalysisState, LeafResult } from '$lib/prototypes/analysis-view/analysis.svelte.js';
	import RagChip from './RagChip.svelte';
	import FacilityBar from './FacilityBar.svelte';

	let { analysis, results }: { analysis: AnalysisState; results: LeafResult[] } = $props();

	const cols = $derived(analysis.columns);
	const tint = {
		red: 'bg-red-500/12',
		amber: 'bg-amber-400/15',
		green: 'bg-emerald-500/10'
	};
</script>

<table class="w-full border-collapse text-sm">
	<thead class="sticky top-0 z-10 bg-card text-left text-xs text-muted-foreground">
		<tr class="border-b border-border">
			{#if cols.id}<th class="px-3 py-2 font-medium">Question</th>{/if}
			{#if cols.summary}<th class="px-3 py-2 font-medium">Summary</th>{/if}
			{#if cols.marks}<th class="px-3 py-2 text-right font-medium">Marks</th>{/if}
			{#if cols.specPoint}<th class="px-3 py-2 font-medium">Spec point</th>{/if}
			{#if cols.ao}<th class="px-3 py-2 font-medium">AO</th>{/if}
			{#if analysis.rag === 'chip'}<th class="px-3 py-2 font-medium">Band</th>{/if}
			{#if cols.facility}<th class="px-3 py-2 font-medium">Facility</th>{/if}
			{#if cols.n}<th class="px-3 py-2 text-right font-medium">Marked</th>{/if}
		</tr>
	</thead>
	<tbody>
		{#each results as r (r.leaf.id)}
			{@const band = analysis.band(r)}
			<tr
				class={`border-b border-border ${analysis.rag === 'tint' && band ? tint[band] : ''} ${r.facility == null ? 'text-muted-foreground' : ''}`}
			>
				{#if cols.id}<td class="px-3 py-1.5 font-semibold tabular-nums">{r.leaf.id}</td>{/if}
				{#if cols.summary}<td class="max-w-md truncate px-3 py-1.5" title={r.leaf.summary}
						>{r.leaf.summary}</td
					>{/if}
				{#if cols.marks}<td class="px-3 py-1.5 text-right tabular-nums">{r.leaf.marks ?? '?'}</td
					>{/if}
				{#if cols.specPoint}<td class="px-3 py-1.5 tabular-nums">{r.leaf.specPoint ?? '—'}</td>{/if}
				{#if cols.ao}<td class="px-3 py-1.5">{r.leaf.ao ?? '—'}</td>{/if}
				{#if analysis.rag === 'chip'}
					<td class="px-3 py-1.5"><RagChip {band} provisional={r.provisional} /></td>
				{/if}
				{#if cols.facility}
					<td class="px-3 py-1.5 whitespace-nowrap">
						{#if r.facility != null}
							<span class={`inline-flex items-center gap-2 ${r.provisional ? 'italic' : ''}`}>
								{#if analysis.rag === 'bar'}
									<FacilityBar
										facility={r.facility}
										{band}
										thresholds={analysis.thresholds}
										provisional={r.provisional}
									/>
								{/if}
								<span class="w-10 text-right tabular-nums">{Math.round(r.facility * 100)}%</span>
								<span class="text-xs text-muted-foreground tabular-nums"
									>{r.mean!.toFixed(1)}/{r.leaf.marks}</span
								>
							</span>
						{:else if r.reason === 'no-max'}
							<span class="text-xs">Max unknown — can't score</span>
						{:else}
							<span class="text-xs">Not marked yet</span>
						{/if}
						{#if r.overMax > 0}
							<span class="ml-1 text-xs text-destructive">({r.overMax} over max)</span>
						{/if}
					</td>
				{/if}
				{#if cols.n}
					<td
						class={`px-3 py-1.5 text-right text-xs tabular-nums ${r.provisional ? 'font-medium text-amber-700' : 'text-muted-foreground'}`}
					>
						{#if r.provisional}provisional · n={r.n}/{r.of}{:else}{r.n}/{r.of}{/if}
					</td>
				{/if}
			</tr>
		{/each}
	</tbody>
</table>
