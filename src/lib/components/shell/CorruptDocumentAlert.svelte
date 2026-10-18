<!--
	What the teacher is told when the document in this browser cannot be read:
	that nothing was deleted, where the copy is kept, and how to get the raw text
	out. Shown only by the boot gate's own result, and gone as soon as a new
	document is stored.
-->
<script lang="ts">
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { corruptFile, saveFile } from '$lib/marksheet/download.js';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

	const store = marksheetStore();

	const unreadable = $derived(store.loadResult.kind === 'corrupt' ? store.loadResult : null);

	function downloadRaw(): void {
		const result = unreadable;
		if (!result) return;
		saveFile(corruptFile(result.preservedKey, result.raw));
	}
</script>

{#if unreadable}
	<Alert variant="destructive" data-testid="corrupt-alert">
		<TriangleAlertIcon />
		<AlertTitle>Your stored marksheet could not be read</AlertTitle>
		<AlertDescription>
			<p>
				This browser is holding a document this version of QLA cannot read — it may be damaged, or
				written by a newer one.
				{#if unreadable.preservedKey}
					Nothing has been deleted: the text is kept under
					<code>{unreadable.preservedKey}</code>.
				{:else}
					A separate copy could not be saved, so download the raw text now: parsing a paper below
					replaces the stored document.
				{/if}
			</p>
			<p class="mt-1">
				Download the raw text if you want a copy of it, then parse a paper and/or markscheme below
				as usual.
			</p>
			<div class="mt-3">
				<Button variant="outline" size="sm" onclick={downloadRaw}>Download the raw text</Button>
			</div>
		</AlertDescription>
	</Alert>
{/if}
