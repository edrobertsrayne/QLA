<!--
	The new-upload dialog: the one destructive action, and the last chance to get a
	copy out before it happens.

	It is a checklist rather than a yes/no box because the loss is not the same
	for everyone. A teacher who has marked a class is losing 612 marks and 28
	students; one who has only parsed a paper is losing a breakdown. The sentence
	says which, the button repeats it, and the rows above the buttons are what can
	be taken out of the browser first — a backup that restores, and, beside it and
	clearly not that, a marks export.

	Only the breakdown on its own has nothing worth a checklist.
-->
<script lang="ts">
	import NewUploadChecklist from '$lib/components/marksheet/NewUploadChecklist.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { markCount } from '$lib/marksheet/document.js';
	import { goToSurface, marksheetStore } from '$lib/marksheet/index.js';
	import { count } from '$lib/prose.js';

	const store = marksheetStore();
	let open = $state(false);

	/** The work a wipe would take: how much of it, and whose paper. */
	const marksEntered = $derived(store.document ? markCount(store.document) : 0);
	const studentsInClass = $derived(store.document?.students.length ?? 0);
	const label = $derived(store.document?.paper.label ?? null);

	/**
	 * What the wipe takes, from the state the teacher is in: marks entered, a
	 * class with nothing marked yet, or a breakdown on its own. It is the middle
	 * of one sentence, and reads in bold.
	 */
	const loss = $derived.by(() => {
		const inPaper = label === null ? '' : ` in ${label}`;
		if (marksEntered > 0) {
			return `${count(marksEntered, 'mark')} for ${count(studentsInClass, 'student')}${inPaper}`;
		}
		if (studentsInClass > 0) {
			return `the class of ${count(studentsInClass, 'student')} and the breakdown${inPaper}`;
		}
		return label === null ? 'the stored breakdown' : `the stored breakdown for ${label}`;
	});

	/** The button says what the click costs, so it can never be pressed by reflex. */
	const deleteLabel = $derived(
		marksEntered > 0
			? `Delete ${count(marksEntered, 'mark')} and start again`
			: 'Delete and start again'
	);

	function startNewUpload(): void {
		store.wipe();
		open = false;
		goToSurface();
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
			<Dialog.Description data-testid="wipe-loss">
				This deletes <strong>{loss}</strong> from this browser. It cannot be undone.
			</Dialog.Description>
		</Dialog.Header>
		{#if studentsInClass > 0}
			<NewUploadChecklist />
		{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>Keep working</Button>
			<Button variant="destructive" onclick={startNewUpload}>{deleteLabel}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
