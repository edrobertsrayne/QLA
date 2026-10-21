<!--
	PROTOTYPE (#92) variant D, "Strip and chips": one segmented bar sums the run
	at a glance, with a legend of counts. Below, every student is a compact chip
	in run order whose icon carries the state; a failed chip breaks out to the
	full row with its message and Retry.
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

	<ul class="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
		{#each tiles as tile (tile.id)}
			{#if tile.state.kind === 'failed'}
				<li
					class="col-span-full flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-destructive/50 bg-destructive/5 px-2.5 py-1.5 text-sm"
				>
					<CircleAlertIcon class="size-4 text-destructive" />
					<span class="font-medium">{tile.name}</span>
					<span class="flex-1 text-destructive">{tile.state.message}</span>
					<Button size="sm" variant="outline" disabled={running} onclick={() => onretry(tile.id)}
						>Retry</Button
					>
				</li>
			{:else}
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
			{/if}
		{/each}
	</ul>
</div>
