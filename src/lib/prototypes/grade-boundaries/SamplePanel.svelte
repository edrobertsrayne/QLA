<!--
	PROTOTYPE (#55) — scaffolding, not a variant: copies sample board tables to the
	clipboard to paste into whichever boundary editor is showing. Bottom-right, amber.
-->
<script lang="ts">
	import { dev } from '$app/environment';
	import { SAMPLES, grades, loadSample } from './grades.svelte.js';

	let open = $state(false);
	let copied = $state<string | null>(null);

	async function copy(name: string, text: string) {
		await navigator.clipboard.writeText(text);
		copied = name;
	}
</script>

{#if dev}
	<div
		class="fixed right-4 bottom-4 z-50 rounded-lg border border-amber-400 bg-amber-950 p-2 text-xs text-amber-50 shadow-lg"
	>
		<button type="button" class="font-medium" onclick={() => (open = !open)}>
			Sample boundaries {open ? '▾' : '▸'}
		</button>
		{#if open}
			<div class="mt-2 grid w-64 gap-1">
				<p class="text-amber-200/80">Paper is out of 42. Click to copy, then paste.</p>
				{#each SAMPLES as sample (sample.name)}
					<button
						type="button"
						class="rounded border border-amber-400 px-2 py-1 text-left"
						onclick={() => copy(sample.name, sample.text)}
					>
						{sample.name}{copied === sample.name ? ' ✓ copied' : ''}
					</button>
				{/each}
				<div class="mt-1 flex gap-1">
					<button
						type="button"
						class="flex-1 rounded border border-amber-400 px-2 py-1"
						onclick={loadSample}
					>
						Fill 9–3
					</button>
					<button
						type="button"
						class="flex-1 rounded border border-amber-400 px-2 py-1"
						onclick={() => {
							grades.rows = [];
							grades.below = 'U';
						}}
					>
						Clear
					</button>
				</div>
				<p class="text-amber-200/80">In memory only: a reload forgets boundaries.</p>
			</div>
		{/if}
	</div>
{/if}
