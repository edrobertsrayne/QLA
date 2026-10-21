<!--
	PROTOTYPE (#92) variant A, "Tint": the maintainer's starting idea. Today's grid,
	with the whole tile tinted green when ready and red when failed, plus an icon.
-->
<script lang="ts">
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import { Button } from '$lib/components/ui/button';
	import { LABEL, type VariantProps } from './prototype-tiles.js';

	let { tiles, running, onretry }: VariantProps = $props();

	const TILE = {
		queued: 'text-muted-foreground',
		writing: 'border-primary/40',
		ready:
			'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100',
		failed: 'border-destructive/50 bg-destructive/10'
	};
</script>

<ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
	{#each tiles as tile (tile.id)}
		<li class="rounded-md border p-3 text-sm transition-colors {TILE[tile.state.kind]}">
			<div class="font-medium">{tile.name}</div>
			<div class="flex items-center gap-1.5">
				{#if tile.state.kind === 'queued'}
					<ClockIcon class="size-4" />
				{:else if tile.state.kind === 'writing'}
					<LoaderCircleIcon class="size-4 animate-spin text-primary" />
				{:else if tile.state.kind === 'ready'}
					<CircleCheckIcon class="size-4 text-emerald-600 dark:text-emerald-400" />
				{:else}
					<CircleAlertIcon class="size-4 text-destructive" />
				{/if}
				{LABEL[tile.state.kind]}
			</div>
			{#if tile.state.kind === 'failed'}
				<div class="mt-1 text-destructive">{tile.state.message}</div>
				<Button
					class="mt-2"
					size="sm"
					variant="outline"
					disabled={running}
					onclick={() => onretry(tile.id)}>Retry</Button
				>
			{/if}
		</li>
	{/each}
</ul>
