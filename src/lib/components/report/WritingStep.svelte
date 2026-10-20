<!--
	The Writing step: one tile per student in the run, the Stop control while it
	runs, and Retry / Review once it has settled.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { RosterRow } from './report-roster.js';
	import type { ReportRun } from './report-run.svelte.js';

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

	const TILE_LABEL = { queued: 'Queued', writing: 'Writing', ready: 'Ready', failed: 'Failed' };

	const names = $derived(new Map(roster.map((row) => [row.studentId, row.name])));
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
	<ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
		{#each run.order as id (id)}
			{@const tile = run.tiles[id]}
			<li class="rounded-md border p-3 text-sm" data-tile-for={id}>
				<div class="font-medium">{names.get(id) ?? ''}</div>
				<div class="text-muted-foreground">{TILE_LABEL[tile?.kind ?? 'queued']}</div>
				{#if tile?.kind === 'failed'}<div class="text-destructive">{tile.message}</div>{/if}
				{#if tile?.kind === 'failed'}
					<Button size="sm" variant="outline" disabled={run.running} onclick={() => onretry([id])}
						>Retry</Button
					>
				{/if}
			</li>
		{/each}
	</ul>
</section>
