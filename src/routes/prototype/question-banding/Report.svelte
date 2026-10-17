<!--
	PROTOTYPE — #28's report view (Red / Amber / Green folded / Not scored, worst-first), asked
	whether results read per question as well as per breakdown entry:
	  A  entries only, as #28 shipped — the question number rides along as a column
	  B  a By entry / By question switch; question rows pool every entry sharing a questionNumber
	  C  questions are the rows; a divided question unfolds to its entries, each still banded
-->
<script lang="ts">
	import { tick } from 'svelte';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import {
		bandFor,
		worstFirst,
		THRESHOLDS,
		type Band,
		type BandingState,
		type Result
	} from '$lib/prototypes/question-banding/banding.svelte.js';

	let {
		state: s,
		variant,
		focus
	}: { state: BandingState; variant: 'A' | 'B' | 'C'; focus: string | null } = $props();

	let granularity = $state<'entry' | 'question'>('entry');
	let greenOpen = $state(false);
	let open = $state<Record<string, boolean>>({});

	const questionMode = $derived(variant === 'C' || (variant === 'B' && granularity === 'question'));
	const rows = $derived(
		s.snapshot ? (questionMode ? s.snapshot.questions : s.snapshot.entries) : []
	);
	const sections = $derived.by(() => {
		const all = worstFirst(rows);
		const by = (b: Band | null) => all.filter((r) => bandFor(r.facility) === b);
		return { red: by('red'), amber: by('amber'), green: by('green'), none: by(null) };
	});

	// Arriving from a facility cell: pick the granularity, unfold what hides it, scroll, outline.
	$effect(() => {
		if (!focus || !s.snapshot) return;
		const isQuestion = focus.startsWith('q:');
		if (variant === 'B') granularity = isQuestion ? 'question' : 'entry';
		const target = focus;
		if (variant === 'C' && !isQuestion) {
			const q = s.snapshot.questions.find((r) => r.entries.some((e) => e.id === focus));
			if (q) open[q.key] = true;
		}
		const host = questionMode
			? s.snapshot.questions.find((r) => r.key === target || r.entries.some((e) => e.id === target))
			: s.snapshot.entries.find((r) => r.key === target);
		if (host && bandFor(host.facility) === 'green') greenOpen = true;
		tick().then(() =>
			document.getElementById(`row-${target}`)?.scrollIntoView({ block: 'center' })
		);
	});

	const tint: Record<string, string> = {
		red: 'bg-red-500/12',
		amber: 'bg-amber-400/15',
		green: 'bg-emerald-500/10'
	};
	const titles: Record<Band, string> = {
		red: 'Red — the class struggled',
		amber: 'Amber — mixed',
		green: 'Green — secure'
	};
	const chip: Record<Band, string> = {
		red: 'bg-red-500/20 text-red-800 border-red-600',
		amber: 'bg-amber-400/25 text-amber-800 border-amber-600',
		green: 'bg-emerald-500/15 text-emerald-800 border-emerald-700'
	};

	const distinct = (xs: (string | null)[]) => [...new Set(xs.filter(Boolean))].join(', ') || '—';
	function summaryOf(r: Result) {
		if (r.entries.length === 1) return r.entries[0].summary;
		return `${r.entries.length} subquestions: ${r.entries.map((e) => e.id).join(', ')}`;
	}
	const pct = (f: number) => Math.round(f * 100);
</script>

{#snippet row(r: Result, depth: 0 | 1 = 0)}
	{@const band = bandFor(r.facility)}
	{@const expandable = variant === 'C' && depth === 0 && r.entries.length > 1}
	{@const isQ = r.key.startsWith('q:')}
	<tr
		id={`row-${r.key}`}
		class={`scroll-mt-24 border-b border-border ${band ? tint[band] : ''} ${focus === r.key ? 'outline-2 -outline-offset-2 outline-primary' : ''} ${r.facility == null ? 'text-muted-foreground' : ''}`}
	>
		<td
			class={`py-1.5 pr-3 font-semibold whitespace-nowrap tabular-nums ${depth ? 'pl-10' : 'pl-3'}`}
		>
			<span class="inline-flex items-center gap-1">
				{#if expandable}
					<button
						type="button"
						onclick={() => (open[r.key] = !open[r.key])}
						aria-label="Toggle subquestions"
					>
						<ChevronRightIcon
							class={`size-4 transition-transform ${open[r.key] ? 'rotate-90' : ''}`}
						/>
					</button>
				{:else if variant === 'C' && depth === 0}
					<span class="inline-block w-4"></span>
				{/if}
				{isQ && !r.fallback ? `Q${r.label}` : r.label}
				{#if r.fallback && s.flagFallback}
					<TriangleAlertIcon
						class="size-3.5 text-amber-600"
						aria-label="No question number from the parse"
					/>
				{/if}
			</span>
		</td>
		{#if variant === 'A'}
			<td class="px-3 py-1.5 text-xs text-muted-foreground tabular-nums"
				>{r.entries[0].questionNumber}</td
			>
		{/if}
		<td class="max-w-md truncate px-3 py-1.5" title={summaryOf(r)}>{summaryOf(r)}</td>
		<td class="px-3 py-1.5 text-right tabular-nums">{r.marks}</td>
		<td class="px-3 py-1.5 tabular-nums">{distinct(r.entries.map((e) => e.specPoint))}</td>
		<td class="px-3 py-1.5">{distinct(r.entries.map((e) => e.ao))}</td>
		<td class="px-3 py-1.5 whitespace-nowrap">
			{#if r.facility != null}
				<span class={`inline-flex items-center gap-2 ${r.partMarked ? 'italic' : ''}`}>
					<span class="w-10 text-right tabular-nums">{pct(r.facility)}%</span>
					<span class="text-xs text-muted-foreground tabular-nums"
						>{r.mean!.toFixed(1)}/{r.marks}</span
					>
					{#if depth === 1 && band}
						<span class={`rounded border px-1 text-[10px] not-italic ${chip[band]}`}>{band}</span>
					{/if}
				</span>
			{:else}
				<span class="text-xs">Not marked yet</span>
			{/if}
		</td>
		<td
			class={`px-3 py-1.5 text-right text-xs tabular-nums ${r.partMarked ? 'font-medium text-amber-700' : 'text-muted-foreground'}`}
			>{r.n}/{r.of}</td
		>
	</tr>
	{#if expandable && open[r.key] && s.snapshot}
		{#each r.entries as e (e.id)}
			{@const er = s.snapshot.entries.find((x) => x.key === e.id)}
			{#if er}{@render row(er, 1)}{/if}
		{/each}
	{/if}
{/snippet}

{#snippet table(results: Result[])}
	<div class="overflow-hidden rounded-lg border border-border">
		<table class="w-full border-collapse text-sm">
			<thead class="bg-card text-left text-xs text-muted-foreground">
				<tr class="border-b border-border">
					<th class="px-3 py-2 font-medium">{questionMode ? 'Question' : 'Entry'}</th>
					{#if variant === 'A'}<th class="px-3 py-2 font-medium">Q</th>{/if}
					<th class="px-3 py-2 font-medium">Summary</th>
					<th class="px-3 py-2 text-right font-medium">Marks</th>
					<th class="px-3 py-2 font-medium">Spec point</th>
					<th class="px-3 py-2 font-medium">AO</th>
					<th class="px-3 py-2 font-medium">Facility</th>
					<th class="px-3 py-2 text-right font-medium">Marked</th>
				</tr>
			</thead>
			<tbody>
				{#each results as r (r.key)}{@render row(r)}{/each}
			</tbody>
		</table>
	</div>
{/snippet}

<div class="mx-auto max-w-5xl px-4 pt-2">
	<div class="flex flex-wrap items-end gap-3">
		<div>
			<h2 class="text-xl font-semibold">Question analysis — Biology Paper 1H · 11B</h2>
			{#if s.snapshot}
				<p class="mt-1 text-sm text-muted-foreground">
					{s.snapshot.present} students ({s.snapshot.absent} absent left out) · facility = marks gained
					÷ marks available{questionMode ? ', pooled over every subquestion of the question' : ''}.
					Red below {pct(THRESHOLDS.red)}%, green from {pct(THRESHOLDS.green)}%.
				</p>
			{/if}
		</div>
		{#if variant === 'B'}
			<div class="ml-auto inline-flex rounded-md border p-0.5 text-sm">
				{#each [['entry', 'By entry'], ['question', 'By question']] as [k, l] (k)}
					<button
						type="button"
						class={`rounded px-3 py-1 ${granularity === k ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
						onclick={() => (granularity = k as 'entry' | 'question')}>{l}</button
					>
				{/each}
			</div>
		{/if}
	</div>

	<div class="mt-5 flex flex-col gap-6 pb-10">
		{#each ['red', 'amber'] as const as band (band)}
			<section>
				<h3 class="mb-2 flex items-center gap-2 text-base font-semibold">
					<span class={`rounded-full border px-2 py-0.5 text-xs ${chip[band]}`}>{band}</span>
					{titles[band]}
					<span class="text-sm font-normal text-muted-foreground">({sections[band].length})</span>
				</h3>
				{#if sections[band].length}{@render table(sections[band])}{:else}<p
						class="text-sm text-muted-foreground"
					>
						None.
					</p>{/if}
			</section>
		{/each}
		<section>
			<button
				type="button"
				class="mb-2 flex items-center gap-2 text-base font-semibold"
				onclick={() => (greenOpen = !greenOpen)}
			>
				<ChevronRightIcon class={`size-4 transition-transform ${greenOpen ? 'rotate-90' : ''}`} />
				<span class={`rounded-full border px-2 py-0.5 text-xs ${chip.green}`}>green</span>
				{titles.green}
				<span class="text-sm font-normal text-muted-foreground">({sections.green.length})</span>
			</button>
			{#if greenOpen}{@render table(sections.green)}{/if}
		</section>
		{#if sections.none.length}
			<section>
				<h3 class="mb-2 text-base font-semibold text-muted-foreground">
					Not scored ({sections.none.length})
				</h3>
				{@render table(sections.none)}
			</section>
		{/if}
	</div>
</div>
