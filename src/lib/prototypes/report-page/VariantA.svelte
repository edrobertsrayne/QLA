<!--
	PROTOTYPE — Variant A, "Ledger": reads top to bottom like a results slip.
	Header, then every entry with its summary in two newspaper columns, the roll-up
	as two tables, and the feedback last in two columns.
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

<header class="flex items-end justify-between gap-4 border-b-2 border-black pb-2">
	<div class="min-w-0">
		<h2 class="text-[15pt] leading-tight font-bold">{r.name}</h2>
		<p class="text-[8.5pt]">{r.paper} · {r.className}</p>
	</div>
	<div class="flex shrink-0 items-end gap-4 text-right">
		<div>
			<div class="text-[7pt] tracking-wide text-neutral-600 uppercase">Total</div>
			<div class="text-[15pt] leading-tight font-bold tabular-nums">
				{r.total}/{r.available}
				<span class="text-[10pt] font-normal">{r.percent}%</span>
			</div>
		</div>
		{#if r.grade}
			<div>
				<div class="text-[7pt] tracking-wide text-neutral-600 uppercase">Grade</div>
				<div class="text-[15pt] leading-tight font-bold">{r.grade}</div>
			</div>
			<div class="max-w-[30mm] text-[8pt] leading-tight">
				{#if r.toNext}{count(r.toNext.marks, 'more mark')} for grade {r.toNext.grade}{:else}Top
					grade{/if}
			</div>
		{/if}
	</div>
</header>

<section class="mt-2 columns-2 gap-5 text-[7.5pt] leading-[1.3]">
	{#each r.questions as q (q.questionNumber)}
		<div class="mb-1 break-inside-avoid">
			<div class="flex justify-between border-b border-neutral-400 font-bold">
				<span>Question {q.questionNumber}</span><span class="tabular-nums"
					>{q.gained}/{q.available}</span
				>
			</div>
			{#each q.entries as e (e.id)}
				<div class="flex items-center gap-1.5">
					<span class="w-8 shrink-0 font-medium">{e.label}</span>
					<span class="min-w-0 flex-1 truncate">{e.summary}</span>
					<span class="shrink-0 tabular-nums">{e.gained}/{e.available}</span>
					<BandMark band={e.band} />
				</div>
			{/each}
		</div>
	{/each}
</section>

<section class="mt-2 grid grid-cols-[1fr_auto] gap-5 text-[7.5pt] leading-[1.3]">
	<div>
		<h3 class="border-b border-neutral-400 font-bold">By topic</h3>
		<div class="columns-2 gap-4">
			{#each r.topics as t (t.key)}
				<div class="flex items-center gap-1.5">
					<span class="min-w-0 flex-1 truncate">{t.name}</span>
					<span class="tabular-nums">{t.gained}/{t.available}</span>
					<BandMark band={t.band} />
				</div>
			{/each}
		</div>
	</div>
	<div class="w-[52mm]">
		<h3 class="border-b border-neutral-400 font-bold">By skill</h3>
		{#each r.aos as a (a.key)}
			<div class="flex items-center gap-1.5">
				<span class="min-w-0 flex-1 truncate">{a.name}</span>
				<span class="tabular-nums">{a.gained}/{a.available}</span>
				<BandMark band={a.band} />
			</div>
		{/each}
	</div>
</section>

<section
	class="mt-3 grid grid-cols-2 gap-5 border-t-2 border-black pt-2"
	style="font-size: calc(9pt * var(--fb-scale, 1))"
>
	<div>
		<h3 class="mb-1 text-[10pt] font-bold">Strengths</h3>
		<ul class="list-disc space-y-1 pl-4">
			{#each prose.strengths, i (i)}
				<li><ProseField id={r.id} kind="strengths" index={i} {editable} /></li>
			{/each}
		</ul>
	</div>
	<div>
		<h3 class="mb-1 text-[10pt] font-bold">Areas for improvement</h3>
		<ol class="list-decimal space-y-1.5 pl-4">
			{#each prose.areas, i (i)}
				<li><ProseField id={r.id} kind="areas" index={i} {editable} /></li>
			{/each}
		</ol>
	</div>
</section>

<footer class="mt-auto pt-2"><Legend /></footer>
