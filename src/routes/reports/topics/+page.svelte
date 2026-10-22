<script lang="ts">
	import TopicNamesStep from '$lib/components/report/TopicNamesStep.svelte';
	import { goToStep, reportsFlow } from '$lib/components/report/reports-flow.svelte.js';
	import { marksheetStore } from '$lib/marksheet/index.js';

	const flow = reportsFlow();
	const document = $derived(marksheetStore().document);
</script>

{#if document}
	<TopicNamesStep {document} modelOverride={flow.modelOverride} onnext={() => goToStep('grades')} />
{/if}
