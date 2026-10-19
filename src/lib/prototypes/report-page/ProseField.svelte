<!--
	PROTOTYPE — one strength or area for improvement, edited in place on the page.
	Prints as plain text; in cap mode the editor refuses words past the cap.
-->
<script lang="ts">
	import { CAPS, capWords, reportPage, wordCount } from './state.svelte.js';

	let {
		id,
		kind,
		index,
		editable
	}: { id: string; kind: 'strengths' | 'areas'; index: number; editable: boolean } = $props();

	const page = reportPage();
	const text = $derived(page.prose[id][kind][index]);
	const cap = $derived(CAPS[kind]);
	const words = $derived(wordCount(text));

	function oninput(e: Event & { currentTarget: HTMLTextAreaElement }) {
		let value = e.currentTarget.value;
		if (page.fit === 'cap' && wordCount(value) > cap) {
			value = capWords(value, cap);
			e.currentTarget.value = value;
		}
		page.prose[id][kind][index] = value;
	}
</script>

{#if editable}
	<span class="relative block">
		<textarea
			class="block w-full resize-none bg-transparent p-0 [field-sizing:content] outline-1 outline-transparent outline-dashed hover:outline-neutral-400 focus:outline-blue-500"
			value={text}
			{oninput}></textarea>
		{#if page.fit === 'cap'}
			<span
				class="absolute -right-1 bottom-0 translate-x-full pl-1 text-[7pt] tabular-nums {words > cap
					? 'font-bold text-red-600'
					: 'text-neutral-400'}">{words}/{cap}</span
			>
		{/if}
	</span>
{:else}
	<span class="block whitespace-pre-wrap">{text}</span>
{/if}
