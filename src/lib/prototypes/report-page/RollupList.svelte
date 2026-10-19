<!-- PROTOTYPE — one roll-up list (topics or skills): name · gained/available · band. -->
<script lang="ts">
	import BandMark from './BandMark.svelte';
	import type { Figure } from './sample.js';

	let {
		title,
		figures,
		columns = 1
	}: { title: string; figures: Figure[]; columns?: number } = $props();
</script>

<div>
	<h3 class="mb-0.5 border-b border-black font-bold">{title}</h3>
	<div class="grid gap-x-5" style:grid-template-columns="repeat({columns}, minmax(0, 1fr))">
		{#each figures as f (f.key)}
			<div class="flex items-start gap-1.5 py-px">
				<span class="min-w-0 flex-1">{f.name}</span>
				<span class="tabular-nums">{f.gained}/{f.available}</span>
				<BandMark band={f.band} />
			</div>
		{/each}
	</div>
</div>
