<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { marksheetStore } from '$lib/marksheet/index.js';

	const store = marksheetStore();
	let open = $state(false);

	const label = $derived(store.document?.paper.label ?? null);

	function startNewUpload(): void {
		store.wipe();
		open = false;
		void goto(resolve('/'));
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger>
		{#snippet child({ props })}
			<Button variant="ghost" {...props}>New upload…</Button>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Start a new upload?</Dialog.Title>
			<Dialog.Description>
				This deletes the stored breakdown{#if label}
					{` for ${label}`}{/if} and any marks entered against it, then returns you to uploading a fresh
				paper. It cannot be undone.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>Keep working</Button>
			<Button variant="destructive" onclick={startNewUpload}>Delete and start again</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
