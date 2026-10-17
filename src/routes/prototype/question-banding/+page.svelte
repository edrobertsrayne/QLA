<!--
	PROTOTYPE — throwaway route for wayfinder #32 (banding marksheet columns by question).
	Three variants of the #27/#28 marksheet + report, banded on the stored `questionNumber`
	(ADR 0002), switchable via ?variant= on /prototype/question-banding. The dashed panel holds the
	sample, the degraded-parse switch and the single-column-band knob. Lives only on branch
	prototype/question-banding.
-->
<script lang="ts">
	import { page } from '$app/state';
	import PrototypeSwitcher from '$lib/components/prototype/PrototypeSwitcher.svelte';
	import { Button } from '$lib/components/ui/button';
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import RotateCwIcon from '@lucide/svelte/icons/rotate-cw';
	import {
		BandingState,
		SAMPLES,
		type SampleKey,
		type Singleton
	} from '$lib/prototypes/question-banding/banding.svelte.js';
	import BandedGrid from './BandedGrid.svelte';
	import Report from './Report.svelte';

	const VARIANTS = [
		{ key: 'A', label: 'Band row · entry analysis' },
		{ key: 'B', label: 'Shaded questions · entry/question switch' },
		{ key: 'C', label: 'Collapsible questions · question-first analysis' }
	];
	const variant = $derived(
		(['A', 'B', 'C'].includes(page.url.searchParams.get('variant') ?? '')
			? page.url.searchParams.get('variant')
			: 'A') as 'A' | 'B' | 'C'
	);

	const s = new BandingState();
	let view = $state<'marks' | 'report'>('marks');
	let focus = $state<string | null>(null);

	function openReport(key: string | null) {
		focus = key;
		view = 'report';
		if (!key) window.scrollTo({ top: 0 });
	}

	const SINGLETONS: { key: Singleton; label: string }[] = [
		{ key: 'repeat', label: 'Repeat (Q2 over 2)' },
		{ key: 'merge', label: 'Merge into one tall header' },
		{ key: 'blank', label: 'Blank band cell' }
	];
	const bandLine = $derived(
		s.bands.map((b) => `${b.fallback ? '⚠' : ''}${b.questionNumber}(${b.entries.length})`).join(' ')
	);
</script>

<svelte:head>
	<title>Prototype — question banding</title>
</svelte:head>

<div class="min-h-screen bg-background pb-24">
	<header class="flex items-center gap-4 border-b border-border px-4 py-2.5">
		<span class="font-semibold">QLA</span>
		<span class="text-sm text-muted-foreground">
			Biology Paper 1H · 11B · {s.engine.students.length} students · {s.engine.leaves.length} entries
			in {new Set(s.engine.leaves.map((e) => e.questionNumber)).size} questions
		</span>
	</header>

	{#if view === 'marks'}
		<div class="mx-4 mt-3 mb-2 flex items-center gap-3">
			<span class="text-sm font-medium">Marksheet</span>
			{#if s.warnings.length && s.flagFallback}
				<span class="text-xs text-amber-700"
					>{s.warnings.length} entries have no question number from the parse</span
				>
			{/if}
			<div class="ml-auto flex gap-2">
				<Button variant="ghost" size="sm" onclick={() => s.generate()}
					><RotateCwIcon /> Regenerate analysis</Button
				>
				<Button size="sm" onclick={() => openReport(null)}><ChartColumnIcon /> View analysis</Button
				>
			</div>
		</div>
		{#key `${variant}-${s.sample}-${s.degraded}`}
			<BandedGrid state={s} {variant} onSelect={(k) => openReport(k)} />
		{/key}
	{:else}
		<div class="mx-4 mt-3 mb-2">
			<Button variant="ghost" size="sm" onclick={() => (view = 'marks')}
				><ArrowLeftIcon /> Back to marksheet</Button
			>
		</div>
		{#key variant}
			<Report state={s} {variant} {focus} />
		{/key}
	{/if}
</div>

<details
	class="fixed right-3 bottom-16 z-40 w-72 rounded-lg border-2 border-dashed border-amber-500 bg-card p-3 text-xs shadow-lg"
>
	<summary class="cursor-pointer font-semibold text-amber-700">Prototype knobs</summary>
	<div class="mt-2 space-y-2">
		<label class="block">
			Sample
			<select
				class="mt-0.5 w-full rounded border bg-background px-1 py-0.5"
				value={s.sample}
				onchange={(e) => {
					s.sample = e.currentTarget.value as SampleKey;
					s.load();
				}}
			>
				{#each SAMPLES as o (o.key)}<option value={o.key}>{o.label}</option>{/each}
			</select>
		</label>
		<label class="flex items-center gap-1.5">
			<input
				type="checkbox"
				checked={s.degraded}
				onchange={(e) => {
					s.degraded = e.currentTarget.checked;
					s.load();
				}}
			/>
			Degraded parse (7bii, 12ci fell back to own id)
		</label>
		<label class="flex items-center gap-1.5">
			<input type="checkbox" bind:checked={s.flagFallback} /> Give fallback bands their own look
		</label>
		{#if variant !== 'B'}
			<fieldset>
				<legend>Single-column band</legend>
				{#each SINGLETONS as o (o.key)}
					<label class="flex items-center gap-1.5">
						<input type="radio" name="singleton" value={o.key} bind:group={s.singleton} />
						{o.label}
					</label>
				{/each}
			</fieldset>
		{/if}
		<p class="font-mono text-[10px] break-words text-muted-foreground">bands: {bandLine}</p>
	</div>
</details>

<PrototypeSwitcher variants={VARIANTS} current={variant} path="/prototype/question-banding" />
