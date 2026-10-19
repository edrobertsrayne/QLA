<!--
	PROTOTYPE — the Strengths and Areas for improvement block at a base size that
	shrink mode scales through `--fb-scale`. `layout` stacks the two sections or sets
	them side by side.
-->
<script lang="ts">
	import ProseField from './ProseField.svelte';
	import { reportPage } from './state.svelte.js';

	let {
		id,
		editable,
		pt,
		layout = 'stack'
	}: { id: string; editable: boolean; pt: number; layout?: 'stack' | 'side' } = $props();
	const page = reportPage();
	const prose = $derived(page.prose[id]);
</script>

<section
	class="leading-snug {layout === 'side' ? 'grid grid-cols-2 gap-6' : 'space-y-2'}"
	style="font-size: calc({pt}pt * var(--fb-scale, 1))"
>
	<div>
		<h3 class="mb-1 text-[1.15em] font-bold">Strengths</h3>
		<ul class="list-disc space-y-1 pl-[1.2em]">
			{#each prose.strengths, i (i)}
				<li><ProseField {id} kind="strengths" index={i} {editable} /></li>
			{/each}
		</ul>
	</div>
	<div>
		<h3 class="mb-1 text-[1.15em] font-bold">Areas for improvement</h3>
		<ol class="list-decimal space-y-1.5 pl-[1.2em]">
			{#each prose.areas, i (i)}
				<li><ProseField {id} kind="areas" index={i} {editable} /></li>
			{/each}
		</ol>
	</div>
</section>
