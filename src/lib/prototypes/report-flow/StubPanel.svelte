<!--
	PROTOTYPE — the knobs that fake the model: not part of any variant. Bottom-left,
	amber like the switcher so it reads as scaffolding.
-->
<script lang="ts">
	import { dev } from '$app/environment';
	import { reportFlow, stub } from './flow.svelte.js';

	const flow = reportFlow();
	let open = $state(false);
</script>

{#if dev}
	<div
		class="fixed bottom-4 left-4 z-50 rounded-lg border border-amber-400 bg-amber-950 p-2 text-xs text-amber-50 shadow-lg"
	>
		<button type="button" class="font-medium" onclick={() => (open = !open)}>
			Stub model {open ? '▾' : '▸'}
		</button>
		{#if open}
			<div class="mt-2 grid w-64 gap-2">
				<label class="flex items-center justify-between gap-2">
					Failure rate {Math.round(stub.failureRate * 100)}%
					<input type="range" min="0" max="1" step="0.05" bind:value={stub.failureRate} />
				</label>
				<label class="flex items-center justify-between gap-2">
					Latency ×{stub.speed}
					<input type="range" min="0.2" max="3" step="0.2" bind:value={stub.speed} />
				</label>
				<label class="flex items-center gap-2">
					<input type="checkbox" bind:checked={stub.rejectKey} /> Next run: key rejected (401)
				</label>
				<label class="flex items-center gap-2">
					<input type="checkbox" bind:checked={stub.proposalFails} /> Topic-name proposal fails
				</label>
				<button
					type="button"
					class="rounded border border-amber-400 px-2 py-1"
					onclick={() => flow.markSomeStale()}
				>
					Mark 3 reports out of date (#56 stand-in)
				</button>
				<button
					type="button"
					class="rounded border border-amber-400 px-2 py-1"
					onclick={() => flow.reset()}
				>
					Forget all reports and topic names
				</button>
				<p class="text-amber-200/80">In memory only: a reload forgets every report.</p>
			</div>
		{/if}
	</div>
{/if}
