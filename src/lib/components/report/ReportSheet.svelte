<!--
	One student's report as a single side of A4: the same box on screen and in
	print. Figures are live from the document; the prose is the stored report's
	(the teacher's edit when there is one). Everything is interpolated as text.
-->
<script lang="ts">
	import { count } from '$lib/prose.js';
	import { paperGrade } from '$lib/marksheet/grades.js';
	import { questionBands } from '$lib/marksheet/breakdown.js';
	import {
		droppedNoMarks,
		EMPTY_AREAS_LINE,
		EMPTY_STRENGTHS_LINE,
		reportFiguresFor
	} from '$lib/marksheet/report-figures.js';
	import {
		entriesOfStudent,
		studentTierName,
		type MarksheetDocument,
		type ReportProse,
		type StoredReport
	} from '$lib/marksheet/document.js';
	import { studentName } from '$lib/marksheet/students.js';
	import { feedbackFontSize, reportFit, settleFit } from './report-fit.svelte.js';
	import BandMark from './BandMark.svelte';
	import RollupStrip from './RollupStrip.svelte';

	let {
		document,
		studentId,
		report,
		editable = false,
		measure = true,
		onedit
	}: {
		document: MarksheetDocument;
		studentId: string;
		report: StoredReport;
		/** On screen the feedback edits in place; in print it is plain text. */
		editable?: boolean;
		/**
		 * The print copies measure: they carry the same list markup the
		 * printer gets, so the settled scale describes what print clips.
		 * Screen copies reuse the settled scale for their textareas.
		 */
		measure?: boolean;
		/** The teacher's wording, saved when a feedback field loses focus. */
		onedit?: (prose: ReportProse) => void;
	} = $props();

	const fit = reportFit();
	const settled = $derived(fit.fitOf(studentId));
	const student = $derived(document.students.find((candidate) => candidate.id === studentId));
	const figures = $derived(reportFiguresFor(document, studentId));
	/** The paper this student sat: their own tier's entries, never the other tier's. */
	const entries = $derived(student ? entriesOfStudent(document, student) : []);
	/** Display only: the tier name is copied as stored and never reaches the model. */
	const tierName = $derived(student ? studentTierName(document, student) : null);
	/** The grade is live from the document, never stored or sent: moving a
	 * boundary re-renders every page without marking anything out of date.
	 * A student with no tier has no paper, so no grade from anyone else's boundaries. */
	const grade = $derived(
		student?.tier != null ? paperGrade(document, student.tier, figures.total) : null
	);
	const prose = $derived(report.edit ?? report);
	const displayName = $derived(student ? studentName(student) : '');

	/**
	 * The edit as the fields hold it: one field per item, so a strength stays
	 * one strength and an area stays one area through the edit. A typed
	 * newline splits an item and an emptied item is dropped.
	 */
	function valuesOf(draft: string): string[] {
		return draft
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line !== '');
	}

	type Section = 'strengths' | 'areasForImprovement';

	const SECTIONS = [
		{ key: 'strengths', title: 'Strengths', noun: 'Strength', ordered: false },
		{
			key: 'areasForImprovement',
			title: 'Areas for improvement',
			noun: 'Area for improvement',
			ordered: true
		}
	] as const satisfies readonly { key: Section; title: string; noun: string; ordered: boolean }[];

	/**
	 * Save on blur, not on input: every keystroke is not a change, and trimming
	 * never lands while the teacher is still typing. `onchange` only fires on a
	 * real change, and the store ignores an edit that changes nothing, so
	 * tabbing through the page spends no undo.
	 */
	function saveSection(section: Section, values: string[]): void {
		const next: ReportProse = {
			strengths: prose.strengths,
			areasForImprovement: prose.areasForImprovement
		};
		next[section] = values;
		onedit?.(next);
	}

	/** Replace one item of a section with what was typed in its field. */
	function saveItem(section: Section, index: number, value: string): void {
		saveSection(
			section,
			prose[section].flatMap((line, i) => (i === index ? valuesOf(value) : [line]))
		);
	}

	const figureOf = $derived(new Map(figures.entries.map((row) => [row.entryId, row])));

	const bands = $derived(
		questionBands(entries).map((band) => ({
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

	/**
	 * Settle the layout on the live page: try one column at full feedback
	 * size, then two, then shrink the feedback to 90% and record how far over
	 * the page it still runs. Re-runs whenever the content changes size — a
	 * teacher's edit, a rewrite, or fresh figures.
	 */
	function measureFit(box: HTMLElement) {
		if (!measure) return;
		const content = box.firstElementChild as HTMLElement | null;
		const feedback = content?.querySelector<HTMLElement>('[data-feedback]');
		const questions = content?.querySelector<HTMLElement>('[data-questions]');
		if (!content || !feedback || !questions) return;
		const settle = () => {
			fit.setFit(
				studentId,
				settleFit(box.clientHeight, (columns, scale) => {
					questions.dataset.columns = String(columns);
					feedback.style.fontSize = feedbackFontSize(scale) ?? '';
					return content.scrollHeight;
				})
			);
		};
		settle();
		const observer = new ResizeObserver(settle);
		observer.observe(content);
		const textObserver = new MutationObserver(settle);
		textObserver.observe(content, { subtree: true, characterData: true, childList: true });
		content.addEventListener('input', settle);
		return () => {
			observer.disconnect();
			textObserver.disconnect();
			content.removeEventListener('input', settle);
		};
	}
</script>

<div
	class="report-sheet relative h-[297mm] w-[210mm] shrink-0 overflow-hidden bg-white text-[9pt] leading-snug text-black shadow-md print:shadow-none"
	data-report-id={studentId}
	{@attach measureFit}
>
	<div class="flex min-h-full flex-col p-[10mm]">
		<header class="flex items-center justify-between gap-4">
			<div class="min-w-0">
				<h2 class="text-[18pt] leading-tight font-bold">{displayName}</h2>
				{#if document.className}<p class="text-[10pt]">{document.className}</p>{/if}
				<p class="text-[9pt] text-neutral-700">
					{document.label ?? ''}{#if tierName}<span data-testid="report-tier"
							>{document.label ? ' · ' : ''}<span class="font-semibold text-black">{tierName}</span
							></span
						>{/if}
				</p>
			</div>
			<div class="flex items-stretch border-2 border-black text-center">
				<div class="px-3 py-1.5">
					<div class="text-[20pt] leading-tight font-bold tabular-nums">
						{figures.total}/{figures.available}
					</div>
					<div class="text-[10pt]">{figures.percent}%</div>
				</div>
				{#if grade}
					<div
						class="flex flex-col justify-center bg-black px-4 py-1.5 text-white"
						data-testid="report-grade"
					>
						<div class="text-[9pt]">Grade</div>
						<div class="text-[22pt] leading-none font-bold">{grade.label}</div>
					</div>
					<div
						class="flex max-w-[32mm] items-center justify-center px-3 py-1.5 text-left text-[9.5pt] leading-tight"
						data-testid="report-to-next"
					>
						{#if grade.next === null}
							Top grade
						{:else}
							{@const next = grade.next}
							{count(next.marks, 'more mark')} for grade {next.label}
						{/if}
					</div>
				{/if}
			</div>
		</header>

		<div class="mt-4 border-t-2 border-black pt-2">
			<section
				data-feedback
				class="grid grid-cols-2 gap-6 text-[10.5pt] leading-snug"
				style:font-size={!measure ? feedbackFontSize(settled.scale) : undefined}
			>
				{#snippet feedback(section: (typeof SECTIONS)[number])}
					{@const { key, title, noun, ordered } = section}
					{@const lines = prose[key]}
					{@const emptyLine =
						key === 'strengths'
							? EMPTY_STRENGTHS_LINE
							: droppedNoMarks(figures)
								? EMPTY_AREAS_LINE
								: null}
					{#snippet item(line: string, i: number)}
						{#if editable}
							<textarea
								aria-label={displayName
									? `${noun} ${i + 1} for ${displayName}`
									: `${noun} ${i + 1}`}
								rows={1}
								class="field-sizing-content w-full resize-none bg-transparent align-top outline-none"
								value={line}
								onchange={(event) => saveItem(key, i, event.currentTarget.value)}></textarea>
						{:else}
							{line}
						{/if}
					{/snippet}
					<div>
						<h3 class="mb-1 text-[1.15em] font-bold">{title}</h3>
						{#if lines.length === 0}
							{#if editable}
								<textarea
									aria-label={displayName ? `${title} for ${displayName}` : title}
									rows={1}
									class="field-sizing-content w-full resize-none bg-transparent outline-none {emptyLine
										? 'placeholder:text-current'
										: ''}"
									placeholder={emptyLine ?? `Add ${noun.toLowerCase()}`}
									value=""
									onchange={(event) => saveSection(key, valuesOf(event.currentTarget.value))}
								></textarea>
							{:else if emptyLine}
								<p>{emptyLine}</p>
							{/if}
						{:else if ordered}
							<ol class="list-decimal space-y-1.5 pl-[1.2em]">
								{#each lines as line, i (i)}<li>{@render item(line, i)}</li>{/each}
							</ol>
						{:else}
							<ul class="list-disc space-y-1 pl-[1.2em]">
								{#each lines as line, i (i)}<li>{@render item(line, i)}</li>{/each}
							</ul>
						{/if}
					</div>
				{/snippet}
				{#each SECTIONS as section (section.key)}
					{@render feedback(section)}
				{/each}
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

		<!-- One column stacks the two tables and hides the second header, so it reads as one table. -->
		<div
			data-questions
			data-columns={!measure ? settled.columns : undefined}
			class="mt-4 grid grid-cols-2 gap-5 text-[9pt] data-[columns=1]:grid-cols-1 data-[columns=1]:gap-y-0 data-[columns=1]:[&>table:last-child>thead]:hidden"
		>
			{#each halves as half, h (h)}
				<table class="w-full table-fixed self-start leading-[1.3]">
					<colgroup>
						<col class="w-[3.2em]" />
						<col />
						<col class="w-[3.4em]" />
						<col class="w-[1.6em]" />
					</colgroup>
					<thead>
						<tr class="border-b border-black text-left">
							<th>Q</th>
							<th></th>
							<th class="text-right">Marks</th>
							<th></th>
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
