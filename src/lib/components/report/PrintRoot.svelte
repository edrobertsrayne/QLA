<!--
	What the printer gets: one A4 page per written report, nothing else. It is
	moved to the end of <body> so the print stylesheet can hide the app around it.
-->
<script lang="ts">
	import type { MarksheetDocument } from '$lib/marksheet/document.js';
	import ReportSheet from './ReportSheet.svelte';

	let { document: doc, ids }: { document: MarksheetDocument; ids: string[] } = $props();

	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return () => node.remove();
	}
</script>

<div class="print-root" data-testid="print-root" {@attach portal}>
	{#each ids as id (id)}
		{@const report = doc.reports[id]}
		{#if report}
			<div class="print-page"><ReportSheet document={doc} studentId={id} {report} /></div>
		{/if}
	{/each}
</div>

<style>
	.print-root {
		display: none;
	}
	@media print {
		@page {
			size: A4;
			margin: 0;
		}
		:global(body > *:not(.print-root)) {
			display: none !important;
		}
		.print-root {
			display: block;
			print-color-adjust: exact;
			-webkit-print-color-adjust: exact;
		}
		.print-page {
			break-after: page;
		}
		.print-page:last-child {
			break-after: auto;
		}
	}
</style>
