<script lang="ts">
	import ReviewStep from '$lib/components/report/ReviewStep.svelte';
	import { reportsFlow } from '$lib/components/report/reports-flow.svelte.js';
	import { marksheetStore } from '$lib/marksheet/index.js';

	const flow = reportsFlow();
	const document = $derived(marksheetStore().document);
</script>

{#if document}
	<ReviewStep
		{document}
		roster={flow.roster}
		run={flow.run}
		downloading={flow.downloading}
		ondownload={(request) => void flow.download(request)}
		onprint={(ids) => void flow.print(ids)}
		onrewrite={(ids) => flow.rewriteHere(ids)}
		onwritemore={(ids) => flow.writeAgain(ids)}
	/>
{/if}
