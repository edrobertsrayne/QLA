<!--
	PROTOTYPE — Variant B, "Feedback first": the words lead. A score panel and the
	feedback fill the top half; the roll-up follows as bars; every entry sits at the
	foot as a compact strip per question, labels only (no summaries).
-->
<script lang="ts">
	import type { RagBand } from '$lib/marksheet/analysis.js';
	import BandMark from './BandMark.svelte';
	import { count } from '$lib/prose.js';
	import Legend from './Legend.svelte';
	import ProseField from './ProseField.svelte';
	import { reportPage } from './state.svelte.js';
	import type { Figure, ReportFigures } from './sample.js';

	let { report: r, editable }: { report: ReportFigures; editable: boolean } = $props();
	const page = reportPage();
	const prose = $derived(page.prose[r.id]);

	// Bar fills that still separate in greyscale: dark, mid hatch, light.
	const BAR: Record<RagBand, string> = {
		red: 'bg-red-700',
		amber:
			'bg-amber-400 bg-[repeating-linear-gradient(45deg,transparent_0_2px,rgba(0,0,0,.35)_2px_3px)]',
		green: 'bg-emerald-300 border border-emerald-800'
	};
</script>

{#snippet bar(f: Figure)}
	<div class="grid grid-cols-[1fr_22mm_auto_auto] items-center gap-1.5">
		<span class="min-w-0 truncate">{f.name}</span>
		<span class="h-[2.2mm] border border-neutral-500 bg-white">
			<span class="block h-full {BAR[f.band]}" style:width="{(f.gained / f.available) * 100}%"
			></span>
		</span>
		<span class="w-9 text-right tabular-nums">{f.gained}/{f.available}</span>
		<BandMark band={f.band} />
	</div>
{/snippet}

<header class="grid grid-cols-[1fr_auto] gap-4">
	<div class="min-w-0">
		<p class="text-[8pt] text-neutral-600">{r.paper} · {r.className}</p>
		<h2 class="text-[18pt] leading-tight font-bold">{r.name}</h2>
	</div>
	<div class="flex items-stretch gap-0 border-2 border-black text-center">
		<div class="px-3 py-1">
			<div class="text-[18pt] leading-tight font-bold tabular-nums">{r.total}/{r.available}</div>
			<div class="text-[8pt]">{r.percent}%</div>
		</div>
		{#if r.grade}
			<div class="border-l-2 border-black bg-black px-3 py-1 text-white">
				<div class="text-[18pt] leading-tight font-bold">{r.grade}</div>
				<div class="text-[8pt]">grade</div>
			</div>
			<div class="flex max-w-[26mm] items-center px-2 text-left text-[8pt] leading-tight">
				{#if r.toNext}{count(r.toNext.marks, 'mark')} to grade {r.toNext.grade}{:else}Top grade{/if}
			</div>
		{/if}
	</div>
</header>

<section class="mt-4 space-y-3" style="font-size: calc(10pt * var(--fb-scale, 1))">
	<div class="border-l-4 border-black pl-3">
		<h3 class="mb-1 text-[11pt] font-bold">Strengths</h3>
		<ul class="space-y-1">
			{#each prose.strengths, i (i)}
				<li class="flex gap-2">
					<span aria-hidden="true">✓</span>
					<ProseField id={r.id} kind="strengths" index={i} {editable} />
				</li>
			{/each}
		</ul>
	</div>
	<div class="border-l-4 border-dashed border-black pl-3">
		<h3 class="mb-1 text-[11pt] font-bold">Areas for improvement</h3>
		<ol class="space-y-1.5">
			{#each prose.areas, i (i)}
				<li class="flex gap-2">
					<span class="font-bold">{i + 1}.</span>
					<ProseField id={r.id} kind="areas" index={i} {editable} />
				</li>
			{/each}
		</ol>
	</div>
</section>

<section class="mt-4 grid grid-cols-2 gap-x-5 text-[7.5pt] leading-[1.35]">
	<div class="col-span-2 mb-0.5 flex items-baseline justify-between border-b border-black">
		<h3 class="font-bold">Your marks by topic and skill</h3>
	</div>
	{#each r.topics as t (t.key)}
		{@render bar(t)}
	{/each}
	<div class="col-span-2 mt-1 grid grid-cols-3 gap-x-4 border-t border-neutral-400 pt-1">
		{#each r.aos as a (a.key)}
			{@render bar(a)}
		{/each}
	</div>
</section>

<section class="mt-4 text-[7.5pt]">
	<h3 class="mb-0.5 border-b border-black font-bold">Question by question</h3>
	<div class="divide-y divide-neutral-300">
		{#each r.questions as q (q.questionNumber)}
			<div class="flex items-center gap-2 py-0.5">
				<span class="w-12 shrink-0 font-bold">Q{q.questionNumber}</span>
				<span class="w-9 shrink-0 tabular-nums">{q.gained}/{q.available}</span>
				<span class="flex flex-wrap gap-1">
					{#each q.entries as e (e.id)}
						<span
							class="inline-flex items-center gap-1 rounded-sm border border-neutral-400 py-px pr-px pl-1"
						>
							<span class="font-medium">{e.label}</span>
							<span class="tabular-nums">{e.gained}/{e.available}</span>
							<BandMark band={e.band} />
						</span>
					{/each}
				</span>
			</div>
		{/each}
	</div>
</section>

<footer class="mt-auto pt-2"><Legend /></footer>
