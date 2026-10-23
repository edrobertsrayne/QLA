<!--
	PROTOTYPE (#113) — stands in for the marksheet once the two-tier breakdown is
	confirmed, so the way back (unlocking) can be seen. Shared by every variant:
	unlocking always lands on whichever review variant is showing.
-->
<script lang="ts">
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import LockIcon from '@lucide/svelte/icons/lock';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import { twoTierReview } from './review.svelte.js';

	const review = twoTierReview();
	let open = $state(false);
</script>

<main class="mx-auto max-w-3xl space-y-4 p-6">
	<Card.Root>
		<Card.Header>
			<Card.Title class="flex items-center gap-2"><LockIcon class="size-4" /> Marksheet</Card.Title>
			<Card.Description>
				Stand-in for the marksheet: the breakdown below is confirmed and read-only.
			</Card.Description>
			<Card.Action>
				<Dialog.Root bind:open>
					<Dialog.Trigger>
						{#snippet child({ props })}
							<Button variant="outline" size="xs" {...props}>
								<PencilIcon class="size-3.5" /> Edit breakdown
							</Button>
						{/snippet}
					</Dialog.Trigger>
					<Dialog.Content>
						<Dialog.Header>
							<Dialog.Title>Edit the breakdown?</Dialog.Title>
							<Dialog.Description class="space-y-2">
								<span class="block">
									This unlocks both tiers' breakdowns and the common questions together.
								</span>
								<span class="block">
									The marks are keyed against the breakdowns' entries, so changing one can affect
									marks already entered: deleting an entry removes the marks on it, and lowering its
									available marks leaves marks above them. Nothing is clamped.
								</span>
								<span class="block">
									Changing which questions are common changes only the common-questions analysis. No
									marks are touched.
								</span>
							</Dialog.Description>
						</Dialog.Header>
						<Dialog.Footer>
							<Button variant="outline" onclick={() => (open = false)}>Keep marking</Button>
							<Button
								onclick={() => {
									open = false;
									review.unlock();
								}}>Unlock and edit</Button
							>
						</Dialog.Footer>
					</Dialog.Content>
				</Dialog.Root>
			</Card.Action>
		</Card.Header>
		<Card.Content class="space-y-1 text-sm">
			{#each review.tiers as tier, i (tier.filename)}
				<p>
					<strong>{review.tierLabel(i === 0 ? 0 : 1)}</strong>: {tier.entries.length} columns, {review.tierMarks(
						i === 0 ? 0 : 1
					)} marks
				</p>
			{/each}
			<p>
				<strong>Common questions</strong>: {review.orderedPairs.length} pairs, {review.pairedMarks} marks
			</p>
			<p class="text-muted-foreground">{review.studentsWithMarks} students have marks entered.</p>
		</Card.Content>
	</Card.Root>
</main>
