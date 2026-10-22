<!--
	The analysis of the marksheet: every entry's facility and band, opened at one
	entry when the teacher asked from that entry's figure (`?entry=`).
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import AnalysisView from '$lib/components/marksheet/AnalysisView.svelte';
	import { marksheetStore } from '$lib/marksheet/index.js';

	let { data }: { data: { entry: string | null } } = $props();

	const className = $derived(marksheetStore().document?.paper.className ?? null);
	const title = $derived(className ? `${className} · Analysis · QLA` : 'Analysis · QLA');
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<main class="mx-auto max-w-6xl space-y-4 p-6">
	<AnalysisView highlight={data.entry} onBack={() => void goto(resolve('/marksheet'))} />
</main>
