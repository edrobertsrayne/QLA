<!--
	PROTOTYPE — Variant F, "Sidebar, larger type": C's structure with every size
	raised. A left rail holds who, the score box, skills, topics and legend at 9pt;
	the main column has the feedback at 10.5pt, then the straight table at 8.5pt.
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

<div class="grid flex-1 grid-cols-[56mm_1fr] gap-5">
	<aside class="flex flex-col gap-4 border-r border-neutral-400 pr-4 text-[9pt]">
		<div>
			<h2 class="text-[16pt] leading-tight font-bold">{r.name}</h2>
			<p class="mt-1 text-[10pt]">{r.className}</p>
			<p class="text-neutral-700">{r.paper}</p>
		</div>
		<ScoreBox report={r} stacked />
		<RollupList title="By skill" figures={r.aos} />
		<RollupList title="By topic" figures={r.topics} />
		<div class="mt-auto"><Legend /></div>
	</aside>
	<main class="flex min-w-0 flex-col gap-4">
		<Feedback id={r.id} {editable} pt={10.5} />
		<QuestionTable report={r} class="text-[8.5pt]" />
	</main>
</div>
