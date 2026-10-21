<!--
	PROTOTYPE (#92) variant C, "Grouped": no single grid in run order. Tiles sort
	into sections by state, failures first, and move between sections as the run
	goes. Ready and queued students shrink to name chips; the eye lands on what
	needs attention and what is in flight.
-->
<script lang="ts">
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import { Button } from '$lib/components/ui/button';
	import type { VariantProps } from './prototype-tiles.js';

	let { tiles, running, onretry }: VariantProps = $props();

	const failed = $derived(tiles.filter((t) => t.state.kind === 'failed'));
	const writing = $derived(tiles.filter((t) => t.state.kind === 'writing'));
	const queued = $derived(tiles.filter((t) => t.state.kind === 'queued'));
	const ready = $derived(tiles.filter((t) => t.state.kind === 'ready'));
</script>

<div class="space-y-5">
	{#if failed.length > 0}
		<section class="space-y-2">
			<h2 class="flex items-center gap-1.5 text-sm font-semibold text-destructive">
				<CircleAlertIcon class="size-4" />Needs attention · {failed.length}
			</h2>
			<ul class="divide-y rounded-md border border-destructive/50">
				{#each failed as tile (tile.id)}
					<li class="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-sm">
						<span class="w-40 font-medium">{tile.name}</span>
						<span class="flex-1 text-muted-foreground"
							>{tile.state.kind === 'failed' ? tile.state.message : ''}</span
						>
						<Button size="sm" variant="outline" disabled={running} onclick={() => onretry(tile.id)}
							>Retry</Button
						>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if writing.length > 0}
		<section class="space-y-2">
			<h2 class="flex items-center gap-1.5 text-sm font-semibold">
				<LoaderCircleIcon class="size-4 animate-spin" />Writing now · {writing.length}
			</h2>
			<ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
				{#each writing as tile (tile.id)}
					<li class="rounded-md border border-primary/40 p-3 text-sm font-medium">{tile.name}</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if queued.length > 0}
		<section class="space-y-2">
			<h2 class="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
				<ClockIcon class="size-4" />Queued · {queued.length}
			</h2>
			<ul class="flex flex-wrap gap-1.5">
				{#each queued as tile (tile.id)}
					<li class="rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground">
						{tile.name}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if ready.length > 0}
		<section class="space-y-2">
			<h2
				class="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400"
			>
				<CircleCheckIcon class="size-4" />Ready · {ready.length}
			</h2>
			<ul class="flex flex-wrap gap-1.5">
				{#each ready as tile (tile.id)}
					<li
						class="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100"
					>
						<CircleCheckIcon class="size-3" />{tile.name}
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>
