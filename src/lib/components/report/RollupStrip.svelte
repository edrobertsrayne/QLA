<!-- One roll-up list (topics or skills): name (· description) · gained/available · band. All text is plain text. -->
<script lang="ts">
	import type { RollupRow } from '$lib/marksheet/report-figures.js';
	import BandMark from './BandMark.svelte';

	let {
		title,
		rows,
		columns = 1
	}: { title: string; rows: RollupRow[]; columns?: number } = $props();
</script>

<div>
	<h3 class="mb-0.5 border-b border-black font-bold">{title}</h3>
	<div class="grid gap-x-5" style:grid-template-columns="repeat({columns}, minmax(0, 1fr))">
		{#each rows as row (row.name)}
			<div class="flex items-start gap-1.5 py-px">
				<span class="min-w-0 flex-1"
					>{row.description ? `${row.name} · ${row.description}` : row.name}</span
				>
				<span class="tabular-nums">{row.gained}/{row.available}</span>
				<BandMark band={row.band} />
			</div>
		{/each}
	</div>
</div>
