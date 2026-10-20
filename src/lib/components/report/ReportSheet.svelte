<!--
	One student's report as a single side of A4: the same box on screen and in
	print. Figures are live from the document; the prose is the stored report's
	(the teacher's edit when there is one). Everything is interpolated as text.
-->
<script lang="ts">
	import { questionBands } from '$lib/marksheet/breakdown.js';
	import {
		EMPTY_AREAS_LINE,
		EMPTY_STRENGTHS_LINE,
		reportFiguresFor
	} from '$lib/marksheet/report-figures.js';
	import type { MarksheetDocument, StoredReport } from '$lib/marksheet/document.js';
	import { studentName } from '$lib/marksheet/students.js';
	import BandMark from './BandMark.svelte';
	import RollupStrip from './RollupStrip.svelte';

	let {
		document,
		studentId,
		report
	}: { document: MarksheetDocument; studentId: string; report: StoredReport } = $props();

	const student = $derived(document.students.find((candidate) => candidate.id === studentId));
	const figures = $derived(reportFiguresFor(document, studentId));
	const strengths = $derived((report.edit ?? report).strengths);
	const areas = $derived((report.edit ?? report).areasForImprovement);
	const figureOf = $derived(new Map(figures.entries.map((row) => [row.entryId, row])));

	const bands = $derived(
		questionBands(document.breakdown.entries).map((band) => ({
			questionNumber: band.questionNumber,
			rows: band.entries.flatMap((entry) => {
				const row = figureOf.get(entry.id);
				return row ? [{ ...row, summary: entry.summary }] : [];
			})
		}))
	);

	/** Two columns, split at the question boundary nearest half the rows. */
	const halves = $derived.by(() => {
		const total = bands.reduce((n, band) => n + band.rows.length, 0);
		let seen = 0;
		let cut = bands.length;
		for (const [index, band] of bands.entries()) {
			if (seen + band.rows.length / 2 > total / 2) {
				cut = index;
				break;
			}
			seen += band.rows.length;
		}
		return [bands.slice(0, cut), bands.slice(cut)];
	});
</script>

<div
	class="report-sheet relative h-[297mm] w-[210mm] shrink-0 overflow-hidden bg-white text-[9pt] leading-snug text-black shadow-md print:shadow-none"
	data-report-id={studentId}
>
	<div class="flex min-h-full flex-col p-[10mm]">
		<header class="flex items-center justify-between gap-4">
			<div class="min-w-0">
				<h2 class="text-[18pt] leading-tight font-bold">{student ? studentName(student) : ''}</h2>
				{#if document.paper.className}<p class="text-[10pt]">{document.paper.className}</p>{/if}
				<p class="text-[9pt] text-neutral-700">{document.paper.label ?? ''}</p>
			</div>
			<div class="border-2 border-black px-3 py-1.5 text-center">
				<div class="text-[20pt] leading-tight font-bold tabular-nums">
					{figures.total}/{figures.available}
				</div>
				<div class="text-[10pt]">{figures.percent}%</div>
			</div>
		</header>

		<div class="mt-4 border-t-2 border-black pt-2">
			<section class="grid grid-cols-2 gap-6 text-[10.5pt] leading-snug">
				<div>
					<h3 class="mb-1 text-[1.15em] font-bold">Strengths</h3>
					{#if strengths.length === 0}
						<p>{EMPTY_STRENGTHS_LINE}</p>
					{:else}
						<ul class="list-disc space-y-1 pl-[1.2em]">
							{#each strengths as line, i (i)}<li>{line}</li>{/each}
						</ul>
					{/if}
				</div>
				<div>
					<h3 class="mb-1 text-[1.15em] font-bold">Areas for improvement</h3>
					{#if areas.length === 0}
						<p>{EMPTY_AREAS_LINE}</p>
					{:else}
						<ol class="list-decimal space-y-1.5 pl-[1.2em]">
							{#each areas as line, i (i)}<li>{line}</li>{/each}
						</ol>
					{/if}
				</div>
			</section>
		</div>

		{#if figures.topics.length > 0 || figures.aos.length > 0}
			<section
				class="mt-4 grid gap-5 text-[9pt] {figures.topics.length > 0
					? 'grid-cols-[2fr_1fr]'
					: 'grid-cols-1'}"
			>
				{#if figures.topics.length > 0}
					<RollupStrip title="By topic" rows={figures.topics} columns={2} />
				{/if}
				{#if figures.aos.length > 0}
					<RollupStrip title="By skill" rows={figures.aos} />
				{/if}
			</section>
		{/if}

		<div class="mt-4 grid grid-cols-2 gap-5 text-[9pt]">
			{#each halves as half, h (h)}
				<table class="w-full self-start leading-[1.3]">
					<thead>
						<tr class="border-b border-black text-left">
							<th class="w-[3.2em]">Q</th>
							<th></th>
							<th class="w-[3.4em] text-right">Marks</th>
							<th class="w-[1.6em]"></th>
						</tr>
					</thead>
					{#each half as band, b (b)}
						<tbody class="border-b border-neutral-400">
							{#each band.rows as row (row.entryId)}
								<tr>
									<td class="align-top font-medium">{row.label}</td>
									<td class="max-w-0 truncate">{row.summary}</td>
									<td class="text-right align-top tabular-nums">{row.gained}/{row.available}</td>
									<td class="pl-1 align-top"><BandMark band={row.band} /></td>
								</tr>
							{/each}
						</tbody>
					{/each}
				</table>
			{/each}
		</div>

		<footer class="mt-auto pt-2">
			<p
				class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[8.5pt] whitespace-nowrap text-neutral-700"
			>
				<span class="flex items-center gap-1"><BandMark band="green" /> 70% or more</span>
				<span class="flex items-center gap-1"><BandMark band="amber" /> 40–69%</span>
				<span class="flex items-center gap-1"><BandMark band="red" /> below 40%</span>
			</p>
		</footer>
	</div>
</div>
