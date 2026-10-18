<!--
	Where an empty class starts: a column of names to paste, or one at a time.
	The paste target and the one-at-a-time row want room the grid's columns do
	not have to give.
-->
<script lang="ts">
	import ClipboardPasteIcon from '@lucide/svelte/icons/clipboard-paste';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { marksheetStore } from '$lib/marksheet/index.js';

	let { onAddOne }: { onAddOne: () => void } = $props();

	const store = marksheetStore();
	/** A column of names waiting to become the class. */
	let pastedNames = $state('');
	/** A column of names, as a class list has them. */
	const NAMES_PLACEHOLDER = 'Lovelace, Ada\nGrace Hopper';

	/** A pasted column of names becomes the class, or joins it when there is one. */
	function addPastedNames(): void {
		if (store.pasteNames(pastedNames) > 0) pastedNames = '';
	}
</script>

<div class="max-w-xl space-y-2 rounded-xl border p-6">
	<p class="text-sm font-medium">No students on this marksheet yet.</p>
	<Textarea
		rows={5}
		aria-label="Paste a column of names"
		placeholder={NAMES_PLACEHOLDER}
		bind:value={pastedNames}
	/>
	<Button size="sm" onclick={addPastedNames} disabled={pastedNames.trim() === ''}>
		<ClipboardPasteIcon class="size-4" /> Add students
	</Button>
	<p class="text-xs text-muted-foreground">
		One name per line, as your class list has them. A comma means
		<code>Surname, First name</code>; otherwise the last word is the surname.
	</p>
	<Button variant="ghost" size="sm" class="w-fit" onclick={onAddOne}>
		<UserPlusIcon class="size-4" /> Or add students one at a time
	</Button>
</div>
