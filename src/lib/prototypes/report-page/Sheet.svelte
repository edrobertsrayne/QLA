<!--
	PROTOTYPE — one side of A4, the same box on screen and in print. On screen it
	measures itself: shrink mode steps the feedback text (`--fb-scale`) down until
	the page fits; every mode records how far over the page the content runs.
	The print copy does not measure: it reuses the scale the screen copy settled on.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { reportPage } from './state.svelte.js';

	let { id, measure, children }: { id: string; measure: boolean; children: Snippet } = $props();

	const page = reportPage();
	const PX_PER_MM = 96 / 25.4;
	const MIN_SCALE = 0.9; // Chosen: shrink no further than 90%, then flag.

	function fit(box: HTMLElement, content: HTMLElement): void {
		const over = () => content.scrollHeight - box.clientHeight;
		let scale = 1;
		content.style.setProperty('--fb-scale', '1');
		if (page.fit === 'shrink') {
			while (over() > 0 && scale > MIN_SCALE) {
				scale = Math.round((scale - 0.025) * 1000) / 1000;
				content.style.setProperty('--fb-scale', String(scale));
			}
		}
		page.scale[id] = scale;
		page.overMm[id] = Math.max(0, Math.round(over() / PX_PER_MM));
	}

	function measured(box: HTMLElement) {
		if (!measure) return;
		const content = box.firstElementChild as HTMLElement;
		// Re-fit whenever the content changes size, and when the mode changes.
		void page.fit;
		const observer = new ResizeObserver(() => fit(box, content));
		observer.observe(content);
		const textObserver = new MutationObserver(() => fit(box, content));
		textObserver.observe(content, { subtree: true, characterData: true, childList: true });
		content.addEventListener('input', () => fit(box, content));
		fit(box, content);
		return () => {
			observer.disconnect();
			textObserver.disconnect();
		};
	}
</script>

<div
	class="report-sheet relative h-[297mm] w-[210mm] shrink-0 overflow-hidden bg-white text-[9pt] leading-snug text-black shadow-md print:shadow-none"
	{@attach measured}
>
	<div
		class="flex min-h-full flex-col p-[10mm]"
		style:--fb-scale={measure ? undefined : (page.scale[id] ?? 1)}
	>
		{@render children()}
	</div>
	{#if measure && (page.overMm[id] ?? 0) > 0}
		<!-- Screen only: where the printed page ends. -->
		<div
			class="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-red-500/40 to-transparent"
		></div>
	{/if}
</div>
