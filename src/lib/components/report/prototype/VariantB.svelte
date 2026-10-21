<!--
	PROTOTYPE (#92) variant B, "Stripe and badge": tiles stay neutral; a coloured
	left edge and a status badge carry the state, queued tiles fade back, and a
	writing tile runs a progress bar along its foot.
-->
<script lang="ts">
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import PenLineIcon from '@lucide/svelte/icons/pen-line';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { LABEL, type VariantProps } from './prototype-tiles.js';

	let { tiles, running, onretry }: VariantProps = $props();

	const EDGE = {
		queued: 'border-l-border opacity-60',
		writing: 'border-l-primary',
		ready: 'border-l-emerald-500',
		failed: 'border-l-destructive'
	};
</script>

<ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
	{#each tiles as tile (tile.id)}
		<li
			class="relative overflow-hidden rounded-md border border-l-4 bg-card p-3 text-sm {EDGE[
				tile.state.kind
			]}"
		>
			<div class="flex items-start justify-between gap-2">
				<span class="font-medium">{tile.name}</span>
				{#if tile.state.kind === 'queued'}
					<Badge variant="outline" class="text-muted-foreground"><ClockIcon />{LABEL.queued}</Badge>
				{:else if tile.state.kind === 'writing'}
					<Badge variant="secondary"><PenLineIcon />{LABEL.writing}</Badge>
				{:else if tile.state.kind === 'ready'}
					<Badge
						class="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"
						><CircleCheckIcon />{LABEL.ready}</Badge
					>
				{:else}
					<Badge variant="destructive"><CircleAlertIcon />{LABEL.failed}</Badge>
				{/if}
			</div>
			{#if tile.state.kind === 'failed'}
				<p class="mt-2 text-muted-foreground">{tile.state.message}</p>
				<Button
					class="mt-2"
					size="sm"
					variant="outline"
					disabled={running}
					onclick={() => onretry(tile.id)}>Retry</Button
				>
			{/if}
			{#if tile.state.kind === 'writing'}
				<div class="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-primary/15">
					<div class="bar h-full w-1/3 bg-primary"></div>
				</div>
			{/if}
		</li>
	{/each}
</ul>

<style>
	.bar {
		animation: slide 1.4s ease-in-out infinite;
	}
	@keyframes slide {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(300%);
		}
	}
</style>
