<!--
	PROTOTYPE — a rough one-side-of-A4 report, shared by every variant so they differ
	only in the flow around it. Its own layout is #53's question, not this one's.
	`editable` swaps the prose for inline fields (variant C edits on the page).
-->
<script lang="ts">
	import { questionBands } from '$lib/marksheet/breakdown.js';
	import { facilityBand, type RagBand } from '$lib/marksheet/analysis.js';
	import { reportFlow } from './flow.svelte.js';
	import { gradeOf } from '$lib/prototypes/grade-boundaries/grades.svelte.js';

	let { studentId, editable = false }: { studentId: string; editable?: boolean } = $props();

	const flow = reportFlow();
	const row = $derived(flow.rows.find((r) => r.student.id === studentId)!);
	const marks = $derived(flow.document.marks[studentId] ?? {});
	const rollup = $derived(flow.rollup(studentId));
	const prose = $derived(flow.prose(studentId));
	const bands = $derived(questionBands(flow.entries));
	const RAG: Record<RagBand, string> = {
		red: 'bg-red-500/25 print:bg-transparent print:font-bold',
		amber: 'bg-amber-400/30 print:bg-transparent print:italic',
		green: 'bg-emerald-500/20 print:bg-transparent'
	};
	const LETTER: Record<RagBand, string> = { red: 'R', amber: 'A', green: 'G' };
	const pct = (gained: number, available: number) =>
		available === 0 ? 0 : Math.round((gained / available) * 100);
	const grade = $derived(gradeOf(row.total));
</script>

<article
	class="report-sheet mx-auto flex aspect-[210/297] w-full max-w-[210mm] flex-col gap-3 bg-white p-[10mm] text-[9.5pt] leading-snug text-black shadow-md print:shadow-none"
>
	<header class="flex items-baseline justify-between border-b border-black pb-2">
		<div>
			<h2 class="text-[14pt] font-bold">{row.name}</h2>
			<p>{flow.document.paper.label} · {flow.document.paper.className}</p>
		</div>
		<p class="text-right">
			<span class="text-[16pt] font-bold tabular-nums">{row.total}/{row.available}</span>
			<span class="tabular-nums">({pct(row.total, row.available)}%)</span><br />
			{#if grade}
				<span class="text-[11pt]">Grade <b>{grade.label}</b></span>
				{#if grade.toNext != null}<br /><span class="text-[8pt]"
						>{grade.toNext} more {grade.toNext === 1 ? 'mark' : 'marks'} for grade {grade.nextLabel}</span
					>{/if}
			{/if}
		</p>
	</header>

	<section class="grid grid-cols-3 gap-x-3 gap-y-0.5 text-[8.5pt]">
		{#each bands as band (band.questionNumber + band.entries[0].id)}
			{#each band.entries as entry (entry.id)}
				{@const gained = marks[entry.id] ?? 0}
				{@const rag = facilityBand(gained / (entry.marks || 1))}
				<div class="flex justify-between gap-2 rounded-sm px-1 {RAG[rag]}">
					<span class="font-medium">{entry.label}</span>
					<span class="truncate text-neutral-700">{entry.summary}</span>
					<span class="tabular-nums">{gained}/{entry.marks} {LETTER[rag]}</span>
				</div>
			{/each}
		{/each}
	</section>

	<section class="grid grid-cols-[2fr_1fr] gap-3 text-[8.5pt]">
		<div>
			<h3 class="font-bold">By topic</h3>
			{#each rollup.topics as t (t.key)}
				<div class="flex justify-between rounded-sm px-1 {RAG[t.band]}">
					<span>{t.name}</span><span class="tabular-nums"
						>{t.gained}/{t.available} {LETTER[t.band]}</span
					>
				</div>
			{/each}
		</div>
		<div>
			<h3 class="font-bold">By skill</h3>
			{#each rollup.aos as a (a.key)}
				<div class="flex justify-between rounded-sm px-1 {RAG[a.band]}">
					<span>{a.name}</span><span class="tabular-nums"
						>{a.gained}/{a.available} {LETTER[a.band]}</span
					>
				</div>
			{/each}
		</div>
	</section>

	{#if prose}
		<section class="grid flex-1 grid-cols-2 gap-4">
			<div>
				<h3 class="font-bold">What went well</h3>
				<ul class="list-disc space-y-1 pl-4">
					{#each prose.wentWell as text, i (i)}
						<li>
							{#if editable}
								<textarea
									class="field-sizing-content inline-block w-full align-top resize-none rounded border border-dashed border-transparent bg-transparent hover:border-neutral-400 focus:border-blue-500 focus:outline-none"
									value={text}
									oninput={(e) =>
										flow.edit(studentId, (p) => (p.wentWell[i] = e.currentTarget.value))}
								></textarea>
							{:else}{text}{/if}
						</li>
					{/each}
				</ul>
			</div>
			<div>
				<h3 class="font-bold">Even better if</h3>
				<ul class="list-disc space-y-1 pl-4">
					{#each prose.evenBetterIf as target, i (i)}
						<li>
							<span class="font-semibold">{target.topic}:</span>
							{#if editable}
								<textarea
									class="field-sizing-content inline-block w-full align-top resize-none rounded border border-dashed border-transparent bg-transparent hover:border-neutral-400 focus:border-blue-500 focus:outline-none"
									value={target.text}
									oninput={(e) =>
										flow.edit(studentId, (p) => (p.evenBetterIf[i].text = e.currentTarget.value))}
								></textarea>
							{:else}{target.text}{/if}
						</li>
					{/each}
				</ul>
			</div>
		</section>
	{:else}
		<section class="flex flex-1 items-center justify-center border border-dashed text-neutral-400">
			No feedback written yet
		</section>
	{/if}
</article>
