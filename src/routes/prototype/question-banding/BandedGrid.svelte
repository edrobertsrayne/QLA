<!--
	PROTOTYPE — #27's Variant D grid (with #28's facility row) re-banded on the stored
	`questionNumber` (ADR 0002). One engine, three structurally different ways to show the band:
	  A  a spanning band row over the entry headers (label pinned while the band scrolls)
	  B  no band row: alternate questions shaded down the whole grid, a "you are in" strip, and a
	     second facility row pooled per question
	  C  a band row that collapses a question to one totals column
-->
<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import { untrack } from 'svelte';
	import UserXIcon from '@lucide/svelte/icons/user-x';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import type { ParseQuestion } from '$lib/server/parse/schema.js';
	import {
		bandFor,
		type BandingState,
		type QuestionBand,
		type Result
	} from '$lib/prototypes/question-banding/banding.svelte.js';

	let {
		state: s,
		variant,
		onSelect
	}: {
		state: BandingState;
		variant: 'A' | 'B' | 'C';
		onSelect: (key: string) => void;
	} = $props();

	const engine = $derived(s.engine);

	let proxyEl = $state<HTMLElement | null>(null);
	$effect(() => {
		engine.proxyEl = proxyEl;
	});

	// ---- C: collapsed questions -----------------------------------------------------------------
	let collapsed = $state<Record<string, boolean>>({});
	const bandKey = (b: QuestionBand) => `${b.start}:${b.questionNumber}`;
	const isCollapsed = (b: QuestionBand) =>
		variant === 'C' && b.entries.length > 1 && !!collapsed[bandKey(b)];
	function setAll(value: boolean) {
		const next: Record<string, boolean> = {};
		if (value) for (const b of s.bands) if (b.entries.length > 1) next[bandKey(b)] = true;
		collapsed = next;
	}
	// Navigating (arrows/Tab) into a collapsed question opens it rather than hiding the cursor.
	// Reacts to cursor moves only, so collapsing the question the cursor sits in still works.
	let lastCol = -2;
	$effect(() => {
		const c = engine.cursor.col;
		if (c === lastCol) return;
		lastCol = c;
		untrack(() => {
			const b = s.bands.find((x) => c >= x.start && c <= x.end);
			if (b && isCollapsed(b)) collapsed[bandKey(b)] = false;
		});
	});

	type Col =
		| {
				kind: 'entry';
				entry: ParseQuestion;
				col: number;
				band: QuestionBand;
				bandIndex: number;
				first: boolean;
		  }
		| { kind: 'question'; band: QuestionBand; bandIndex: number; first: true };

	const cols = $derived.by(() => {
		const out: Col[] = [];
		s.bands.forEach((band, bandIndex) => {
			if (isCollapsed(band)) {
				out.push({ kind: 'question', band, bandIndex, first: true });
				return;
			}
			band.entries.forEach((entry, i) =>
				out.push({ kind: 'entry', entry, col: band.start + i, band, bandIndex, first: i === 0 })
			);
		});
		return out;
	});

	const cursorBand = $derived(
		s.bands.find((b) => engine.cursor.col >= b.start && engine.cursor.col <= b.end)
	);

	/** A single-column band whose band cell the singleton knob governs. */
	const single = (b: QuestionBand) => b.entries.length === 1;
	const merged = (b: QuestionBand) => variant !== 'B' && single(b) && s.singleton === 'merge';

	function progress(studentId: string) {
		let n = 0;
		for (const leaf of engine.leaves) if (engine.markAt(studentId, leaf.id) != null) n++;
		return `${n}/${engine.leaves.length}`;
	}
	function questionTotal(studentId: string, b: QuestionBand) {
		let sum = 0;
		let n = 0;
		for (const e of b.entries) {
			const v = engine.markAt(studentId, e.id);
			if (v == null) continue;
			sum += v;
			n++;
		}
		return { sum, n, partial: n > 0 && n < b.entries.length };
	}

	function selectCell(row: number, col: number) {
		engine.commitEditing();
		engine.cursor = { row, col };
		engine.focusProxy();
	}
	function editCell(row: number, col: number) {
		selectCell(row, col);
		engine.startEditingBlank();
	}
	function commitIfStill(row: number, col: number) {
		if (engine.editing?.row === row && engine.editing?.col === col) engine.commitEditing();
	}
	let editInputEl = $state<HTMLInputElement | null>(null);
	$effect(() => {
		const editing = engine.editing;
		if (!editing || !editInputEl) return;
		editInputEl.focus();
		if (editing.selectAll) editInputEl.select();
		else editInputEl.setSelectionRange(editInputEl.value.length, editInputEl.value.length);
	});

	const edge = 'border-l-2 border-l-foreground/30';
	const shade = (c: Col) =>
		variant === 'B' && c.bandIndex % 2 === 1 ? 'bg-slate-500/12 dark:bg-slate-400/15' : '';
	const flagged = (b: QuestionBand) => s.flagFallback && b.fallback;
	const hatch =
		'background-image: repeating-linear-gradient(135deg, rgb(245 158 11 / 0.28) 0 4px, transparent 4px 8px)';
	const tint: Record<string, string> = {
		red: 'bg-red-500/25',
		amber: 'bg-amber-400/30',
		green: 'bg-emerald-500/20'
	};
	const pct = (f: number) => Math.round(f * 100);
	const label = (b: QuestionBand) => (b.fallback ? b.questionNumber : `Q${b.questionNumber}`);
	const fallbackTitle = (b: QuestionBand) =>
		`The parse gave no question number for ${b.entries[0].id}, so it is banded under its own label instead of its question. Fix it on the breakdown page.`;

	const corner = 'sticky z-20 border-b border-border bg-card';
</script>

{#snippet facilityCell(r: Result | null, extra = '', colspan = 1)}
	{@const band = r ? bandFor(r.facility) : null}
	<td
		{colspan}
		class={`min-w-10 border-b border-l border-border bg-card p-0 text-center text-[11px] leading-tight tabular-nums ${extra}`}
		title={r?.facility != null
			? `${r.label}: facility ${pct(r.facility)}%${r.partMarked ? ` (part-marked, ${r.n}/${r.of})` : ''}`
			: undefined}
	>
		{#if r && r.facility != null}
			<button
				type="button"
				class={`${band ? tint[band] : ''} ${r.partMarked ? 'italic outline-1 -outline-offset-2 outline-foreground outline-dashed' : ''} my-1 w-[calc(100%-4px)] rounded-sm py-0.5 font-semibold hover:ring-2 hover:ring-primary`}
				onclick={() => onSelect(r.key)}>{pct(r.facility)}</button
			>
		{:else}
			<span class="text-muted-foreground">—</span>
		{/if}
	</td>
{/snippet}

{#snippet entryHeader(c: Extract<Col, { kind: 'entry' }>, rowspan = 1)}
	<th
		{rowspan}
		class={`w-10 min-w-10 border-b border-l border-border px-0 py-0.5 ${c.first ? edge : ''} ${engine.cursor.col === c.col ? 'bg-primary/15' : shade(c) || 'bg-muted/30'}`}
		style={variant === 'B' && c.first && flagged(c.band) ? hatch : undefined}
	>
		<Popover.Root>
			<Popover.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						type="button"
						class="flex w-full flex-col items-center text-[11px] leading-tight font-semibold hover:underline"
					>
						<span class="flex items-center gap-0.5">
							{#if variant === 'B' && flagged(c.band)}<TriangleAlertIcon
									class="size-3 text-amber-600"
								/>{/if}{c.entry.id}
						</span>
						<span class="font-normal text-muted-foreground">/{c.entry.marks ?? '?'}</span>
					</button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="w-60 text-xs">
				<p class="mb-1 font-medium">{c.entry.id} — {c.entry.summary}</p>
				<p class="text-muted-foreground">
					Question {c.entry.questionNumber} · max {c.entry.marks} · {c.entry.specPoint ?? '—'} · {c
						.entry.ao ?? '—'}
				</p>
				{#if c.band.fallback}
					<p class="mt-1 text-amber-700">{fallbackTitle(c.band)}</p>
				{/if}
			</Popover.Content>
		</Popover.Root>
	</th>
{/snippet}

<div
	bind:this={proxyEl}
	contenteditable="true"
	role="application"
	aria-label="Marksheet grid input proxy"
	class="absolute h-px w-px overflow-hidden opacity-0"
	onkeydown={(e) => engine.handleKeydown(e)}
	onpaste={(e) => engine.handlePaste(e)}
></div>

{#if variant === 'B'}
	<div class="mx-4 mb-1.5 flex h-6 items-center gap-2 text-xs">
		{#if cursorBand}
			<span class="rounded bg-primary/15 px-2 py-0.5 font-semibold">
				{cursorBand.fallback ? cursorBand.questionNumber : `Question ${cursorBand.questionNumber}`}
			</span>
			<span class="text-muted-foreground">
				{cursorBand.undivided ? 'undivided' : cursorBand.entries.map((e) => e.id).join(' · ')} — {cursorBand.marks}
				marks
			</span>
			{#if flagged(cursorBand)}
				<span class="flex items-center gap-1 text-amber-700"
					><TriangleAlertIcon class="size-3.5" /> no question number from the parse</span
				>
			{/if}
		{/if}
	</div>
{/if}
{#if variant === 'C'}
	<div class="mx-4 mb-1.5 flex items-center gap-2 text-xs">
		<button
			type="button"
			class="rounded border px-2 py-0.5 hover:bg-muted"
			onclick={() => setAll(true)}>Collapse all questions</button
		>
		<button
			type="button"
			class="rounded border px-2 py-0.5 hover:bg-muted"
			onclick={() => setAll(false)}>Expand all</button
		>
		<span class="text-muted-foreground"
			>A collapsed question shows each student's total; moving into it opens it.</span
		>
	</div>
{/if}

<div
	class="mx-4 max-h-[calc(100vh-12rem)] overflow-auto rounded-lg border border-border"
	role="grid"
>
	<table class="border-collapse text-sm">
		<thead class="sticky top-0 z-30">
			{#if variant !== 'B'}
				<tr>
					<th class={`${corner} left-0 w-44 max-w-44 min-w-44`}></th>
					<th class={`${corner} left-44 w-14 min-w-14 border-l`}></th>
					{#each s.bands as b, bi (bandKey(b))}
						{#if isCollapsed(b)}
							<th
								rowspan="2"
								class={`min-w-12 border-b border-border px-1 py-0.5 text-[11px] font-semibold ${edge} bg-muted`}
							>
								<button
									type="button"
									class="flex w-full flex-col items-center leading-tight hover:underline"
									title="Expand question"
									onclick={() => (collapsed[bandKey(b)] = false)}
								>
									<span class="flex items-center"
										><ChevronRightIcon class="size-3" />{label(b)}</span
									>
									<span class="font-normal text-muted-foreground">/{b.marks}</span>
								</button>
							</th>
						{:else if merged(b)}
							{@const c = cols.find((x) => x.kind === 'entry' && x.col === b.start)}
							{#if c && c.kind === 'entry'}{@render entryHeader(c, 2)}{/if}
						{:else}
							<th
								colspan={b.entries.length}
								class={`border-b border-border px-0 py-0.5 text-left text-[11px] font-semibold ${edge} ${flagged(b) ? 'bg-amber-400/25 text-amber-900 dark:text-amber-200' : cursorBand === b ? 'bg-primary/15 text-foreground' : 'bg-muted/50 text-muted-foreground'}`}
								title={flagged(b) ? fallbackTitle(b) : undefined}
								data-band={bi}
							>
								{#if !(single(b) && s.singleton === 'blank' && !flagged(b))}
									<span class="sticky left-[232px] inline-flex items-center gap-0.5 px-1">
										{#if variant === 'C' && b.entries.length > 1}
											<button
												type="button"
												class="rounded hover:bg-muted"
												title="Collapse to one totals column"
												onclick={() => (collapsed[bandKey(b)] = true)}
												><ChevronDownIcon class="size-3" /></button
											>
										{/if}
										{#if flagged(b)}<TriangleAlertIcon class="size-3 shrink-0" />{/if}
										<button
											type="button"
											class="whitespace-nowrap hover:underline"
											onclick={() => selectCell(engine.cursor.row, b.start)}
										>
											{label(b)}{#if variant === 'C' && !single(b)}<span
													class="font-normal text-muted-foreground"
												>
													· {b.marks}</span
												>{/if}
										</button>
									</span>
								{/if}
							</th>
						{/if}
					{/each}
				</tr>
			{/if}
			<tr>
				<th class={`${corner} left-0 w-44 max-w-44 min-w-44 px-2 text-left text-xs font-medium`}
					>Student</th
				>
				<th class={`${corner} left-44 w-14 min-w-14 border-l text-xs font-medium`}>Done</th>
				{#each cols as c (c.kind === 'entry' ? c.entry.id : `q-${bandKey(c.band)}`)}
					{#if c.kind === 'entry' && !(variant !== 'B' && merged(c.band))}
						{@render entryHeader(c)}
					{/if}
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each engine.students as student, row (student.id)}
				{@const absent = engine.isAbsent(student.id)}
				<tr class={engine.cursor.row === row ? 'bg-muted/30' : ''}>
					<td
						class={`sticky left-0 z-10 w-44 max-w-44 min-w-44 border-b border-border bg-card px-1.5 py-0.5 text-left ${engine.cursor.row === row && engine.cursor.col === -1 ? 'ring-2 ring-primary ring-inset' : ''}`}
						onclick={() => selectCell(row, -1)}
					>
						<div class="flex items-center gap-1">
							<UserXIcon
								class={`size-3.5 shrink-0 ${absent ? 'text-destructive' : 'text-muted-foreground/40'}`}
							/>
							<span
								class={`min-w-0 flex-1 truncate ${absent ? 'text-muted-foreground line-through' : ''}`}
								>{student.name}</span
							>
						</div>
					</td>
					<td
						class="sticky left-44 z-10 w-14 min-w-14 border-b border-l border-border bg-card px-1 text-center text-xs text-muted-foreground tabular-nums"
					>
						{absent ? 'absent' : progress(student.id)}
					</td>
					{#each cols as c (c.kind === 'entry' ? c.entry.id : `q-${bandKey(c.band)}`)}
						{#if c.kind === 'question'}
							{@const t = questionTotal(student.id, c.band)}
							<td
								class={`min-w-12 border-b border-l border-border bg-muted/60 px-1 py-0.5 text-center text-xs tabular-nums ${edge} ${t.partial ? 'italic' : ''} ${absent ? 'text-muted-foreground' : ''}`}
								title={t.partial
									? `${t.n} of ${c.band.entries.length} subquestions marked`
									: undefined}
								onclick={() => selectCell(row, c.band.start)}
							>
								{t.n ? t.sum : ''}
							</td>
						{:else}
							{@const col = c.col}
							{@const value = engine.markAt(student.id, c.entry.id)}
							{@const over = engine.isOverMax(student.id, c.entry)}
							{@const isEditing = engine.editing?.row === row && engine.editing?.col === col}
							<td
								class={`w-10 min-w-10 border-b border-l border-border px-0 py-0.5 text-center tabular-nums ${c.first ? edge : ''} ${shade(c)} ${engine.cursor.row === row && engine.cursor.col === col ? 'ring-2 ring-primary ring-inset' : ''} ${over ? 'bg-destructive/10 font-semibold text-destructive' : ''} ${absent ? 'bg-muted/60' : ''}`}
								onclick={() => selectCell(row, col)}
								ondblclick={() => editCell(row, col)}
							>
								{#if isEditing}
									<input
										bind:this={editInputEl}
										class="w-full bg-transparent text-center outline-none"
										value={engine.editing?.value ?? ''}
										oninput={(e) => engine.updateEditingValue((e.target as HTMLInputElement).value)}
										onkeydown={(e) => engine.handleKeydown(e)}
										onblur={() => commitIfStill(row, col)}
									/>
								{:else}
									{value ?? ''}
								{/if}
							</td>
						{/if}
					{/each}
				</tr>
			{/each}
		</tbody>
		{#if s.snapshot}
			<tfoot class="sticky bottom-0 z-20">
				<tr class="border-t-2 border-foreground/40">
					<td
						class="sticky left-0 z-10 w-44 min-w-44 border-b border-border bg-card px-2 py-1 text-xs font-semibold"
						>Facility %</td
					>
					<td class="sticky left-44 z-10 w-14 min-w-14 border-b border-l border-border bg-card"
					></td>
					{#each cols as c (c.kind === 'entry' ? c.entry.id : `q-${bandKey(c.band)}`)}
						{#if c.kind === 'question'}
							{@render facilityCell(s.questionResult(c.band.questionNumber), `${edge} min-w-12`)}
						{:else}
							{@render facilityCell(s.entryResult(c.entry.id), c.first ? edge : '')}
						{/if}
					{/each}
				</tr>
				{#if variant === 'B'}
					<tr>
						<td
							class="sticky left-0 z-10 w-44 min-w-44 border-b border-border bg-card px-2 py-1 text-xs font-semibold"
							>Question %</td
						>
						<td class="sticky left-44 z-10 w-14 min-w-14 border-b border-l border-border bg-card"
						></td>
						{#each s.bands as b (bandKey(b))}
							{@render facilityCell(s.questionResult(b.questionNumber), edge, b.entries.length)}
						{/each}
					</tr>
				{/if}
				<tr>
					<td
						class="sticky left-0 z-10 w-44 min-w-44 border-b border-border bg-card px-2 text-[11px] text-muted-foreground"
						>Marked (if partial)</td
					>
					<td class="sticky left-44 z-10 w-14 min-w-14 border-b border-l border-border bg-card"
					></td>
					{#each cols as c (c.kind === 'entry' ? c.entry.id : `q-${bandKey(c.band)}`)}
						{@const r =
							c.kind === 'entry'
								? s.entryResult(c.entry.id)
								: s.questionResult(c.band.questionNumber)}
						<td
							class={`border-b border-l border-border bg-card px-0 text-center text-[10px] text-amber-700 tabular-nums ${c.first ? edge : ''}`}
							>{r?.partMarked ? `${r.n}/${r.of}` : ''}</td
						>
					{/each}
				</tr>
			</tfoot>
		{/if}
	</table>
</div>
