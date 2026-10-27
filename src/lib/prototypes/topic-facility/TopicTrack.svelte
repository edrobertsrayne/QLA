<!--
	PROTOTYPE (#159) — one topic row's figure on the 0–100% track: the same
	shaded thresholds and dot language the questions' rows use, so a topic
	figure reads like the analysis around it. The filled dot is this tier's
	figure; the bar is both tiers pooled, when the pooling rule is on. A
	part-marked figure fades and its label italics, as an estimate must.
-->
<script lang="ts">
	import { facilityPercent, GREEN_FROM, RED_BELOW } from '$lib/marksheet/analysis.js';
	import { cn } from '$lib/utils.js';

	interface Props {
		/** This tier's topic figure, or null when no carrying question has one. */
		facility: number | null;
		/** Both tiers pooled, or null when the rule is off or the topic sits on one tier. */
		pooled: number | null;
		/** The figure rests on part of the class. */
		partMarked: boolean;
		/** What the track says when there is no figure. */
		empty: string;
	}

	let { facility, pooled = null, partMarked = false, empty }: Props = $props();

	function at(value: number): string {
		return `${facilityPercent(value)}%`;
	}

	const redWidth = at(RED_BELOW);
	const amberWidth = `${facilityPercent(GREEN_FROM) - facilityPercent(RED_BELOW)}%`;
	const greenLeft = at(GREEN_FROM);
</script>

<div
	class="relative h-9"
	data-testid="topic-track"
	data-facility={facility === null ? '' : facilityPercent(facility)}
	data-pooled={pooled === null ? '' : facilityPercent(pooled)}
>
	<div class="absolute inset-y-2 left-0 rounded-l bg-red-500/15" style:width={redWidth}></div>
	<div
		class="absolute inset-y-2 bg-amber-400/20"
		style:left={at(RED_BELOW)}
		style:width={amberWidth}
	></div>
	<div class="absolute inset-y-2 right-0 rounded-r bg-emerald-500/15" style:left={greenLeft}></div>

	{#if pooled !== null}
		<div
			class="absolute top-1 h-7 w-1 -translate-x-1/2 rounded-sm bg-primary"
			style:left={at(pooled)}
			title={`Both tiers pooled ${facilityPercent(pooled)}%`}
			data-testid="pooled-bar"
		></div>
	{/if}

	{#if facility !== null}
		<div
			class={cn(
				'absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground',
				partMarked && 'opacity-50'
			)}
			style:left={at(facility)}
			data-testid="topic-dot"
		></div>
		<span
			class={cn(
				'absolute -top-1 -translate-x-1/2 text-[10px] tabular-nums',
				partMarked && 'italic'
			)}
			style:left={at(facility)}
			aria-label={`Facility ${facilityPercent(facility)}%`}>{facilityPercent(facility)}%</span
		>
	{:else}
		<span class="absolute top-1/2 left-2 -translate-y-1/2 text-[11px] text-muted-foreground">
			{empty}
		</span>
	{/if}
</div>
