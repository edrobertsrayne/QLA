<!-- PROTOTYPE — facility as a bar with the two threshold ticks; length carries the value without colour. -->
<script lang="ts">
	import type { Band } from '$lib/prototypes/analysis-view/analysis.svelte.js';

	let {
		facility,
		band,
		thresholds,
		provisional = false,
		width = 'w-32'
	}: {
		facility: number;
		band: Band | null;
		thresholds: { red: number; green: number };
		provisional?: boolean;
		width?: string;
	} = $props();
</script>

<span class={`relative inline-block h-3 ${width} rounded-sm bg-muted align-middle`}>
	<span
		class={`absolute inset-y-0 left-0 rounded-sm ${provisional ? 'opacity-50' : ''} ${band === 'red' ? 'bg-red-500' : band === 'amber' ? 'bg-amber-400' : 'bg-emerald-600'}`}
		style:width={`${Math.round(facility * 100)}%`}
	></span>
	<span
		class="absolute inset-y-[-2px] w-px bg-foreground/60"
		style:left={`${thresholds.red * 100}%`}
	></span>
	<span
		class="absolute inset-y-[-2px] w-px bg-foreground/60"
		style:left={`${thresholds.green * 100}%`}
	></span>
</span>
