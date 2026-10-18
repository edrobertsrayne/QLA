<!--
	The marksheet: the class against the confirmed breakdown. The breakdown is
	read-only here — its columns are keyed against by the marks — so the class is
	the editable half of this surface.

	PROTOTYPE (wayfinder #55): three ways to enter grade boundaries and read the grade
	column, switchable via `?variant=A|B|C`, on top of #54's chosen report flow (its
	variant C, kept here as the host). Boundaries and reports are in memory only.
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
		{ key: 'A', label: 'Grade column owns it: frozen, list in a popover' },
		{ key: 'B', label: 'Board-table strip above the grid, total·grade at the end' },
		{ key: 'C', label: 'Paste box in a dialog + report step, three end columns' }
	];

	// The route's load guard has read storage by the time this renders.
	const store = marksheetStore();
	const variant = $derived(
		(['A', 'B', 'C'] as const).find((k) => k === page.url.searchParams.get('variant')) ?? 'A'
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
		<ReportFlowHost grade={variant} />
	{/if}
</main>
<PrintRoot />
<StubPanel />
<SamplePanel />
<PrototypeSwitcher variants={VARIANTS} current={variant} />
