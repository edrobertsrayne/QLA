<!--
	PROTOTYPE (#92) variant E, "D, failures first": D's progress strip and chips,
	with failed reports lifted out of run order into full-width rows above the
	grid. Every other student keeps their chip in run order.
-->
<script lang="ts">
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import { Button } from '$lib/components/ui/button';
	import { LABEL, type VariantProps } from './prototype-tiles.js';

	let { tiles, running, onretry }: VariantProps = $props();

	const KINDS = ['ready', 'failed', 'writing', 'queued'] as const;
	const SEGMENT = {
		ready: 'bg-emerald-500',
		failed: 'bg-destructive',
		writing: 'bg-primary animate-pulse',
		queued: 'bg-muted'
	};
	const count = $derived(
		Object.fromEntries(KINDS.map((k) => [k, tiles.filter((t) => t.state.kind === k).length]))
	);
	const failed = $derived(tiles.filter((t) => t.state.kind === 'failed'));
	const rest = $derived(tiles.filter((t) => t.state.kind !== 'failed'));
</script>

<div class="space-y-4">
	<div class="space-y-2">
		<div class="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
			{#each KINDS as kind (kind)}
				<div
					class="transition-all duration-500 {SEGMENT[kind]}"
					style="width: {(count[kind] / Math.max(tiles.length, 1)) * 100}%"
				></div>
			{/each}
		</div>
		<div class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
			<span class="flex items-center gap-1"
				><CircleCheckIcon class="size-4 text-emerald-600 dark:text-emerald-400" />{count.ready}
				{LABEL.ready.toLowerCase()}</span
			>
			<span class="flex items-center gap-1"
				><CircleAlertIcon class="size-4 text-destructive" />{count.failed}
				{LABEL.failed.toLowerCase()}</span
			>
			<span class="flex items-center gap-1"
				><LoaderCircleIcon class="size-4 animate-spin text-primary" />{count.writing}
				{LABEL.writing.toLowerCase()}</span
			>
			<span class="flex items-center gap-1 text-muted-foreground"
				><CircleDashedIcon class="size-4" />{count.queued} {LABEL.queued.toLowerCase()}</span
			>
		</div>
	</div>

	{#if failed.length > 0}
		<ul class="space-y-1.5">
			{#each failed as tile (tile.id)}
				<li
					class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-destructive/50 bg-destructive/5 px-2.5 py-1.5 text-sm"
				>
					<CircleAlertIcon class="size-4 text-destructive" />
					<span class="sr-only">{LABEL.failed}:</span>
					<span class="font-medium">{tile.name}</span>
					<span class="flex-1 text-destructive"
						>{tile.state.kind === 'failed' ? tile.state.message : ''}</span
					>
					<Button size="sm" variant="outline" disabled={running} onclick={() => onretry(tile.id)}
						>Retry</Button
					>
				</li>
			{/each}
		</ul>
	{/if}

	<ul class="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
		{#each rest as tile (tile.id)}
			<li
				class="flex items-center gap-1.5 truncate rounded-md border px-2.5 py-1.5 text-sm {tile
					.state.kind === 'queued'
					? 'text-muted-foreground'
					: ''}"
				title="{tile.name}: {LABEL[tile.state.kind]}"
			>
				{#if tile.state.kind === 'queued'}
					<CircleDashedIcon class="size-4 shrink-0" />
				{:else if tile.state.kind === 'writing'}
					<LoaderCircleIcon class="size-4 shrink-0 animate-spin text-primary" />
				{:else}
					<CircleCheckIcon class="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
				{/if}
				<span class="sr-only">{LABEL[tile.state.kind]}:</span>
				<span class="truncate">{tile.name}</span>
			</li>
		{/each}
	</ul>
</div>
