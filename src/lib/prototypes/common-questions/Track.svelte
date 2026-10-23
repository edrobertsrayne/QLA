<!--
	PROTOTYPE (#115) — one line on a 0–100% track shaded red/amber/green: a filled dot
	and/or a hollow dot (each with its figure), an optional pooled bar, and a line
	joining the two dots when both are present.
-->
<script lang="ts">
	import { cn } from '$lib/utils.js';
	import { GREEN_FROM, RED_BELOW, pct, type Row } from './stub.svelte.js';

	let {
		filled = null,
		hollow = null,
		pooled = null,
		dimHollow = false,
		empty = 'Not marked yet'
	}: {
		filled?: Row | null;
		hollow?: Row | null;
		pooled?: number | null;
		/** The hollow dot is context (the other tier), not this view's own figure. */
		dimHollow?: boolean;
		empty?: string;
	} = $props();

	const x = (f: number) => `${pct(f)}%`;
	const a = $derived(filled?.facility ?? null);
	const b = $derived(hollow?.facility ?? null);
</script>

<div class="relative h-8">
	<div class="absolute inset-y-2 left-0 rounded-l bg-red-500/15" style:width={x(RED_BELOW)}></div>
	<div
		class="absolute inset-y-2 bg-amber-400/20"
		style:left={x(RED_BELOW)}
		style:width={x(GREEN_FROM - RED_BELOW)}
	></div>
	<div
		class="absolute inset-y-2 right-0 rounded-r bg-emerald-500/15"
		style:left={x(GREEN_FROM)}
	></div>
	{#if a !== null && b !== null}
		<div
			class={cn(
				'absolute top-1/2 h-0.5 -translate-y-1/2 bg-foreground/50',
				dimHollow && 'bg-foreground/20'
			)}
			style:left={x(Math.min(a, b))}
			style:width={x(Math.abs(a - b))}
		></div>
	{/if}
	{#if pooled !== null}
		<div
			class="absolute top-1 h-6 w-1 -translate-x-1/2 rounded-sm bg-primary"
			style:left={x(pooled)}
			title="Pooled {pct(pooled)}%"
		></div>
	{/if}
	{#if b !== null}
		<div
			class={cn(
				'absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground bg-background',
				hollow?.partMarked && 'border-dashed',
				dimHollow && 'opacity-40'
			)}
			style:left={x(b)}
		></div>
		<span
			class={cn(
				'absolute -bottom-1.5 -translate-x-1/2 text-[10px] tabular-nums',
				dimHollow && 'opacity-50'
			)}
			style:left={x(b)}>{pct(b)}</span
		>
	{/if}
	{#if a !== null}
		<div
			class={cn(
				'absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground',
				filled?.partMarked && 'opacity-50'
			)}
			style:left={x(a)}
		></div>
		<span class="absolute -top-1.5 -translate-x-1/2 text-[10px] tabular-nums" style:left={x(a)}
			>{pct(a)}</span
		>
	{/if}
	{#if a === null && b === null}
		<span class="absolute top-1/2 left-2 -translate-y-1/2 text-[11px] text-muted-foreground"
			>{empty}</span
		>
	{/if}
</div>
