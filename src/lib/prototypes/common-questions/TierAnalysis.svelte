<!--
	PROTOTYPE (#115) — one tier's analysis as today's view has it: band sections worst
	first, green folded. Variants may add columns per row (`extraHead`/`extraCell`).
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { cn } from '$lib/utils.js';
	import {
		GREEN_FROM,
		RED_BELOW,
		TINT,
		pct,
		worstFirst,
		type Rag,
		type Row
	} from './stub.svelte.js';

	let {
		rows,
		greenOpen = $bindable(false),
		extraHead,
		extraCell
	}: {
		rows: Row[];
		greenOpen?: boolean;
		extraHead?: Snippet;
		extraCell?: Snippet<[Row]>;
	} = $props();

	const ordered = $derived(worstFirst(rows, (r) => r.facility));
	const of = (b: Rag | null) => ordered.filter((r) => r.band === b);
</script>

{#snippet table(list: Row[])}
	<table class="w-full overflow-hidden rounded-lg border text-sm">
		<thead>
			<tr class="border-b text-left text-xs text-muted-foreground">
				<th class="px-2 py-1.5 font-medium">Question</th>
				<th class="px-2 py-1.5 font-medium">Summary</th>
				<th class="px-2 py-1.5 text-right font-medium">Marks</th>
				<th class="px-2 py-1.5 font-medium">Spec point</th>
				<th class="px-2 py-1.5 font-medium">AO</th>
				<th class="px-2 py-1.5 font-medium">Facility</th>
				<th class="px-2 py-1.5 text-right font-medium">Marked</th>
				{@render extraHead?.()}
			</tr>
		</thead>
		<tbody>
			{#each list as row (row.entry.id)}
				<tr
					class={cn('border-b last:border-0', row.band ? TINT[row.band] : 'text-muted-foreground')}
				>
					<td class="px-2 py-1.5 font-semibold tabular-nums">{row.entry.label}</td>
					<td class="max-w-xs truncate px-2 py-1.5" title={row.entry.summary}
						>{row.entry.summary}</td
					>
					<td class="px-2 py-1.5 text-right tabular-nums">{row.entry.marks}</td>
					<td class="px-2 py-1.5 tabular-nums">{row.entry.specPoint ?? '—'}</td>
					<td class="px-2 py-1.5">{row.entry.ao ?? '—'}</td>
					<td class={cn('px-2 py-1.5 whitespace-nowrap tabular-nums', row.partMarked && 'italic')}>
						{row.facility === null ? 'Not marked yet' : `${pct(row.facility)}%`}
					</td>
					<td
						class={cn(
							'px-2 py-1.5 text-right text-xs tabular-nums',
							row.partMarked && 'text-amber-700 italic dark:text-amber-300'
						)}
					>
						{row.marked}/{row.of}
					</td>
					{@render extraCell?.(row)}
				</tr>
			{/each}
		</tbody>
	</table>
{/snippet}

<section class="space-y-2">
	<h3 class="text-base font-semibold">
		Red — below {pct(RED_BELOW)}%
		<span class="text-sm font-normal text-muted-foreground">({of('red').length})</span>
	</h3>
	{#if of('red').length}{@render table(of('red'))}{:else}<p class="text-sm text-muted-foreground">
			None.
		</p>{/if}
</section>
<section class="space-y-2">
	<h3 class="text-base font-semibold">
		Amber — {pct(RED_BELOW)}% to below {pct(GREEN_FROM)}%
		<span class="text-sm font-normal text-muted-foreground">({of('amber').length})</span>
	</h3>
	{#if of('amber').length}{@render table(of('amber'))}{:else}<p
			class="text-sm text-muted-foreground"
		>
			None.
		</p>{/if}
</section>
<section class="space-y-2">
	<button
		type="button"
		class="flex items-center gap-2 text-base font-semibold"
		aria-expanded={greenOpen}
		onclick={() => (greenOpen = !greenOpen)}
	>
		<ChevronRightIcon class={cn('size-4', greenOpen && 'rotate-90')} />
		Green — {pct(GREEN_FROM)}% and above
		<span class="text-sm font-normal text-muted-foreground">({of('green').length})</span>
	</button>
	{#if greenOpen}{@render table(of('green'))}{/if}
</section>
<section class="space-y-2">
	<h3 class="text-base font-semibold">Not scored ({of(null).length})</h3>
	{#if of(null).length}{@render table(of(null))}{:else}<p class="text-sm text-muted-foreground">
			None.
		</p>{/if}
</section>
