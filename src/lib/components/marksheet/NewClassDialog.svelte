<!--
	The new-class dialog: discard the class and keep the assessment, so the same
	paper can be marked for another class without paying to parse it again.

	The loss is still real — students, their marks and their reports — so the
	dialog names how much of each, and offers the backup and marks export before
	the click. Only a paper with a class to discard is offered this at all.
-->
<script lang="ts">
	import NewUploadChecklist from '$lib/components/marksheet/NewUploadChecklist.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { storedMarkCount } from '$lib/marksheet/document.js';
	import { goToSurface, marksheetStore } from '$lib/marksheet/index.js';
	import { count } from '$lib/prose.js';

	const store = marksheetStore();
	let open = $state(false);

	const studentsInClass = $derived(store.document?.students.length ?? 0);
	const marksStored = $derived(store.document ? storedMarkCount(store.document) : 0);

	/** The button says what the click costs, so it can never be pressed by reflex. */
	const deleteLabel = $derived(
		marksStored > 0
			? `Delete ${count(marksStored, 'mark')} and start the class again`
			: 'Delete the class and start again'
	);

	function startNewClass(): void {
		store.newClass();
		open = false;
		goToSurface();
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger>
		{#snippet child({ props })}
			<Button variant="ghost" {...props}>New class…</Button>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Start a new class?</Dialog.Title>
			<Dialog.Description data-testid="new-class-loss">
				This deletes the class of {count(studentsInClass, 'student')}
				{#if marksStored > 0}and {count(marksStored, 'mark')}{/if} from this browser. The breakdown, topic
				names, common questions and grade boundaries stay, so the same paper can be marked for another
				class. It cannot be undone.
			</Dialog.Description>
		</Dialog.Header>
		<NewUploadChecklist />
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>Keep working</Button>
			<Button variant="destructive" onclick={startNewClass}>{deleteLabel}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
