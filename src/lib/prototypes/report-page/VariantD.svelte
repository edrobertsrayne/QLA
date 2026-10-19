<!--
	PROTOTYPE — Variant D, "Split table": full-width bands top to bottom. Header and
	score box; feedback side by side at 10.5pt; roll-up as a strip; C's straight
	table split into two columns at 9pt so it stays large without running long.
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

<header class="flex items-center justify-between gap-4">
	<div class="min-w-0">
		<h2 class="text-[18pt] leading-tight font-bold">{r.name}</h2>
		<p class="text-[10pt]">{r.className}</p>
		<p class="text-[9pt] text-neutral-700">{r.paper}</p>
	</div>
	<ScoreBox report={r} />
</header>

<div class="mt-4 border-t-2 border-black pt-2">
	<Feedback id={r.id} {editable} pt={10.5} layout="side" />
</div>

<section class="mt-4 grid grid-cols-[2fr_1fr] gap-5 text-[9pt]">
	<RollupList title="By topic" figures={r.topics} columns={2} />
	<RollupList title="By skill" figures={r.aos} />
</section>

<QuestionTable report={r} split class="mt-4 text-[9pt]" />

<footer class="mt-auto pt-2"><Legend /></footer>
