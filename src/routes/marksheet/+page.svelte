<!--
	The marksheet: the class against the confirmed breakdown. The breakdown is
	read-only here — its columns are keyed against by the marks — so the class is
	the editable half of this surface.

	PROTOTYPE (wayfinder #55): round 2. Round 1 chose C's "Set grade boundaries" button and
	dialog; these variants try ways of entering the grades inside it (`?variant=A|B|C|D`).
	D is round 1's paste box, kept for comparison. Grid columns and the Grades step are
	round 1's C throughout. Boundaries and reports are in memory only.
-->
<script lang="ts">
	import { page } from '$app/state';
	import PrototypeSwitcher from '$lib/components/prototype/PrototypeSwitcher.svelte';
	import SamplePanel from '$lib/prototypes/grade-boundaries/SamplePanel.svelte';
	import PrintRoot from '$lib/prototypes/report-flow/PrintRoot.svelte';
	import StubPanel from '$lib/prototypes/report-flow/StubPanel.svelte';
	import ReportFlowHost from '$lib/prototypes/report-flow/VariantC.svelte';
	import { marksheetStore } from '$lib/marksheet/index.js';

	const VARIANTS = [
		{ key: 'A', label: 'Form table: grade + lowest mark per row' },
		{ key: 'B', label: 'Pick a scale, type only the marks' },
		{ key: 'C', label: 'Number line: drag markers over the class' },
		{ key: 'D', label: 'Round 1: paste / type box' }
	];
	const ENTRY = { A: 'table', B: 'scale', C: 'line', D: 'text' } as const;

	// The route's load guard has read storage by the time this renders.
	const store = marksheetStore();
	const variant = $derived(
		(['A', 'B', 'C', 'D'] as const).find((k) => k === page.url.searchParams.get('variant')) ?? 'B'
	);
	const className = $derived(store.document?.paper.className ?? null);
	const title = $derived(className ? `${className} · Marksheet · QLA` : 'Marksheet · QLA');
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<main class="mx-auto max-w-6xl space-y-4 p-6">
	{#if store.document}
		<!-- A wipe empties the store a frame before the redirect lands. -->
		<ReportFlowHost grade="C" entry={ENTRY[variant]} />
	{/if}
</main>
<PrintRoot />
<StubPanel />
<SamplePanel />
<PrototypeSwitcher variants={VARIANTS} current={variant} />
