<!--
	The way back to the breakdown from the marksheet: the one action that unlocks
	what the marks are keyed against.

	It is behind a confirm because it opens the door to changes a marksheet can
	feel — deleting an entry takes its marks with it, and lowering one's available
	marks leaves marks above the max. The warning says what may happen rather than
	what will, since raising a total, the common fix, costs nothing. On two tiers
	the one unlock covers both breakdowns and the common questions, and the copy
	says which of those touches marks.
-->
<script lang="ts">
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { goToSurface, marksheetStore } from '$lib/marksheet/index.js';

	const store = marksheetStore();
	const twoTiers = $derived(store.tierCount === 2);
	let open = $state(false);

	/** Unlock the breakdown, then open the page its entries are edited on. */
	function editBreakdown(): void {
		if (!store.unlockBreakdown()) return;
		open = false;
		goToSurface();
	}
</script>

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
			<Dialog.Title>{twoTiers ? 'Edit the breakdowns?' : 'Edit the breakdown?'}</Dialog.Title>
			<Dialog.Description class="space-y-2">
				{#if twoTiers}
					<span class="block">
						This unlocks both tiers' breakdowns and the common questions together.
					</span>
					<span class="block">
						The marks are keyed against the breakdowns' entries, so changing one can affect marks
						already entered: deleting an entry removes the marks on it, and lowering its available
						marks leaves marks above them. Nothing is clamped — a mark you entered stays as you
						entered it.
					</span>
					<span class="block">
						Changing which questions are common changes only the common-questions analysis. No marks
						are touched.
					</span>
				{:else}
					<span class="block">
						The marks are keyed against the breakdown's entries, so changing one can affect marks
						already entered: deleting an entry removes the marks on it, and lowering its available
						marks leaves marks above them. Nothing is clamped — a mark you entered stays as you
						entered it.
					</span>
				{/if}
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>Keep marking</Button>
			<Button onclick={editBreakdown}>Unlock and edit</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
