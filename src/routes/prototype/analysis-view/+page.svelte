<!--
	PROTOTYPE — throwaway route for wayfinder #28 (analysis run button + RAG per-question view).
	Three structurally different homes for the on-demand analysis over one filled-in #27 grid:
	A a separate Analysis tab, B a summary row pinned under the grid, C a band-grouped report view.
	Switch with ?variant= or the bottom bar; the dashed panel bottom-left holds prototype-only knobs.
	Not linked from the app; lives only on branch prototype/analysis-view.
-->
<script lang="ts">
	import { page } from '$app/state';
	import PrototypeSwitcher from '$lib/components/prototype/PrototypeSwitcher.svelte';
	import { createGridEngine } from '$lib/prototypes/marksheet-grid/grid-state.svelte.js';
	import { makeSampleStudents } from '$lib/prototypes/marksheet-grid/sample-data.js';
	import {
		AnalysisState,
		fillSampleMarks,
		makeSampleLeavesForAnalysis
	} from '$lib/prototypes/analysis-view/analysis.svelte.js';
	import Controls from './Controls.svelte';
	import VariantA from './VariantA.svelte';
	import VariantB from './VariantB.svelte';
	import VariantC from './VariantC.svelte';
	import VariantD from './VariantD.svelte';

	const VARIANTS = [
		{ key: 'A', label: 'Separate Analysis tab' },
		{ key: 'B', label: 'Summary row under the grid' },
		{ key: 'C', label: 'Report view grouped by band' },
		{ key: 'D', label: 'C report + B facility row' }
	];
	const variant = $derived(page.url.searchParams.get('variant') ?? 'D');

	const engine = createGridEngine(makeSampleLeavesForAnalysis(), makeSampleStudents(30));
	fillSampleMarks(engine);
	const analysis = new AnalysisState(engine);

	$effect(() => {
		if (analysis.stalePolicy === 'clear' && analysis.stale) analysis.snapshot = null;
	});

	const filter = $derived(
		analysis.colourSim === 'greyscale'
			? 'grayscale(1)'
			: analysis.colourSim === 'deuteranopia'
				? 'url(#deuteranopia)'
				: undefined
	);
</script>

<svelte:head>
	<title>Prototype — analysis view</title>
</svelte:head>

<svg class="absolute size-0" aria-hidden="true">
	<filter id="deuteranopia">
		<feColorMatrix
			type="matrix"
			values="0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0"
		/>
	</filter>
</svg>

<div class="min-h-screen bg-background pb-24" style:filter>
	<header class="flex items-center gap-4 border-b border-border px-4 py-2.5">
		<span class="font-semibold">QLA</span>
		<span class="text-sm text-muted-foreground">
			Year 11 Biology — Paper 1 (sample) · 11B · {engine.students.length} students · {engine.leaves
				.length} leaves
		</span>
		<span class="ml-auto text-xs text-muted-foreground">Saved just now</span>
	</header>

	{#if variant === 'B'}
		<VariantB {engine} {analysis} />
	{:else if variant === 'D'}
		<VariantD {engine} {analysis} />
	{:else if variant === 'C'}
		<VariantC {engine} {analysis} />
	{:else}
		<VariantA {engine} {analysis} />
	{/if}
</div>

<Controls {engine} {analysis} {variant} />
<PrototypeSwitcher variants={VARIANTS} current={variant} />
