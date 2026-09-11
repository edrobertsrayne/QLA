<!-- PROTOTYPE — band chip with icon + word so the band survives greyscale printing and colour blindness. -->
<script lang="ts">
	import type { Band } from '$lib/prototypes/analysis-view/analysis.svelte.js';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import CircleMinusIcon from '@lucide/svelte/icons/circle-minus';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';

	let { band, provisional = false }: { band: Band | null; provisional?: boolean } = $props();
</script>

{#if band}
	<span
		class={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${provisional ? 'border border-dashed' : 'border border-transparent'} ${band === 'red' ? 'border-red-600 bg-red-500/15 text-red-700' : band === 'amber' ? 'border-amber-600 bg-amber-400/25 text-amber-800' : 'border-emerald-700 bg-emerald-500/15 text-emerald-800'}`}
	>
		{#if band === 'red'}<CircleAlertIcon class="size-3.5" />Red
		{:else if band === 'amber'}<CircleMinusIcon class="size-3.5" />Amber
		{:else}<CircleCheckIcon class="size-3.5" />Green{/if}
	</span>
{:else}
	<span class="text-xs text-muted-foreground">—</span>
{/if}
