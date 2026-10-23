<!--
	PROTOTYPE (#114) — a cut-down stand-in for GradeBoundariesForm, for one tier.
	Edits a working copy; Save writes it. The real form's scales/percent mode are
	not in question here, only where per-tier boundaries are reached from.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { tieredSheet, type Boundary, type TierIndex } from './sheet.svelte.js';

	let { tier, onDone }: { tier: TierIndex; onDone?: () => void } = $props();

	const sheet = tieredSheet();
	// Fresh working copy per mount (the editors are mounted when they open).
	// svelte-ignore state_referenced_locally
	let rows = $state<Boundary[]>(
		sheet.tiers[tier].boundaries?.map((b) => ({ ...b })) ??
			(tier === 0
				? ['9', '8', '7', '6', '5', '4'].map((label) => ({ label, marks: 0 }))
				: ['5', '4', '3', '2', '1'].map((label) => ({ label, marks: 0 })))
	);
</script>

<div class="space-y-2 text-sm">
	<p class="text-xs text-muted-foreground">
		Raw marks out of {sheet.tierMarks(tier)} on {sheet.tierLabel(tier)}.
	</p>
	<div class="grid grid-cols-[3rem_6rem] items-center gap-x-3 gap-y-1">
		<span class="text-xs text-muted-foreground">Grade</span>
		<span class="text-xs text-muted-foreground">Lowest mark</span>
		{#each rows as row, i (i)}
			<span class="font-semibold">{row.label}</span>
			<Input
				class="h-7"
				inputmode="numeric"
				value={row.marks || ''}
				oninput={(e) => (row.marks = Number(e.currentTarget.value) || 0)}
			/>
		{/each}
		<span class="text-muted-foreground">U</span>
		<span class="text-xs text-muted-foreground">below the lowest</span>
	</div>
	<div class="flex justify-end gap-2 pt-1">
		{#if sheet.tiers[tier].boundaries}
			<Button
				variant="ghost"
				size="sm"
				class="mr-auto text-muted-foreground"
				onclick={() => {
					sheet.setBoundaries(tier, null);
					onDone?.();
				}}>Remove grades</Button
			>
		{/if}
		<Button
			size="sm"
			onclick={() => {
				sheet.setBoundaries(
					tier,
					rows.map((r) => ({ ...r }))
				);
				onDone?.();
			}}>Save boundaries</Button
		>
	</div>
</div>
