<!-- PROTOTYPE (#114) — today's marksheet header, stubbed: paper label, class, a summary line. -->
<script lang="ts">
	import { tieredSheet } from './sheet.svelte.js';

	let { summary }: { summary: string } = $props();
	const sheet = tieredSheet();
</script>

<header class="space-y-1">
	<p class="text-lg font-semibold">{sheet.paperLabel}</p>
	<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
		<span class="px-1 text-sm">{sheet.className}</span>
		<p class="text-sm text-muted-foreground">{summary}</p>
	</div>
	<p class="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
		Backup card (unchanged, not prototyped)
	</p>
</header>
