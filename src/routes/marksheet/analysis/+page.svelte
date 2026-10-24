<!--
	The analysis of the marksheet: a tab per tier and, when pairs exist, the
	common-questions comparison, opened at one entry when the teacher asked from
	that entry's figure (`?tier=&entry=`).
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import AnalysisView from '$lib/components/marksheet/AnalysisView.svelte';
	import type { AnalysisTab } from '$lib/components/marksheet/analysis-tab.js';
	import { marksheetStore } from '$lib/marksheet/index.js';

	let { data }: { data: { tab: AnalysisTab | null; entry: string | null } } = $props();

	const className = $derived(marksheetStore().className);
	const title = $derived(className ? `${className} · Analysis · QLA` : 'Analysis · QLA');
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<main class="mx-auto max-w-6xl space-y-4 p-6">
	<AnalysisView
		tab={data.tab}
		highlight={data.entry}
		onBack={() => void goto(resolve('/marksheet'))}
	/>
</main>
