<!--
	PROTOTYPE (#115) — scenario picker for the stubbed two-tier analysis.
	Not part of any variant. Bottom-left, amber like the switcher so it reads as scaffolding.
-->
<script lang="ts">
	import { dev } from '$app/environment';
	import { SCENARIOS, tieredAnalysis } from './stub.svelte.js';

	const stub = tieredAnalysis();
	let open = $state(true);
</script>

{#if dev}
	<div
		class="fixed bottom-4 left-4 z-50 rounded-lg border border-amber-400 bg-amber-950 p-2 text-xs text-amber-50 shadow-lg print:hidden"
	>
		<button type="button" class="font-medium" onclick={() => (open = !open)}>
			Stub analysis {open ? '▾' : '▸'}
		</button>
		{#if open}
			<div class="mt-2 grid w-72 gap-2">
				<fieldset class="grid gap-1">
					<legend class="mb-1 font-medium">Scenario</legend>
					{#each SCENARIOS as s (s.key)}
						<label class="flex items-center gap-2">
							<input
								type="radio"
								name="scenario"
								value={s.key}
								checked={stub.scenario === s.key}
								onchange={() => stub.load(s.key)}
							/>
							{s.label}
						</label>
					{/each}
				</fieldset>
				<p class="text-amber-200/80">
					AQA 8463 P1 H/F real parses; 13 true pairs (H 01–03 = F 08–10, 31 marks); fake marks.
					Foundation was drilled on F 08.4, 09.1, 10.2. Nothing is stored.
				</p>
			</div>
		{/if}
	</div>
{/if}
