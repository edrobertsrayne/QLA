<!--
	The paper's label, editable in place. It writes the typed value on every
	keystroke but reads the stored one back, so it is not a two-way binding:
	the store trims, and a bound field would eat a trailing space mid-word.
-->
<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { marksheetStore } from '$lib/marksheet/index.js';

	const store = marksheetStore();
</script>

<Input
	aria-label="Paper label"
	class="h-auto border-transparent bg-transparent px-1 text-2xl font-bold tracking-tight shadow-none hover:border-input"
	placeholder="Name this paper"
	value={store.document?.paper.label ?? ''}
	oninput={(event) => store.setPaperLabel(event.currentTarget.value)}
/>
