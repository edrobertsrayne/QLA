<!--
	The marksheet's tier switcher: one tab per tier, each with its student count,
	and Tier not set carrying an amber dot while anyone is still waiting for one.
	A single-tier assessment shows no tabs at all.
-->
<script lang="ts">
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import { tierLabel } from './tier-label.js';
	import type { MarksheetTab } from './tier-label.js';

	let { tab, onTab }: { tab: MarksheetTab; onTab: (tab: MarksheetTab) => void } = $props();

	const store = marksheetStore();
	const document = $derived(store.document);
	const first = $derived(store.studentsOf(0).length);
	const second = $derived(store.studentsOf(1).length);
	const unset = $derived(store.studentsWithoutTier().length);

	/** The tab a toggled value names, or null for the empty value a re-click produces. */
	function tabOf(value: string | undefined): MarksheetTab | null {
		if (value === '0') return 0;
		if (value === '1') return 1;
		if (value === 'unset') return 'unset';
		return null;
	}
</script>

<ToggleGroup.Root
	type="single"
	variant="outline"
	aria-label="Tier"
	class="w-fit flex-wrap"
	value={tab === 'unset' ? 'unset' : String(tab)}
	onValueChange={(next) => {
		const chosen = tabOf(next);
		if (chosen !== null) onTab(chosen);
	}}
>
	{#each [0, 1] as const as tier (tier)}
		<ToggleGroup.Item value={String(tier)} class="px-4">
			{tierLabel(document, tier)}
			<span class="text-muted-foreground tabular-nums">({tier === 0 ? first : second})</span>
		</ToggleGroup.Item>
	{/each}
	<ToggleGroup.Item value="unset" class="relative px-4">
		Tier not set
		<span class="text-muted-foreground tabular-nums">({unset})</span>
		{#if unset > 0}
			<span
				class="absolute top-1 right-1 size-2 rounded-full bg-amber-500"
				data-testid="tier-not-set-dot"
				title="Some students have no tier"
				aria-hidden="true"
			></span>
		{/if}
	</ToggleGroup.Item>
</ToggleGroup.Root>
