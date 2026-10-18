<!--
	The save state of the document in this browser, at the foot of the window.

	An editor-style bar rather than a line in the header: it is read at a glance,
	and it never competes with the work above it. It stands as soon as there is
	work to lose, or a browser that will not keep any — and says nothing while
	storage is working and nothing is stored yet.
-->
<script lang="ts">
	import { backupFile, saveFile } from '$lib/marksheet/download.js';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import { statusLine, type StatusTone } from '$lib/marksheet/status.js';

	const store = marksheetStore();

	/** The moment the line is read at. */
	let now = $state(new Date());

	$effect(() => {
		// Only the saved line carries an age that needs keeping true; while a write
		// is in flight or refused there is nothing counting up.
		if (store.document === null || store.saveState.kind !== 'saved') return;
		const handle = setInterval(() => (now = new Date()), 1000);
		return () => clearInterval(handle);
	});

	const line = $derived(statusLine(store.saveState, now));

	/** A browser that will not keep anything is worth saying before a parse pays for one. */
	const shown = $derived(store.document !== null || store.saveState.kind === 'unavailable');

	/** What there is to hand out: a document in hand that storage will not take. */
	const rescueable = $derived(line.rescue && store.document !== null);

	const TONES: Record<StatusTone, { bar: string; dot: string }> = {
		ok: { bar: 'bg-muted/70 text-muted-foreground', dot: 'bg-green-500' },
		busy: { bar: 'bg-muted/70 text-muted-foreground', dot: 'bg-sky-500 animate-pulse' },
		error: { bar: 'bg-destructive text-white', dot: 'bg-white' },
		warn: { bar: 'bg-amber-500 text-amber-950', dot: 'bg-amber-950' }
	};

	/** The one action that gets the work out of a browser that will not keep it. */
	function downloadNow(): void {
		const document = store.document;
		if (!document) return;
		saveFile(backupFile(document, new Date()));
	}
</script>

{#if shown}
	<footer
		data-testid="status-bar"
		data-tone={line.tone}
		class="fixed inset-x-0 bottom-0 z-30 flex h-8 items-center gap-3 px-4 text-xs {TONES[line.tone]
			.bar}"
	>
		<span
			data-testid="save-dot"
			aria-hidden="true"
			class="size-2 rounded-full {TONES[line.tone].dot}"
		></span>
		<span data-testid="save-line">{line.text}</span>
		{#if rescueable}
			<button type="button" class="underline underline-offset-2" onclick={downloadNow}>
				Download backup now
			</button>
		{/if}
	</footer>
{/if}
