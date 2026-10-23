<!--
	The analysis of the marksheet: every entry's facility and band, opened at one
	entry when the teacher asked from that entry's figure (`?entry=`).
-->
<script lang="ts">
	// PROTOTYPE (#115): ?variant=A|B|C renders a stubbed two-tier analysis with common
	// questions instead of today's page (in-memory, AQA 8463 P1 H/F). No variant = today's page.
	import { page } from '$app/state';
	import PrototypeSwitcher from '$lib/components/prototype/PrototypeSwitcher.svelte';
	import StubPanel from '$lib/prototypes/common-questions/StubPanel.svelte';
	import VariantA from '$lib/prototypes/common-questions/VariantA.svelte';
	import VariantB from '$lib/prototypes/common-questions/VariantB.svelte';
	import VariantC from '$lib/prototypes/common-questions/VariantC.svelte';
	import VariantD from '$lib/prototypes/common-questions/VariantD.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import AnalysisView from '$lib/components/marksheet/AnalysisView.svelte';
	import { marksheetStore } from '$lib/marksheet/index.js';

	let { data }: { data: { entry: string | null } } = $props();

	const className = $derived(marksheetStore().document?.paper.className ?? null);
	const title = $derived(className ? `${className} · Analysis · QLA` : 'Analysis · QLA');

	const variant = $derived(page.url.searchParams.get('variant'));
	const VARIANTS = [
		{ key: 'A', label: 'Third tab' },
		{ key: 'B', label: 'Inline in each tier' },
		{ key: 'C', label: 'Comparison page' },
		{ key: 'D', label: 'Tabs + comparison tracks' }
	];
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

{#if variant !== null}
	{#if variant === 'B'}
		<VariantB />
	{:else if variant === 'C'}
		<VariantC />
	{:else if variant === 'D'}
		<VariantD />
	{:else}
		<VariantA />
	{/if}
	<StubPanel />
	<PrototypeSwitcher variants={VARIANTS} current={variant} />
{:else}
	<main class="mx-auto max-w-6xl space-y-4 p-6">
		<AnalysisView highlight={data.entry} onBack={() => void goto(resolve('/marksheet'))} />
	</main>
{/if}
