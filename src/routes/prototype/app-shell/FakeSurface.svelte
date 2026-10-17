<!-- PROTOTYPE — placeholder page bodies under the shell. Deliberately grey: the shell is what's being judged. -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import type { Shell } from '$lib/prototypes/app-shell/state.svelte.js';

	let { shell, restore }: { shell: Shell; restore?: Snippet } = $props();

	const cols = 32;
</script>

{#if shell.surface === 'upload'}
	<div class="mx-auto grid max-w-4xl gap-6 lg:grid-cols-2">
		<div class="space-y-3 rounded-xl border border-dashed p-6">
			<div class="h-4 w-40 rounded bg-muted"></div>
			<div class="h-28 rounded-lg bg-muted/60"></div>
			<div class="h-28 rounded-lg bg-muted/60"></div>
		</div>
		<div class="space-y-3 rounded-xl border border-dashed p-6">
			<div class="h-4 w-24 rounded bg-muted"></div>
			<div class="h-9 rounded-lg bg-muted/60"></div>
			<div class="h-9 rounded-lg bg-muted/60"></div>
			<Button class="w-full" onclick={() => shell.parse()}>Parse paper (stub)</Button>
		</div>
		{#if restore}
			<div class="lg:col-span-2">{@render restore()}</div>
		{/if}
	</div>
{:else if shell.surface === 'breakdown'}
	<div class="space-y-1.5">
		{#each { length: 14 }, i (i)}
			<div class="flex gap-3">
				<div class="h-7 w-12 rounded bg-muted"></div>
				<div class="h-7 flex-1 rounded bg-muted/60"></div>
				<div class="h-7 w-16 rounded bg-muted/60"></div>
			</div>
		{/each}
		<div class="pt-4">
			<Button onclick={() => shell.confirmBreakdown()}>Confirm breakdown (stub)</Button>
		</div>
	</div>
{:else}
	<p class="mb-2 text-xs text-muted-foreground">
		Click any cell to simulate entering a mark (drives the saved-state line).
	</p>
	<div class="overflow-hidden rounded-lg border">
		{#each { length: Math.max(shell.doc?.students ?? 0, 1) }, r (r)}
			<div class="flex border-b last:border-b-0">
				<div class="h-7 w-44 shrink-0 border-r bg-muted/40"></div>
				{#each { length: cols }, c (c)}
					<button
						type="button"
						aria-label="cell"
						class="h-7 flex-1 border-r last:border-r-0 hover:bg-primary/10"
						onclick={() => shell.edit()}
					></button>
				{/each}
			</div>
		{/each}
	</div>
{/if}
