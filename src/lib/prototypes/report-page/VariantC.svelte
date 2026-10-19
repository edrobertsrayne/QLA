<!--
	PROTOTYPE — Variant C, "Sidebar": a narrow left rail holds who, the score and the
	whole roll-up; the wide column holds the feedback, then one long question table
	with summaries.
-->
<script lang="ts">
	import BandMark from './BandMark.svelte';
	import Legend from './Legend.svelte';
	import { count } from '$lib/prose.js';
	import ProseField from './ProseField.svelte';
	import { reportPage } from './state.svelte.js';
	import type { ReportFigures } from './sample.js';

	let { report: r, editable }: { report: ReportFigures; editable: boolean } = $props();
	const page = reportPage();
	const prose = $derived(page.prose[r.id]);
</script>

<div class="grid flex-1 grid-cols-[58mm_1fr] gap-5">
	<aside class="flex flex-col gap-3 border-r border-neutral-400 pr-4 text-[7.5pt] leading-[1.3]">
		<div>
			<h2 class="text-[13pt] leading-tight font-bold">{r.name}</h2>
			<p class="mt-0.5">{r.className}</p>
			<p class="text-neutral-700">{r.paper}</p>
		</div>
		<div class="border-y-2 border-black py-2 text-center">
			<div class="text-[22pt] leading-none font-bold tabular-nums">{r.total}/{r.available}</div>
			<div class="mt-0.5 text-[9pt]">{r.percent}%</div>
			{#if r.grade}
				<div class="mt-2 text-[9pt]">
					Grade <span class="text-[16pt] font-bold">{r.grade}</span>
				</div>
				<div class="text-[8pt]">
					{#if r.toNext}{count(r.toNext.marks, 'more mark')} for grade {r.toNext.grade}{:else}Top
						grade{/if}
				</div>
			{/if}
		</div>
		<div>
			<h3 class="mb-0.5 font-bold">By skill</h3>
			{#each r.aos as a (a.key)}
				<div class="flex items-start gap-1">
					<span class="min-w-0 flex-1">{a.name}</span>
					<span class="tabular-nums">{a.gained}/{a.available}</span>
					<BandMark band={a.band} />
				</div>
			{/each}
		</div>
		<div>
			<h3 class="mb-0.5 font-bold">By topic</h3>
			{#each r.topics as t (t.key)}
				<div class="flex items-start gap-1">
					<span class="min-w-0 flex-1">{t.name}</span>
					<span class="tabular-nums">{t.gained}/{t.available}</span>
					<BandMark band={t.band} />
				</div>
			{/each}
		</div>
		<div class="mt-auto"><Legend /></div>
	</aside>

	<main class="flex min-w-0 flex-col gap-3">
		<section style="font-size: calc(9pt * var(--fb-scale, 1))" class="space-y-2">
			<div>
				<h3 class="mb-0.5 text-[10.5pt] font-bold">Strengths</h3>
				<ul class="list-disc space-y-0.5 pl-4">
					{#each prose.strengths, i (i)}
						<li><ProseField id={r.id} kind="strengths" index={i} {editable} /></li>
					{/each}
				</ul>
			</div>
			<div>
				<h3 class="mb-0.5 text-[10.5pt] font-bold">Areas for improvement</h3>
				<ol class="list-decimal space-y-1 pl-4">
					{#each prose.areas, i (i)}
						<li><ProseField id={r.id} kind="areas" index={i} {editable} /></li>
					{/each}
				</ol>
			</div>
		</section>

		<table class="w-full text-[7pt] leading-[1.25]">
			<thead>
				<tr class="border-b border-black text-left">
					<th class="w-9">Question</th>
					<th></th>
					<th class="w-10 text-right">Marks</th>
					<th class="w-5"></th>
				</tr>
			</thead>
			{#each r.questions as q (q.questionNumber)}
				<tbody class="border-b border-neutral-400">
					{#each q.entries as e (e.id)}
						<tr>
							<td class="font-medium">{e.label}</td>
							<td class="max-w-0 truncate">{e.summary}</td>
							<td class="text-right tabular-nums">{e.gained}/{e.available}</td>
							<td class="pl-1"><BandMark band={e.band} /></td>
						</tr>
					{/each}
				</tbody>
			{/each}
		</table>
	</main>
</div>
