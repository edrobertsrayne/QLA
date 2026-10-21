<!--
	PROTOTYPE (#92), throwaway: how should Writing-step tiles show queued /
	writing / ready / failed? Four variants of the Writing step on
	/prototype/report-tiles, switchable via ?variant=A|B|C|D. The step chrome
	mirrors WritingStep; the run is a fake in-memory simulation; nothing is stored.
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { Button } from '$lib/components/ui/button';
	import PrototypeSwitcher from '$lib/components/shell/PrototypeSwitcher.svelte';
	import type { TileState } from '../report-run.svelte.js';
	import { FAILURES, LABEL, type ProtoTile } from './prototype-tiles.js';
	import VariantA from './VariantA.svelte';
	import VariantB from './VariantB.svelte';
	import VariantC from './VariantC.svelte';
	import VariantD from './VariantD.svelte';
	import VariantE from './VariantE.svelte';

	let { variant, names }: { variant: string; names: string[] } = $props();

	const VARIANTS = [
		{ key: 'A', name: 'Tint', component: VariantA },
		{ key: 'B', name: 'Stripe and badge', component: VariantB },
		{ key: 'C', name: 'Grouped by state', component: VariantC },
		{ key: 'D', name: 'Strip and chips', component: VariantD },
		{ key: 'E', name: 'D, failures first', component: VariantE }
	];
	const current = $derived(VARIANTS.find((v) => v.key === variant) ?? VARIANTS[0]);

	const FAKE = [
		'Amara Okafor',
		'Ben Hughes',
		'Chloe Patel',
		'Daniel Kowalski',
		'Ella Nguyen',
		'Finn O’Brien',
		'Grace Thompson',
		'Harvey Singh',
		'Isla McKenzie',
		'Jacob Adeyemi',
		'Keira Walsh',
		'Leo Fernandes',
		'Maisie Clarke',
		'Noah Ibrahim',
		'Olivia Hart',
		'Priya Sharma',
		'Quinn Doyle',
		'Ruby Evans',
		'Sami Haddad',
		'Tilly Morgan',
		'Umar Farooq',
		'Violet Reid',
		'Will Chen',
		'Xander Price',
		'Yasmin Ali',
		'Zac Turner',
		'Aisha Bello',
		'Callum Ross',
		'Darcey Lund',
		'Ethan Wright'
	];

	/** Mixed run: the first four tiles show each state side by side. */
	function mix(): TileState[] {
		return Array.from({ length: 30 }, (_, i): TileState => {
			const pattern: TileState[] = [
				{ kind: 'queued' },
				{ kind: 'writing' },
				{ kind: 'ready' },
				{ kind: 'failed', message: FAILURES[0] }
			];
			if (i < 4) return pattern[i];
			if (i < 14) return { kind: 'ready' };
			if (i === 17) return { kind: 'failed', message: FAILURES[1] };
			if (i < 18) return { kind: 'writing' };
			return { kind: 'queued' };
		});
	}

	const initial = mix();
	let tiles = $state<ProtoTile[]>(
		Array.from({ length: 30 }, (_, i) => ({
			id: `s${i}`,
			name: names[i] ?? FAKE[i],
			state: initial[i]
		}))
	);
	let running = $state(true);

	const done = $derived(
		tiles.filter((t) => t.state.kind === 'ready' || t.state.kind === 'failed').length
	);
	const failedCount = $derived(tiles.filter((t) => t.state.kind === 'failed').length);
	const readyCount = $derived(tiles.filter((t) => t.state.kind === 'ready').length);

	// The fake run: up to 5 writing at once, 1–3 s each, about one in six fails.
	let timers: ReturnType<typeof setTimeout>[] = [];
	let failRate = $state(0.15);
	const pending = new SvelteSet<string>();

	function pump(): void {
		if (!running) return;
		let busy = tiles.filter((t) => t.state.kind === 'writing').length;
		for (const tile of tiles) {
			if (busy >= 5) break;
			if (tile.state.kind !== 'queued') continue;
			tile.state = { kind: 'writing' };
			busy++;
		}
		for (const tile of tiles) {
			if (tile.state.kind !== 'writing' || pending.has(tile.id)) continue;
			pending.add(tile.id);
			timers.push(
				setTimeout(
					() => {
						pending.delete(tile.id);
						tile.state =
							Math.random() < failRate
								? { kind: 'failed', message: FAILURES[Math.floor(Math.random() * FAILURES.length)] }
								: { kind: 'ready' };
						pump();
					},
					1000 + Math.random() * 2000
				)
			);
		}
		if (busy === 0) running = false;
	}

	function startRun(ids: string[]): void {
		for (const tile of tiles) if (ids.includes(tile.id)) tile.state = { kind: 'queued' };
		running = true;
		pump();
	}

	function stop(): void {
		for (const timer of timers) clearTimeout(timer);
		timers = [];
		pending.clear();
		for (const tile of tiles) if (tile.state.kind === 'writing') tile.state = { kind: 'queued' };
		running = false;
	}

	function reset(): void {
		stop();
		const states = mix();
		tiles.forEach((tile, i) => (tile.state = states[i]));
		running = true;
	}

	onDestroy(stop);

	// Free play: put any one student into any state.
	let pickedId = $state('s0');
	function setPicked(kind: TileState['kind']): void {
		const tile = tiles.find((t) => t.id === pickedId);
		if (!tile) return;
		tile.state =
			kind === 'failed'
				? { kind, message: FAILURES[Math.floor(Math.random() * FAILURES.length)] }
				: { kind };
	}
</script>

<section class="space-y-4">
	<h1 class="text-xl font-semibold">
		{running ? `Writing ${done} of ${tiles.length}…` : `Wrote ${done} of ${tiles.length}`}
	</h1>
	{#if running}
		<Button variant="outline" onclick={stop}>Stop</Button>
	{:else}
		<div class="flex gap-2">
			{#if failedCount > 0}
				<Button
					variant="outline"
					onclick={() => startRun(tiles.filter((t) => t.state.kind === 'failed').map((t) => t.id))}
					>Retry failed</Button
				>
			{/if}
			<Button>Review {readyCount}</Button>
			<Button variant="outline">Back to Who gets one</Button>
		</div>
	{/if}

	<current.component {tiles} {running} onretry={(id: string) => startRun([id])} />
</section>

<!-- Prototype controls: not part of any variant. -->
<aside
	class="mt-10 space-y-3 rounded-md border-2 border-dashed border-amber-400 p-4 text-sm print:hidden"
>
	<div class="font-semibold">
		Prototype controls (#92) · variant {current.key}: {current.name}
	</div>
	<div class="flex flex-wrap items-center gap-2">
		<Button size="sm" variant="secondary" onclick={() => startRun(tiles.map((t) => t.id))}
			>Simulate a fresh run</Button
		>
		<Button size="sm" variant="secondary" onclick={reset}>Reset to the mix</Button>
		<Button size="sm" variant="secondary" onclick={() => (running = !running)}
			>Pretend running: {running ? 'on' : 'off'}</Button
		>
		<label class="flex items-center gap-2">
			Failure rate
			<input type="range" min="0" max="1" step="0.05" bind:value={failRate} />
			{Math.round(failRate * 100)}%
		</label>
	</div>
	<div class="flex flex-wrap items-center gap-2">
		<select class="rounded-md border bg-background px-2 py-1" bind:value={pickedId}>
			{#each tiles as tile (tile.id)}
				<option value={tile.id}>{tile.name} ({LABEL[tile.state.kind]})</option>
			{/each}
		</select>
		{#each ['queued', 'writing', 'ready', 'failed'] as const as kind (kind)}
			<Button size="sm" variant="outline" onclick={() => setPicked(kind)}>{LABEL[kind]}</Button>
		{/each}
	</div>
	<pre
		class="max-h-32 overflow-auto rounded bg-muted p-2 text-xs">running: {running} · {Object.entries(
			LABEL
		)
			.map(([k, l]) => `${l.toLowerCase()} ${tiles.filter((t) => t.state.kind === k).length}`)
			.join(' · ')}</pre>
</aside>

<PrototypeSwitcher variants={VARIANTS} current={current.key} />
