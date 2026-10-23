<!--
	One line of the analysis as a track chart: a 0–100% bar shaded red, amber
	and green at the fixed thresholds, Tier 1's figure as a filled dot, Tier 2's
	as a hollow dot, and the pooled figure as a bar. A part-marked figure is
	faded or dashed, and its number is italic, so an estimate reads as one.
-->
<script lang="ts">
	import {
		facilityPercent,
		GREEN_FROM,
		RED_BELOW,
		type EntryAnalysis
	} from '$lib/marksheet/analysis.js';
	import type { TierIndex } from '$lib/marksheet/document.js';
	import { cn } from '$lib/utils.js';

	interface Props {
		/** Tier 1's figure, always the filled dot. */
		tier1?: EntryAnalysis | null;
		/** Tier 2's figure, always the hollow dot. */
		tier2?: EntryAnalysis | null;
		/** Both tiers' figure; a bar, or none while one side has no counted mark. */
		pooled?: number | null;
		/** The other tier's dot, drawn faint because it is context rather than this view's figure. */
		dimmed?: TierIndex | null;
		/** What the track says when neither dot has a figure. */
		empty?: string;
	}

	let {
		tier1 = null,
		tier2 = null,
		pooled = null,
		dimmed = null,
		empty = 'Not marked yet'
	}: Props = $props();

	const one = $derived(tier1?.facility ?? null);
	const two = $derived(tier2?.facility ?? null);

	/** Where a facility sits on the track, as the whole percentage the dot's label reads. */
	function at(facility: number): string {
		return `${facilityPercent(facility)}%`;
	}

	/** How far the shaded thresholds reach across the track. */
	const redWidth = at(RED_BELOW);
	const amberWidth = `${facilityPercent(GREEN_FROM) - facilityPercent(RED_BELOW)}%`;
	const greenLeft = at(GREEN_FROM);
</script>

<div
	class="relative h-9"
	data-testid="track"
	data-tier1={one === null ? '' : facilityPercent(one)}
	data-tier2={two === null ? '' : facilityPercent(two)}
	data-pooled={pooled === null ? '' : facilityPercent(pooled)}
>
	<div class="absolute inset-y-2 left-0 rounded-l bg-red-500/15" style:width={redWidth}></div>
	<div
		class="absolute inset-y-2 bg-amber-400/20"
		style:left={at(RED_BELOW)}
		style:width={amberWidth}
	></div>
	<div class="absolute inset-y-2 right-0 rounded-r bg-emerald-500/15" style:left={greenLeft}></div>

	{#if one !== null && two !== null}
		<!-- The distance between the tiers is the gap a teacher reads on the common tab. -->
		<div
			class={cn(
				'absolute top-1/2 h-0.5 -translate-y-1/2 bg-foreground/50',
				dimmed !== null && 'bg-foreground/20'
			)}
			style:left={at(Math.min(one, two))}
			style:width={at(Math.abs(one - two))}
		></div>
	{/if}

	{#if pooled !== null}
		<div
			class="absolute top-1 h-7 w-1 -translate-x-1/2 rounded-sm bg-primary"
			style:left={at(pooled)}
			title="Pooled {facilityPercent(pooled)}%"
			data-testid="pooled-bar"
		></div>
	{/if}

	{#if two !== null}
		<div
			class={cn(
				'absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground bg-background',
				tier2?.coverage.partMarked && 'border-dashed',
				dimmed === 1 && 'opacity-40'
			)}
			style:left={at(two)}
			data-testid="track-tier2"
		></div>
		<span
			class={cn(
				'absolute -bottom-1 -translate-x-1/2 text-[10px] tabular-nums',
				tier2?.coverage.partMarked && 'italic',
				dimmed === 1 && 'opacity-60'
			)}
			style:left={at(two)}>{facilityPercent(two)}%</span
		>
	{/if}

	{#if one !== null}
		<div
			class={cn(
				'absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground',
				tier1?.coverage.partMarked && 'opacity-50',
				dimmed === 0 && 'opacity-40'
			)}
			style:left={at(one)}
			data-testid="track-tier1"
		></div>
		<span
			class={cn(
				'absolute -top-1 -translate-x-1/2 text-[10px] tabular-nums',
				tier1?.coverage.partMarked && 'italic',
				dimmed === 0 && 'opacity-60'
			)}
			style:left={at(one)}>{facilityPercent(one)}%</span
		>
	{/if}

	{#if one === null && two === null}
		<span class="absolute top-1/2 left-2 -translate-y-1/2 text-[11px] text-muted-foreground">
			{empty}
		</span>
	{/if}
</div>
