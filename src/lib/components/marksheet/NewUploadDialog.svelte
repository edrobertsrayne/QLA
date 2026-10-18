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
	import CheckIcon from '@lucide/svelte/icons/check';
	import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
	import FileSpreadsheetIcon from '@lucide/svelte/icons/file-spreadsheet';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { backupTakenAt } from '$lib/marksheet/backup.js';
	import { markCount } from '$lib/marksheet/document.js';
	import { backUpNow, exportMarksNow, goToSurface, marksheetStore } from '$lib/marksheet/index.js';
	import { relativeTime } from '$lib/marksheet/status.js';
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

	/** How old the copy on disk is, or that there is none. */
	const backupAge = $derived.by(() => {
		const takenAt = store.document ? backupTakenAt(store.document) : null;
		return takenAt === null ? 'Never backed up' : `Last one ${relativeTime(takenAt, new Date())}`;
	});
	/** A copy taken from this dialog: the row says so, and stops asking for another. */
	let backedUp = $state(false);

	/**
	 * The flip belongs to the dialog that made the copy, not to every opening of
	 * it: read again later, the row reports how old the backup really is, because
	 * the work done since then is not in it.
	 */
	$effect(() => {
		if (!open) backedUp = false;
	});

	/** The button says what the click costs, so it can never be pressed by reflex. */
	const deleteLabel = $derived(
		marksEntered > 0
			? `Delete ${count(marksEntered, 'mark')} and start again`
			: 'Delete and start again'
	);

	/** Take the copy the dialog is offering, and let its row say it was taken. */
	function backUp(): void {
		backedUp = backUpNow();
	}

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
			<!-- What can be taken out of the browser before this click. A backup
			     restores; the marks export beside it says it does not. -->
			<ul class="-mt-2 space-y-3 text-sm" data-testid="wipe-checklist">
				<li class="flex items-start gap-3" data-testid="wipe-backup">
					{#if backedUp}
						<CheckIcon class="mt-0.5 size-4 shrink-0 text-emerald-600" />
					{:else}
						<CircleDashedIcon class="mt-0.5 size-4 shrink-0 text-amber-600" />
					{/if}
					<div class="flex-1 space-y-1">
						<p class="font-medium">{backedUp ? 'Backed up just now' : backupAge}</p>
						<Button size="sm" variant={backedUp ? 'ghost' : 'default'} onclick={backUp}>
							Download backup
						</Button>
					</div>
				</li>
				<li class="flex items-start gap-3" data-testid="wipe-csv">
					<FileSpreadsheetIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
					<div class="flex-1 space-y-1">
						<p class="font-medium">Marks for a spreadsheet (optional)</p>
						<p class="text-muted-foreground">Not a backup — it cannot be restored from.</p>
						<Button variant="ghost" size="sm" onclick={exportMarksNow}>Export CSV</Button>
					</div>
				</li>
			</ul>
		{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>Keep working</Button>
			<Button variant="destructive" onclick={startNewUpload}>{deleteLabel}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
