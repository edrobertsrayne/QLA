<!--
	The notice for the one change undo would take back: what was done, in bold
	what it was done to, and the Undo button. Shown only for the kinds the
	caller places, so each surface speaks for its own changes.
-->
<script lang="ts">
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import type { Undoable } from '$lib/marksheet/undo-notice.js';
	import { undoNotice } from '$lib/marksheet/undo-notice.js';

	let {
		kinds,
		testid = 'undo',
		class: className
	}: {
		kinds: readonly Undoable['kind'][];
		testid?: string;
		class?: string;
	} = $props();

	const store = marksheetStore();
	const notice = $derived(
		store.undoable && store.document && kinds.includes(store.undoable.kind)
			? undoNotice(store.undoable, store.document)
			: null
	);
</script>

{#if notice}
	<Alert class={className} data-testid={testid}>
		<AlertDescription>
			{notice.subject === null
				? notice.verb
				: `${notice.verb} `}{#if notice.subject !== null}<strong>{notice.subject}</strong>{/if}.
		</AlertDescription>
		<Button variant="outline" size="xs" onclick={() => store.undo()}>Undo</Button>
	</Alert>
{/if}
