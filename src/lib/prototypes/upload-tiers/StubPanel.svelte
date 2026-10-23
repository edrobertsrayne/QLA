<!--
	PROTOTYPE — knobs that fake /api/parse and /api/match, plus the state readout.
	Not part of any variant. Bottom-left, amber like the switcher so it reads as scaffolding.
-->
<script lang="ts">
	import { dev } from '$app/environment';
	import { SCENARIOS, uploadRun } from './run.svelte.js';

	const run = uploadRun();
	let open = $state(false);
	let showState = $state(false);
</script>

{#if dev}
	<div
		class="fixed bottom-4 left-4 z-50 max-h-[80vh] overflow-auto rounded-lg border border-amber-400 bg-amber-950 p-2 text-xs text-amber-50 shadow-lg"
	>
		<button type="button" class="font-medium" onclick={() => (open = !open)}>
			Stub run {open ? '▾' : '▸'}
		</button>
		{#if open}
			<div class="mt-2 grid w-72 gap-2">
				<div class="flex gap-2">
					<button
						type="button"
						class="flex-1 rounded border border-amber-400 px-2 py-1"
						onclick={() => run.fillSample(1)}>Fill 1 tier</button
					>
					<button
						type="button"
						class="flex-1 rounded border border-amber-400 px-2 py-1"
						onclick={() => run.fillSample(2)}>Fill 2 tiers</button
					>
					<button
						type="button"
						class="flex-1 rounded border border-amber-400 px-2 py-1"
						onclick={() => run.reset()}>Reset run</button
					>
				</div>
				<fieldset class="grid gap-1">
					<legend class="mb-1 font-medium">Next run</legend>
					{#each SCENARIOS as s (s.key)}
						<label class="flex items-center gap-2">
							<input type="radio" name="scenario" value={s.key} bind:group={run.scenario} />
							{s.label}
						</label>
					{/each}
				</fieldset>
				<label class="flex items-center justify-between gap-2">
					Latency ×{run.speed}
					<input type="range" min="0.2" max="3" step="0.2" bind:value={run.speed} />
				</label>
				<label class="flex items-center gap-2">
					<input type="checkbox" bind:checked={showState} /> Show state
				</label>
				{#if showState}
					<pre
						class="max-h-72 overflow-auto rounded bg-black/40 p-2 text-[10px] leading-tight">{JSON.stringify(
							run.snapshot,
							null,
							1
						)}</pre>
				{/if}
				<p class="text-amber-200/80">No real calls: nothing is parsed or stored.</p>
			</div>
		{/if}
	</div>
{/if}
