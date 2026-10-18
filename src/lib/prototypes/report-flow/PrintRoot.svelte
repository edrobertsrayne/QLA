<!--
	PROTOTYPE — what the browser prints: the reports the flow asked for, one per page,
	portalled to <body> so print CSS can hide the app around them.
-->
<script lang="ts">
	import { Portal } from 'bits-ui';
	import ReportSheet from './ReportSheet.svelte';
	import { reportFlow } from './flow.svelte.js';

	const flow = reportFlow();
</script>

<Portal>
	<div class="qla-print-root">
		{#each flow.printing ?? [] as id (id)}
			<div class="qla-print-page"><ReportSheet studentId={id} /></div>
		{/each}
	</div>
</Portal>

<style>
	:global(.qla-print-root) {
		display: none;
	}
	@media print {
		@page {
			size: A4;
			margin: 0;
		}
		:global(body > :not(.qla-print-root)) {
			display: none !important;
		}
		:global(.qla-print-root) {
			display: block;
		}
		:global(.qla-print-page) {
			break-after: page;
		}
		:global(.qla-print-page .report-sheet) {
			max-width: none;
			width: 210mm;
			height: 297mm;
		}
	}
</style>
