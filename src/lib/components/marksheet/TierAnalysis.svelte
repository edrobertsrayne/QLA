<!--
	One tier's analysis: today's band sections — red, amber, green folded, not
	scored — worst first within each, every line drawn on the track chart. A
	common question carries its partner's label, the other tier's faint dot and
	the pooled bar, so the comparison is visible without leaving the tier.
-->
<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { Button } from '$lib/components/ui/button';
	import {
		facilityPercent,
		GREEN_FROM,
		notScoredLabel,
		RED_BELOW,
		type CommonQuestionAnalysis,
		type EntryAnalysis,
		type RagBand
	} from '$lib/marksheet/analysis.js';
	import { entryName } from '$lib/marksheet/breakdown.js';
	import { otherTier, type TierIndex } from '$lib/marksheet/document.js';
	import { cn } from '$lib/utils.js';
	import { ANALYSIS_TICKS, BAND_TEXT } from './analysis-style.js';
	import AnalysisTrack from './AnalysisTrack.svelte';

	interface Props {
		/** The tier's entries worst first within each band, as the analysis orders them. */
		rows: EntryAnalysis[];
		/** Green is the band a teacher is least likely to act on, so it starts folded. */
		greenOpen?: boolean;
		/** The entry the analysis was opened at, outlined and brought into sight. */
		highlight?: string | null;
		/** The tier this tab shows. */
		tier: TierIndex;
		/** This tier's initial for coverage, or null on a single tier where no tier needs naming. */
		tierShort: string | null;
		/** The other tier's initial, for the partner chip. */
		otherShort: string;
		/** The other tier's name, for the partner chip's title. */
		otherTierName: string;
		/** Every common question, in paper order. */
		pairs: CommonQuestionAnalysis[];
	}

	let {
		rows,
		greenOpen = $bindable(false),
		highlight = null,
		tier,
		tierShort,
		otherShort,
		otherTierName,
		pairs
	}: Props = $props();

	const redBelow = facilityPercent(RED_BELOW);
	const greenFrom = facilityPercent(GREEN_FROM);

	const sections = $derived.by(() => {
		const inBand = (band: RagBand | null) => rows.filter((row) => row.band === band);
		return {
			red: inBand('red'),
			amber: inBand('amber'),
			green: inBand('green'),
			notScored: inBand(null)
		};
	});
</script>

{#snippet chartRow(row: EntryAnalysis)}
	{@const pair =
		pairs.find(
			(candidate) =>
				candidate.tier1.entry.id === row.entry.id || candidate.tier2.entry.id === row.entry.id
		) ?? null}
	{@const partner = pair === null ? null : tier === 0 ? pair.tier2 : pair.tier1}
	{@const current = row.entry.id === highlight}
	<div
		id={`analysis-${row.entry.id}`}
		data-testid="analysis-row"
		data-entry-id={row.entry.id}
		data-highlighted={current ? 'true' : undefined}
		class={cn(
			'scroll-mt-24 rounded-sm border-b px-3 py-2 last:border-0',
			current && 'outline-2 -outline-offset-2 outline-primary'
		)}
	>
		<div
			class="grid grid-cols-[minmax(0,1fr)_minmax(8rem,1fr)_5.5rem] items-center gap-3"
			role="row"
		>
			<div class="min-w-0" role="cell">
				<div class="text-sm font-semibold tabular-nums">
					{entryName(row.entry)}
					<span class="font-normal text-muted-foreground">
						· {row.entry.marks === null
							? '— marks'
							: `${row.entry.marks} ${row.entry.marks === 1 ? 'mark' : 'marks'}`} · {row.entry.ao ??
							'—'}
					</span>
					{#if partner !== null}
						<span
							class="ml-1 inline-flex items-center gap-0.5 rounded border px-1 text-[11px] font-normal text-muted-foreground"
							title={`Common with ${otherTierName} ${partner.entry.label}`}
							data-testid="partner-chip"
						>
							⇔ {otherShort}
							{partner.entry.label}
						</span>
					{/if}
				</div>
				<div class="truncate text-xs text-muted-foreground" title={row.entry.summary}>
					{row.entry.summary.trim() === '' ? '—' : row.entry.summary}
				</div>
			</div>

			<div role="cell">
				<AnalysisTrack
					tier1={tier === 0 ? row : (pair?.tier1.analysis ?? null)}
					tier2={tier === 1 ? row : (pair?.tier2.analysis ?? null)}
					pooled={pair?.pooled.facility ?? null}
					dimmed={pair === null ? null : otherTier(tier)}
					empty={notScoredLabel(row)}
				/>
			</div>

			<div class="text-right tabular-nums" role="cell">
				{#if row.facility !== null && row.band !== null}
					<span
						class={cn('font-semibold', BAND_TEXT[row.band], row.coverage.partMarked && 'italic')}
						data-testid="facility">{facilityPercent(row.facility)}%</span
					>
				{:else}
					<span class="text-xs text-muted-foreground" data-testid="facility">
						{notScoredLabel(row)}
					</span>
				{/if}
				{#if row.overMax > 0}
					<span class="ml-1 text-xs text-destructive">{row.overMax} above max — not counted</span>
				{/if}
				<div
					class={cn(
						'text-[11px] text-muted-foreground',
						row.coverage.partMarked && 'text-amber-700 italic dark:text-amber-300'
					)}
					data-testid="coverage"
				>
					{tierShort === null ? '' : `${tierShort} `}{row.coverage.marked}/{row.coverage.of}
				</div>
			</div>
		</div>
	</div>
{/snippet}

{#snippet sectionRows(list: EntryAnalysis[], label: string)}
	{#if list.length > 0}
		<div class="overflow-hidden rounded-lg border" role="table" aria-label={label}>
			<div
				class="grid grid-cols-[minmax(0,1fr)_minmax(8rem,1fr)_5.5rem] items-center gap-3 border-b px-3 py-1.5 text-xs text-muted-foreground"
				role="row"
			>
				<span role="columnheader">Question</span>
				<div class="relative h-4" role="columnheader">
					<span class="sr-only">Facility</span>
					{#each ANALYSIS_TICKS as tick (tick)}
						<span class="absolute -translate-x-1/2 tabular-nums" style:left={`${tick}%`}>
							{tick}%
						</span>
					{/each}
				</div>
				<span class="text-right" role="columnheader">Facility</span>
			</div>
			{#each list as row (row.entry.id)}
				{@render chartRow(row)}
			{/each}
		</div>
	{:else}
		<p class="text-sm text-muted-foreground">None.</p>
	{/if}
{/snippet}

<div class="space-y-4" data-testid="tier-analysis">
	<section>
		<h3 class="mb-2 text-base font-semibold">
			Red — below {redBelow}%
			<span class="text-sm font-normal text-muted-foreground">({sections.red.length})</span>
		</h3>
		{@render sectionRows(sections.red, 'Red questions')}
	</section>

	<section>
		<h3 class="mb-2 text-base font-semibold">
			Amber — {redBelow}% to below {greenFrom}%
			<span class="text-sm font-normal text-muted-foreground">({sections.amber.length})</span>
		</h3>
		{@render sectionRows(sections.amber, 'Amber questions')}
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
		<!-- Folded on screen only: print styles reveal it, so a print holds every band. -->
		<div class={greenOpen ? undefined : 'hidden print:block'}>
			{@render sectionRows(sections.green, 'Green questions')}
		</div>
	</section>

	<section>
		<h3 class="mb-2 text-base font-semibold">
			Not scored
			<span class="text-sm font-normal text-muted-foreground">({sections.notScored.length})</span>
		</h3>
		{@render sectionRows(sections.notScored, 'Not-scored questions')}
	</section>
</div>
