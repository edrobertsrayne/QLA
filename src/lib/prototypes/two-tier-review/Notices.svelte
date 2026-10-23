<!--
	PROTOTYPE (#113) — the two notices a two-tier review can open with: matching gave
	nothing back, or the teacher arrived by unlocking a confirmed marksheet.
	PROTOTYPE (#118) — a single tier has no pairs, so the unlock notice drops that sentence.
-->
<script lang="ts">
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { twoTierReview } from './review.svelte.js';

	const review = twoTierReview();
</script>

{#if review.matchNotice}
	<Alert>
		<AlertTitle>No common questions proposed</AlertTitle>
		<AlertDescription>{review.matchNotice}</AlertDescription>
	</Alert>
{/if}
{#if review.unlockedFromMarksheet}
	<Alert>
		<AlertTitle>Unlocked for editing</AlertTitle>
		<AlertDescription>
			{#if review.single}
				{review.studentsWithMarks} students have marks. Deleting an entry removes its marks. Confirm again
				to go back to marking.
			{:else}
				{review.studentsWithMarks} students have marks. Deleting an entry removes its marks; changing
				a pair only changes the common-questions analysis. Confirm again to go back to marking.
			{/if}
		</AlertDescription>
	</Alert>
{/if}
