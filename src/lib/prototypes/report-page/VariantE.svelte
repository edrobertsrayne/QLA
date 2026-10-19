<!--
	PROTOTYPE — Variant E, "Table beside roll-up": feedback first across the full
	width at 10.5pt (long lines, fewer of them); below, C's straight table runs down
	the left at 8.5pt with the roll-up and legend in a right-hand column.
-->
<script lang="ts">
	import Feedback from './Feedback.svelte';
	import Legend from './Legend.svelte';
	import QuestionTable from './QuestionTable.svelte';
	import RollupList from './RollupList.svelte';
	import ScoreBox from './ScoreBox.svelte';
	import type { ReportFigures } from './sample.js';

	let { report: r, editable }: { report: ReportFigures; editable: boolean } = $props();
</script>

<header class="flex items-center justify-between gap-4 border-b-2 border-black pb-3">
	<div class="min-w-0">
		<h2 class="text-[18pt] leading-tight font-bold">{r.name}</h2>
		<p class="text-[9pt]">{r.paper} · {r.className}</p>
	</div>
	<ScoreBox report={r} />
</header>

<div class="mt-3">
	<Feedback id={r.id} {editable} pt={10.5} />
</div>

<div class="mt-4 grid flex-1 grid-cols-[1fr_58mm] gap-5">
	<QuestionTable report={r} class="text-[8.5pt]" />
	<aside class="flex flex-col gap-3 text-[9pt]">
		<RollupList title="By topic" figures={r.topics} />
		<RollupList title="By skill" figures={r.aos} />
		<div class="mt-auto"><Legend /></div>
	</aside>
</div>
