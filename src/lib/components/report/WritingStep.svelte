<!--
	The Writing step: a progress strip over the run, failed students lifted to
	the top with their message and Retry, then a chip per remaining student in
	run order; the Stop control while it runs, and Retry / Review once settled.
-->
<script lang="ts">
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import { Button } from '$lib/components/ui/button';
	import type { RosterRow } from './report-roster.js';
	import type { ReportRun, TileState } from './report-run.svelte.js';

	let {
		run,
		roster,
		onretry,
		onreview,
		onback
	}: {
		run: ReportRun;
		roster: RosterRow[];
		onretry: (ids: string[]) => void;
		onreview: () => void;
		onback: () => void;
	} = $props();

	/** Per state: label, strip segment and icon. Key order is the strip's and legend's order. */
	const KIND = {
		ready: {
			label: 'Ready',
			segment: 'bg-emerald-500',
			icon: CircleCheckIcon,
			iconClass: 'text-emerald-600 dark:text-emerald-400'
		},
		failed: {
			label: 'Failed',
			segment: 'bg-destructive',
			icon: CircleAlertIcon,
			iconClass: 'text-destructive'
		},
		writing: {
			label: 'Writing',
			segment: 'animate-pulse bg-primary',
			icon: LoaderCircleIcon,
			iconClass: 'animate-spin text-primary'
		},
		queued: { label: 'Queued', segment: 'bg-muted', icon: CircleDashedIcon, iconClass: '' }
	} satisfies Record<TileState['kind'], unknown>;
	/** The strip's segments and the legend, left to right. */
	const KINDS = ['ready', 'failed', 'writing', 'queued'] as const;

	const names = $derived(new Map(roster.map((row) => [row.studentId, row.name])));
	const tiles = $derived(
		run.order.map((id) => ({ id, name: names.get(id) ?? '', state: run.tiles[id] }))
	);
	const failedRows = $derived(
		run.failed.flatMap((id) => {
			const tile = run.tiles[id];
			return tile.kind === 'failed'
				? [{ id, name: names.get(id) ?? '', message: tile.message }]
				: [];
		})
	);
	const otherTiles = $derived(tiles.filter((tile) => tile.state.kind !== 'failed'));
	const counts = $derived.by(() => {
		const counts = { ready: 0, failed: 0, writing: 0, queued: 0 };
		for (const tile of tiles) counts[tile.state.kind] += 1;
		return counts;
	});

	/** Students with a stored report, whether or not it is visible on Review. */
	const writtenCount = $derived(
		roster.filter(
			(row) => row.status.kind === 'review' || (row.status.kind === 'blocked' && row.status.written)
		).length
	);
</script>

<section class="space-y-4">
	{#if run.order.length === 0}
		<h1 class="text-xl font-semibold">Nothing is being written</h1>
	{:else}
		<h1 class="text-xl font-semibold">
			{run.running
				? `Writing ${run.done} of ${run.order.length}…`
				: `Wrote ${run.done} of ${run.order.length}`}
		</h1>
	{/if}
	{#if run.phase.kind === 'halted'}
		<p role="alert" class="rounded-md border border-destructive p-3 text-sm">
			{run.phase.message}
		</p>
	{/if}
	{#if run.running}
		<Button variant="outline" onclick={() => run.stop()}>Stop</Button>
	{:else if run.order.length > 0}
		<div class="flex gap-2">
			{#if run.failed.length > 0}
				<Button variant="outline" onclick={() => onretry([...run.failed])}>Retry failed</Button>
			{/if}
			{#if run.failed.length > 0 || writtenCount > 0}
				<Button onclick={onreview}>Review {writtenCount}</Button>
			{/if}
			<Button variant="outline" onclick={onback}>Back to Who gets one</Button>
		</div>
	{/if}
	{#if tiles.length > 0}
		<div class="space-y-2">
			<div class="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
				{#each KINDS as kind (kind)}
					<div
						class="transition-all duration-500 {KIND[kind].segment}"
						style:width="{(counts[kind] / tiles.length) * 100}%"
					></div>
				{/each}
			</div>
			<ul class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
				{#each KINDS as kind (kind)}
					{@const { icon: Icon, iconClass, label } = KIND[kind]}
					<li class={['flex items-center gap-1', kind === 'queued' && 'text-muted-foreground']}>
						<Icon class="size-4 {iconClass}" />{counts[kind]}
						{label.toLowerCase()}
					</li>
				{/each}
			</ul>
		</div>
	{/if}
	{#if failedRows.length > 0}
		<ul class="space-y-1.5">
			{#each failedRows as { id, name, message } (id)}
				<li
					class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-destructive/50 bg-destructive/5 px-2.5 py-1.5 text-sm"
					data-tile-for={id}
				>
					<CircleAlertIcon class="size-4 shrink-0 {KIND.failed.iconClass}" />
					<span class="sr-only">{KIND.failed.label}:</span>
					<span class="font-medium">{name}</span>
					<span class="flex-1 text-destructive">{message}</span>
					<Button size="sm" variant="outline" disabled={run.running} onclick={() => onretry([id])}
						>Retry</Button
					>
				</li>
			{/each}
		</ul>
	{/if}
	<ul class="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
		{#each otherTiles as { id, name, state } (id)}
			{@const kind = KIND[state.kind]}
			<li
				class={[
					'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm',
					state.kind === 'queued' && 'text-muted-foreground'
				]}
				title="{name}: {kind.label}"
				data-tile-for={id}
			>
				<kind.icon class="size-4 shrink-0 {kind.iconClass}" />
				<span class="sr-only">{kind.label}:</span>
				<span class="truncate">{name}</span>
			</li>
		{/each}
	</ul>
</section>
