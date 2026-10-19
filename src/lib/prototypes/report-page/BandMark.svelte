<!--
	PROTOTYPE — a RAG band that survives greyscale: the letter carries it, and the
	fills differ in lightness (dark / mid / outline), not only in hue.
-->
<script lang="ts">
	import type { RagBand } from '$lib/marksheet/analysis.js';

	let { band, class: className = '' }: { band: RagBand; class?: string } = $props();

	const STYLE: Record<RagBand, string> = {
		red: 'bg-red-700 text-white border-red-700',
		amber: 'bg-amber-300 text-black border-amber-500',
		green: 'bg-white text-emerald-800 border-emerald-700'
	};
	const LETTER: Record<RagBand, string> = { red: 'R', amber: 'A', green: 'G' };
</script>

<span
	class="inline-flex size-[1.35em] shrink-0 items-center justify-center rounded-[3px] border text-[0.8em] leading-none font-bold {STYLE[
		band
	]} {className}">{LETTER[band]}</span
>
