<!--
	The marksheet: the class against the confirmed breakdown. The breakdown is
	read-only here — its columns are keyed against by the marks — so the class is
	the editable half of this surface.

	PROTOTYPE (wayfinder #54): three report generation/editing/print flows, switchable
	via `?variant=A|B|C` on this route. Report state is a stub, in memory only.
-->
<script lang="ts">
	import { page } from '$app/state';
	import PrototypeSwitcher from '$lib/components/prototype/PrototypeSwitcher.svelte';
	import PrintRoot from '$lib/prototypes/report-flow/PrintRoot.svelte';
	import StubPanel from '$lib/prototypes/report-flow/StubPanel.svelte';
	import VariantA from '$lib/prototypes/report-flow/VariantA.svelte';
	import VariantB from '$lib/prototypes/report-flow/VariantB.svelte';
	import VariantC from '$lib/prototypes/report-flow/VariantC.svelte';
	import { marksheetStore } from '$lib/marksheet/index.js';

	const VARIANTS = [
		{ key: 'A', label: 'Reports view, list + editor' },
		{ key: 'B', label: 'On the marksheet, roster + modal' },
		{ key: 'C', label: 'Steps, then the printed pages' }
	];

	// The route's load guard has read storage by the time this renders.
	const store = marksheetStore();
	const variant = $derived(page.url.searchParams.get('variant') ?? 'C');
	const className = $derived(store.document?.paper.className ?? null);
	const title = $derived(className ? `${className} · Marksheet · QLA` : 'Marksheet · QLA');
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<main class="mx-auto max-w-6xl space-y-4 p-6">
	{#if !store.document}
		<!-- A wipe empties the store a frame before the redirect lands. -->
	{:else if variant === 'B'}
		<VariantB />
	{:else if variant === 'C'}
		<VariantC />
	{:else}
		<VariantA />
	{/if}
</main>
<PrintRoot />
<StubPanel />
<PrototypeSwitcher variants={VARIANTS} current={variant} />
