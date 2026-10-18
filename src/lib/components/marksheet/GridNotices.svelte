<!--
	What the sheet has to say about the last thing done to it: a removed student
	to take back, what a pasted block did, and why a keystroke was not a mark.
-->
<script lang="ts">
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import { describePaste } from '$lib/marksheet/paste.js';

	let { refusal }: { refusal: string | null } = $props();

	const store = marksheetStore();
	const undoable = $derived(store.undoable);
	/** What the last paste did, cleared by the change that clears the undo it offered. */
	const pasteNotice = $derived(store.pasteNotice);
	const described = $derived(pasteNotice ? describePaste(pasteNotice) : null);
</script>

{#if undoable?.kind === 'student-removal' || refusal || pasteNotice}
	<!-- Sticky, and above the toolbar: a notice about a cell far down a long class
	     must still be where the teacher is looking. Neither notice takes a click,
	     so the mark cells it passes over stay reachable. -->
	<div class="pointer-events-none sticky top-2 z-10 space-y-2">
		{#if undoable?.kind === 'student-removal'}
			<Alert
				class="pointer-events-auto flex flex-row items-center gap-2 py-2 shadow-sm"
				data-testid="undo"
			>
				<AlertDescription>
					Removed <strong>{undoable.name}</strong>.
				</AlertDescription>
				<Button variant="outline" size="xs" onclick={() => store.undo()}>Undo</Button>
			</Alert>
		{/if}
		{#if pasteNotice && described}
			<!-- What a block did, beside the grid: the sheet under it has already
			     changed, so the account has to be where the teacher can read it. -->
			<Alert
				class="pointer-events-auto flex flex-row items-start gap-2 py-2 shadow-sm"
				data-testid="paste-notice"
			>
				<AlertDescription class="space-y-1">
					<p>{described.summary}</p>
					{#if described.losses.length > 0}
						<ul class="list-disc space-y-0.5 pl-4">
							{#each described.losses as loss (loss)}
								<li>{loss}</li>
							{/each}
						</ul>
					{/if}
					{#if pasteNotice.refused.length > 0}
						<ul class="list-disc space-y-0.5 pl-4" data-testid="paste-refusals">
							{#each pasteNotice.refused as cell (`${cell.row}:${cell.column}`)}
								<li>
									“{cell.value}” at row {cell.row}, column {cell.column} is not a whole number.
								</li>
							{/each}
						</ul>
					{/if}
				</AlertDescription>
				{#if pasteNotice.changed && undoable?.kind === 'mark-paste'}
					<Button variant="outline" size="xs" onclick={() => store.undo()}>Undo</Button>
				{/if}
			</Alert>
		{/if}
		{#if refusal}
			<!-- Saying why a keystroke did not become a mark, where the teacher is
			     looking: the cell in front of them has not changed. -->
			<Alert role="status" variant="destructive" class="py-2 shadow-sm" data-testid="refusal">
				<AlertDescription>{refusal}</AlertDescription>
			</Alert>
		{/if}
	</div>
{/if}
