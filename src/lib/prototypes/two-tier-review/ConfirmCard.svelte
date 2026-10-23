<!--
	PROTOTYPE (#113) — the one confirmation for both tiers and their pairs.
	Shared copy; each variant decides where it sits.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils.js';
	import { twoTierReview, type TierIndex } from './review.svelte.js';

	let { class: className = '' }: { class?: string } = $props();
	const review = twoTierReview();
	const blockers = $derived(review.blockers);
</script>

<section class={cn('space-y-2', className)}>
	<h2 class="text-sm font-semibold">Confirm breakdown</h2>
	<p class="text-xs text-muted-foreground">Builds your marksheet from both tiers:</p>
	<ul class="space-y-0.5 text-xs">
		{#each [0, 1] as const as t (t)}
			<li>
				<strong>{review.tierLabel(t as TierIndex)}</strong>: {review.tiers[t].entries.length} columns,
				{review.tierMarks(t as TierIndex)} marks
			</li>
		{/each}
		<li>
			<strong>Common questions</strong>: {review.orderedPairs.length} pairs, {review.pairedMarks} marks
		</li>
	</ul>
	<p class="text-xs text-muted-foreground">Both breakdowns and the pairs become read-only.</p>
	{#if blockers.length > 0}
		<div class="space-y-1 text-xs text-destructive">
			{#each blockers as b (b.message)}
				<p>{b.message}</p>
			{/each}
		</div>
	{/if}
	<Button class="w-full" disabled={blockers.length > 0} onclick={() => review.confirm()}>
		Confirm and build marksheet
	</Button>
</section>
