<!--
	The grade-boundaries dialog: the shared editor in a modal frame. It edits a
	working copy — nothing reaches the marksheet until Save boundaries.
-->
<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import GradeBoundariesForm from './GradeBoundariesForm.svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-lg" data-testid="grade-boundaries-dialog">
		<Dialog.Header>
			<Dialog.Title>Grade boundaries</Dialog.Title>
		</Dialog.Header>
		{#if open}
			<GradeBoundariesForm onDone={() => (open = false)} />
		{/if}
	</Dialog.Content>
</Dialog.Root>
