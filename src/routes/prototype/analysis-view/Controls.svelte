<!--
	PROTOTYPE — prototype-only knobs, not product UI. Thresholds + a live facility strip so the band
	cut-offs can be chosen against the data on screen; stale policy; RAG treatment; columns; colour
	simulation; sample helpers including loading a real Phase 1 breakdown.json.
-->
<script lang="ts">
	import type { GridEngine } from '$lib/prototypes/marksheet-grid/grid-state.svelte.js';
	import {
		COLUMN_KEYS,
		THRESHOLD_PRESETS,
		bandFor,
		computeSnapshot,
		resetSample,
		type AnalysisState,
		type ColourSim,
		type RagTreatment,
		type RunTrigger,
		type StalePolicy
	} from '$lib/prototypes/analysis-view/analysis.svelte.js';
	import type { ParseQuestion } from '$lib/server/parse/schema.js';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';

	let {
		engine,
		analysis,
		variant
	}: { engine: GridEngine; analysis: AnalysisState; variant: string } = $props();

	let open = $state(true);
	let jsonOpen = $state(false);
	let jsonText = $state('');
	let jsonError = $state<string | null>(null);

	const STALE: StalePolicy[] = ['badge', 'clear', 'prompt'];
	const RAG: RagTreatment[] = ['chip', 'tint', 'bar'];
	const SIM: ColourSim[] = ['normal', 'greyscale', 'deuteranopia'];
	const TRIG: RunTrigger[] = ['button', 'on-open'];
	const STALE_LABEL: Record<StalePolicy, string> = {
		badge: 'keep + "out of date" badge',
		clear: 'auto-clear result',
		prompt: 'dim + re-run prompt'
	};

	function cycle<T>(list: T[], current: T): T {
		return list[(list.indexOf(current) + 1) % list.length];
	}

	// Live, snapshot-independent view of where every leaf lands — for choosing thresholds only.
	const live = $derived(computeSnapshot(engine).results.filter((r) => r.facility != null));
	const counts = $derived.by(() => {
		const c = { red: 0, amber: 0, green: 0 };
		for (const r of live) c[bandFor(r.facility, analysis.thresholds)!]++;
		return c;
	});

	function pct(v: number) {
		return Math.round(v * 100);
	}
	function setRed(v: number) {
		analysis.thresholds.red = Math.min(v / 100, analysis.thresholds.green);
	}
	function setGreen(v: number) {
		analysis.thresholds.green = Math.max(v / 100, analysis.thresholds.red);
	}

	function changeAMark() {
		const present = engine.students.filter((s) => !engine.isAbsent(s.id));
		const s = present[Math.floor(Math.random() * present.length)];
		const leaf = engine.leaves.filter((l) => l.marks != null)[
			Math.floor(Math.random() * engine.leaves.length * 0.8)
		];
		if (!s || !leaf) return;
		const key = `${s.id}::${leaf.id}`;
		// Always a different value, so the stale treatment is guaranteed to trigger.
		engine.marks[key] = ((engine.marks[key] ?? 0) + 1) % (leaf.marks! + 1);
		engine.message = { text: `Prototype: changed ${s.name}'s mark on ${leaf.id}.`, tone: 'info' };
	}

	function clearMarks() {
		engine.marks = {};
		engine.message = { text: 'Prototype: all marks cleared.', tone: 'info' };
	}

	function loadJson() {
		try {
			const parsed = JSON.parse(jsonText);
			const questions: ParseQuestion[] = Array.isArray(parsed)
				? parsed
				: (parsed.questions ?? parsed.breakdown?.questions);
			if (!Array.isArray(questions) || !questions.length || !questions[0].id)
				throw new Error('Expected {questions: [...]} or {breakdown: {questions: [...]}}');
			engine.leaves = questions;
			engine.marks = {};
			analysis.snapshot = null;
			jsonOpen = false;
			jsonError = null;
			engine.message = {
				text: `Loaded ${questions.length} leaves. Marks cleared — paste the class's marks into the grid.`,
				tone: 'info'
			};
		} catch (e) {
			jsonError = (e as Error).message;
		}
	}

	const pill = 'rounded-full border border-border bg-input/30 px-2.5 py-1 hover:bg-input/50';
</script>

<div
	class="fixed right-3 bottom-3 z-40 flex w-[22rem] flex-col gap-2 rounded-lg border-2 border-dashed border-amber-400 bg-card/95 p-2.5 text-xs shadow-md backdrop-blur print:hidden"
>
	<button
		type="button"
		class="flex items-center justify-between font-semibold tracking-wide text-muted-foreground uppercase"
		onclick={() => (open = !open)}
	>
		Prototype controls
		{#if open}<ChevronDownIcon class="size-4" />{:else}<ChevronUpIcon class="size-4" />{/if}
	</button>

	{#if open}
		<section class="flex flex-col gap-1.5">
			<div class="flex items-center justify-between">
				<span class="font-medium">RAG thresholds (facility)</span>
				<span class="tabular-nums">
					<span class="text-red-700">{counts.red} red</span> ·
					<span class="text-amber-700">{counts.amber} amber</span> ·
					<span class="text-emerald-700">{counts.green} green</span>
				</span>
			</div>
			<div class="relative h-7 rounded bg-muted">
				<div
					class="absolute inset-y-0 left-0 bg-red-500/15"
					style:width={`${analysis.thresholds.red * 100}%`}
				></div>
				<div
					class="absolute inset-y-0 bg-amber-400/20"
					style:left={`${analysis.thresholds.red * 100}%`}
					style:width={`${(analysis.thresholds.green - analysis.thresholds.red) * 100}%`}
				></div>
				{#each live as r (r.leaf.id)}
					<span
						class={`absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${r.provisional ? 'border border-foreground/70 bg-transparent' : 'bg-foreground/70'}`}
						style:left={`${r.facility! * 100}%`}
						title={`${r.leaf.id}: ${pct(r.facility!)}%${r.provisional ? ' (provisional)' : ''}`}
					></span>
				{/each}
			</div>
			<div class="flex items-center gap-2">
				<label class="flex items-center gap-1"
					>red &lt;
					<input
						type="number"
						class="w-12 rounded border border-border bg-background px-1"
						value={pct(analysis.thresholds.red)}
						oninput={(e) => setRed(+(e.target as HTMLInputElement).value)}
					/>%</label
				>
				<label class="flex items-center gap-1"
					>green ≥
					<input
						type="number"
						class="w-12 rounded border border-border bg-background px-1"
						value={pct(analysis.thresholds.green)}
						oninput={(e) => setGreen(+(e.target as HTMLInputElement).value)}
					/>%</label
				>
			</div>
			<div class="flex flex-wrap gap-1">
				{#each THRESHOLD_PRESETS as p (p.label)}
					<button
						type="button"
						class={`${pill} ${analysis.thresholds.red === p.red && analysis.thresholds.green === p.green ? 'border-foreground font-semibold' : ''}`}
						onclick={() => (analysis.thresholds = { red: p.red, green: p.green })}>{p.label}</button
					>
				{/each}
			</div>
		</section>

		<section class="flex flex-wrap gap-1.5 border-t border-border pt-2">
			<button
				type="button"
				class={pill}
				onclick={() => (analysis.stalePolicy = cycle(STALE, analysis.stalePolicy))}
			>
				On mark change: <strong>{STALE_LABEL[analysis.stalePolicy]}</strong>
			</button>
			<button type="button" class={pill} onclick={() => (analysis.rag = cycle(RAG, analysis.rag))}>
				RAG as: <strong>{analysis.rag}</strong>
			</button>
			<button
				type="button"
				class={pill}
				onclick={() => (analysis.colourSim = cycle(SIM, analysis.colourSim))}
			>
				View as: <strong>{analysis.colourSim}</strong>
			</button>
			{#if variant === 'A'}
				<button
					type="button"
					class={pill}
					onclick={() => (analysis.trigger = cycle(TRIG, analysis.trigger))}
				>
					Run: <strong>{analysis.trigger === 'button' ? 'button only' : 'on opening tab'}</strong>
				</button>
			{/if}
			{#if variant === 'D'}
				<button
					type="button"
					class={pill}
					onclick={() =>
						(analysis.afterGenerate = analysis.afterGenerate === 'stay' ? 'open-report' : 'stay')}
				>
					After generate: <strong
						>{analysis.afterGenerate === 'stay' ? 'stay on marksheet' : 'open report'}</strong
					>
				</button>
				<button
					type="button"
					class={pill}
					onclick={() => (analysis.hardestStrip = !analysis.hardestStrip)}
				>
					"Hardest" strip: <strong>{analysis.hardestStrip ? 'on' : 'off'}</strong>
				</button>
			{/if}
		</section>

		<section class="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-2">
			<span class="font-medium">Columns:</span>
			{#each COLUMN_KEYS as key (key)}
				<label class="flex items-center gap-1">
					<input type="checkbox" bind:checked={analysis.columns[key]} />
					{key}
				</label>
			{/each}
		</section>

		<section class="flex flex-wrap gap-1.5 border-t border-border pt-2">
			<button type="button" class={pill} onclick={changeAMark}>Change a mark</button>
			<button
				type="button"
				class={pill}
				onclick={() => {
					resetSample(engine);
					analysis.snapshot = null;
				}}>Reset sample</button
			>
			<button type="button" class={pill} onclick={clearMarks}>Clear marks</button>
			<button type="button" class={pill} onclick={() => (jsonOpen = !jsonOpen)}
				>Load breakdown.json…</button
			>
		</section>

		{#if jsonOpen}
			<section class="flex flex-col gap-1.5">
				<textarea
					class="h-28 rounded border border-border bg-background p-1.5 font-mono text-[11px]"
					placeholder="Paste a Phase 1 breakdown.json here"
					bind:value={jsonText}
				></textarea>
				{#if jsonError}<span class="text-destructive">{jsonError}</span>{/if}
				<button type="button" class={`${pill} w-fit`} onclick={loadJson}>Load leaves</button>
			</section>
		{/if}
	{/if}
</div>
