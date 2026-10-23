<!-- PROTOTYPE (#114) — one tier's Hardest strip, as today's, over that tier's students. -->
<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { tieredSheet, type TierIndex } from './sheet.svelte.js';

	let { tier, named = false }: { tier: TierIndex; named?: boolean } = $props();

	const sheet = tieredSheet();
	const hardest = $derived(sheet.hardest(tier));
</script>

{#if hardest.length > 0}
	<span class="flex flex-wrap items-center gap-1.5 text-xs">
		<span class="font-medium">{named ? `Hardest on ${sheet.tiers[tier].name}` : 'Hardest'}</span>
		{#each hardest as row (row.entry.id)}
			<button
				type="button"
				class="rounded border border-red-600/50 bg-red-500/10 px-1.5 py-0.5 tabular-nums hover:bg-red-500/20"
				title={row.entry.summary}
				onclick={() =>
					toast(`Would open the ${sheet.tiers[tier].name} analysis at ${row.entry.label}`)}
			>
				{row.entry.label}
				<span class="text-muted-foreground">{Math.round((row.facility ?? 0) * 100)}%</span>
			</button>
		{/each}
	</span>
{/if}
