<!--
	The analysis of the marksheet: every entry's facility and band, opened at one
	entry when the teacher asked from that entry's figure (`?entry=`).
-->
<script lang="ts">
	// PROTOTYPE (#115, #118): ?variant= renders a stubbed analysis instead of today's
	// page. D is the settled two-tier design; S1 and S2 ask whether a single-tier
	// assessment keeps today's page (S1) or uses that design with one tier (S2).
	// A/B/C stay reachable by URL as rejected alternatives. The store is an in-memory
	// single-tier 8463 1H document whenever the URL carries ?variant=.
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
		{ key: 'D', label: 'Two tiers (settled)' },
		{ key: 'S1', label: "One tier · today's page" },
		{ key: 'S2', label: 'One tier · two-tier design' }
	];
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

{#if variant === null || variant === 'S1'}
	<main class="mx-auto max-w-6xl space-y-4 p-6">
		<AnalysisView highlight={data.entry} onBack={() => void goto(resolve('/marksheet'))} />
	</main>
	{#if variant === 'S1'}
		<PrototypeSwitcher variants={VARIANTS} current={variant} />
	{/if}
{:else}
	{#if variant === 'B'}
		<VariantB />
	{:else if variant === 'C'}
		<VariantC />
	{:else if variant === 'D'}
		<VariantD />
	{:else if variant === 'S2'}
		<VariantD single />
	{:else}
		<VariantA />
	{/if}
	{#if variant !== 'S2'}
		<StubPanel />
	{/if}
	<PrototypeSwitcher variants={VARIANTS} current={variant} />
{/if}
