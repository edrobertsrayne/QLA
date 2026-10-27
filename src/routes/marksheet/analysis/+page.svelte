<!--
	The analysis of the marksheet: a tab per tier and, when pairs exist, the
	common-questions comparison, opened at one entry when the teacher asked from
	that entry's figure (`?tier=&entry=`).
-->
<script lang="ts">
	// PROTOTYPE (#159): ?variant=A|B|C renders one placement of the class's topic
	// facility, computed from in-memory fixture documents (no store, nothing
	// stored). No variant = today's page.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import PrototypeSwitcher from '$lib/components/prototype/PrototypeSwitcher.svelte';
	import PrototypeControls from '$lib/prototypes/topic-facility/PrototypeControls.svelte';
	import VariantA from '$lib/prototypes/topic-facility/VariantA.svelte';
	import VariantB from '$lib/prototypes/topic-facility/VariantB.svelte';
	import VariantC from '$lib/prototypes/topic-facility/VariantC.svelte';
	import AnalysisView from '$lib/components/marksheet/AnalysisView.svelte';
	import type { AnalysisTab } from '$lib/components/marksheet/analysis-tab.js';
	import { marksheetStore } from '$lib/marksheet/index.js';

	let { data }: { data: { tab: AnalysisTab | null; entry: string | null } } = $props();

	const className = $derived(marksheetStore().className);
	const title = $derived(className ? `${className} · Analysis · QLA` : 'Analysis · QLA');

	const variant = $derived(page.url.searchParams.get('variant'));
	const VARIANTS = [
		{ key: 'A', label: 'Own tab' },
		{ key: 'B', label: 'Section in each tier' },
		{ key: 'C', label: 'Topic / Questions / AO tabs' }
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
	{:else}
		<VariantA />
	{/if}
	<PrototypeControls />
	<PrototypeSwitcher variants={VARIANTS} current={variant} />
{:else}
	<main class="mx-auto max-w-6xl space-y-4 p-6">
		<AnalysisView
			tab={data.tab}
			highlight={data.entry}
			onBack={() => void goto(resolve('/marksheet'))}
		/>
	</main>
{/if}
