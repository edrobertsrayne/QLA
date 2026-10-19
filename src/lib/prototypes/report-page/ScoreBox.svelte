<!-- PROTOTYPE — total, percentage, grade and marks to next grade, as one boxed block. -->
<script lang="ts">
	import { count } from '$lib/prose.js';
	import type { ReportFigures } from './sample.js';

	let { report: r, stacked = false }: { report: ReportFigures; stacked?: boolean } = $props();
</script>

<div class="flex border-2 border-black text-center {stacked ? 'flex-col' : 'items-stretch'}">
	<div class="px-3 py-1.5">
		<div class="text-[20pt] leading-tight font-bold tabular-nums">{r.total}/{r.available}</div>
		<div class="text-[10pt]">{r.percent}%</div>
	</div>
	{#if r.grade}
		<div
			class="flex flex-col justify-center bg-black px-4 py-1.5 text-white {stacked
				? ''
				: 'border-l-2 border-black'}"
		>
			<div class="text-[9pt]">Grade</div>
			<div class="text-[22pt] leading-none font-bold">{r.grade}</div>
		</div>
		<div
			class="flex items-center justify-center px-3 py-1.5 text-[9.5pt] leading-tight {stacked
				? ''
				: 'max-w-[32mm] text-left'}"
		>
			{#if r.toNext}{count(r.toNext.marks, 'more mark')} for grade {r.toNext.grade}{:else}Top grade{/if}
		</div>
	{/if}
</div>
