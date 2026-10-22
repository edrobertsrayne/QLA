<!--
	What the printer gets: one A4 page per written report, nothing else. It is
	moved to the end of <body> so the print stylesheet can hide the app around it.
-->
<script lang="ts">
	import type { MarksheetDocument } from '$lib/marksheet/document.js';
	import ReportSheet from './ReportSheet.svelte';

	let {
		document: doc,
		ids,
		root = $bindable()
	}: { document: MarksheetDocument; ids: string[]; root?: HTMLElement } = $props();

	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return () => node.remove();
	}
</script>

<div class="print-root" data-testid="print-root" bind:this={root} {@attach portal}>
	{#each ids as id (id)}
		{@const report = doc.reports[id]}
		{#if report}
			<div class="print-page"><ReportSheet document={doc} studentId={id} {report} /></div>
		{/if}
	{/each}
</div>

<style>
	/* On screen the print copies lay out invisibly out of flow: they are the
	 * measurers — the same list markup the printer gets, at real A4 width —
	 * so the settled scale and mm-over describe what print clips. Screen
	 * sheets reuse the settled scale and never measure their textareas. */
	.print-root {
		position: absolute;
		visibility: hidden;
		pointer-events: none;
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
			position: static;
			visibility: visible;
			pointer-events: auto;
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
