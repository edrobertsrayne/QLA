<!--
	PROTOTYPE (#114) — scenario picker and state readout for the two-tier marksheet.
	Not part of any variant. Bottom-left, amber like the switcher so it reads as scaffolding.
-->
<script lang="ts">
	import { dev } from '$app/environment';
	import { SCENARIOS, tieredSheet } from './sheet.svelte.js';

	const sheet = tieredSheet();
	let open = $state(true);
	let showState = $state(false);
</script>

{#if dev}
	<div
		class="fixed bottom-4 left-4 z-50 max-h-[80vh] overflow-auto rounded-lg border border-amber-400 bg-amber-950 p-2 text-xs text-amber-50 shadow-lg"
	>
		<button type="button" class="font-medium" onclick={() => (open = !open)}>
			Stub marksheet {open ? '▾' : '▸'}
		</button>
		{#if open}
			<div class="mt-2 grid w-72 gap-2">
				<fieldset class="grid gap-1">
					<legend class="mb-1 font-medium">Scenario (resets edits)</legend>
					{#each SCENARIOS as s (s.key)}
						<label class="flex items-center gap-2">
							<input
								type="radio"
								name="scenario"
								value={s.key}
								checked={sheet.scenario === s.key}
								onchange={() => sheet.load(s.key)}
							/>
							{s.label}
						</label>
					{/each}
				</fieldset>
				{#if sheet.lastChange}
					<p class="text-amber-200">Last: {sheet.lastChange}</p>
				{/if}
				<label class="flex items-center gap-2">
					<input type="checkbox" bind:checked={showState} /> Show state
				</label>
				{#if showState}
					<pre
						class="max-h-72 overflow-auto rounded bg-black/40 p-2 text-[10px] leading-tight">{JSON.stringify(
							sheet.snapshot,
							null,
							1
						)}</pre>
				{/if}
				<p class="text-amber-200/80">AQA 8463 P1 H/F real parses, fake marks. Nothing is stored.</p>
			</div>
		{/if}
	</div>
{/if}
