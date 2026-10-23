<!--
	The common-questions comparison: one line per pair, both tiers' figures on
	the same track, the pooled figure as a bar and the signed gap on the right.
	The summary, available marks and paper order come from Tier 1; each tier's
	coverage sits beneath them. The gap is a plain number — no colour, no flag.
-->
<script lang="ts">
	import {
		facilityPercent,
		notScoredLabel,
		type CommonQuestionAnalysis
	} from '$lib/marksheet/analysis.js';
	import { cn } from '$lib/utils.js';
	import { ANALYSIS_TICKS, BAND_TEXT } from './analysis-style.js';
	import AnalysisTrack from './AnalysisTrack.svelte';

	interface Props {
		/** The pairs in the order the teacher asked for. */
		rows: CommonQuestionAnalysis[];
		/** The entry the analysis was opened at: its pair is outlined and brought into sight. */
		highlight?: string | null;
		/** Tier 1's initial, for the coverage line and the axis. */
		tier1Short: string;
		/** Tier 2's initial, for the coverage line and the axis. */
		tier2Short: string;
	}

	let { rows, highlight = null, tier1Short, tier2Short }: Props = $props();

	/** The pair containing the entry the view was opened at; Tier 1's id wins. */
	const highlighted = $derived.by((): string | null => {
		if (highlight === null) return null;
		const onTier1 = rows.find((row) => row.tier1.entry.id === highlight);
		if (onTier1) return onTier1.tier1.entry.id;
		return rows.find((row) => row.tier2.entry.id === highlight)?.tier1.entry.id ?? null;
	});
</script>

<div class="overflow-hidden rounded-lg border" data-testid="common-questions">
	<div
		class="grid grid-cols-[minmax(0,1fr)_minmax(8rem,1fr)_5.5rem] items-center gap-3 border-b px-3 py-1.5 text-xs text-muted-foreground"
	>
		<span>{tier1Short} ↔ {tier2Short}</span>
		<div class="relative h-4">
			{#each ANALYSIS_TICKS as tick (tick)}
				<span class="absolute -translate-x-1/2 tabular-nums" style:left={`${tick}%`}>{tick}%</span>
			{/each}
		</div>
		<span class="text-right">Gap</span>
	</div>

	{#each rows as row (row.pair.tier1EntryId)}
		{@const current = row.tier1.entry.id === highlighted}
		{@const marks = row.tier1.entry.marks}
		<div
			id={`analysis-pair-${row.tier1.entry.id}`}
			data-testid="common-row"
			data-tier1-entry-id={row.tier1.entry.id}
			data-tier2-entry-id={row.tier2.entry.id}
			data-highlighted={current ? 'true' : undefined}
			class={cn(
				'scroll-mt-24 grid grid-cols-[minmax(0,1fr)_minmax(8rem,1fr)_5.5rem] items-center gap-3 border-b px-3 py-2 last:border-0',
				current && 'outline-2 -outline-offset-2 outline-primary'
			)}
		>
			<div class="min-w-0">
				<div class="text-sm font-semibold tabular-nums">
					{row.tier1.entry.label} ↔ {row.tier2.entry.label}
					<span class="font-normal text-muted-foreground">
						· {marks === null ? '— marks' : `${marks} ${marks === 1 ? 'mark' : 'marks'}`}
					</span>
				</div>
				<div class="truncate text-xs text-muted-foreground" title={row.tier1.entry.summary}>
					{row.tier1.entry.summary.trim() === '' ? '—' : row.tier1.entry.summary}
				</div>
				<div class="text-[11px] text-muted-foreground tabular-nums" data-testid="common-coverage">
					{tier1Short}
					{row.tier1.analysis.coverage.marked}/{row.tier1.analysis.coverage.of} · {tier2Short}
					{row.tier2.analysis.coverage.marked}/{row.tier2.analysis.coverage.of}
				</div>
			</div>

			<AnalysisTrack
				tier1={row.tier1.analysis}
				tier2={row.tier2.analysis}
				pooled={row.pooled.facility}
				empty={notScoredLabel(row.tier1.analysis)}
			/>

			<div class="text-right tabular-nums">
				<span class="font-semibold" data-testid="common-gap">
					{row.gap === null ? '—' : row.gap > 0 ? `+${row.gap}` : String(row.gap)}
				</span>
				{#if row.pooled.facility !== null && row.pooled.band !== null}
					<div
						class={cn('text-[11px]', BAND_TEXT[row.pooled.band], row.pooled.partMarked && 'italic')}
						data-testid="common-pooled"
					>
						pooled {facilityPercent(row.pooled.facility)}%
					</div>
				{:else}
					<div class="text-[11px] text-muted-foreground" data-testid="common-pooled">—</div>
				{/if}
			</div>
		</div>
	{/each}
</div>
