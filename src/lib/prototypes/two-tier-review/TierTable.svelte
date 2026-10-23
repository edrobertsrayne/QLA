<!--
	PROTOTYPE (#113) — one tier's breakdown as a flat editable table, a cut-down
	BreakdownTable (label, marks, summary editable; the rest read-only). Variants
	put their own pair cell in the last column.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import { cn } from '$lib/utils.js';
	import { twoTierReview, type Entry, type TierIndex } from './review.svelte.js';

	let {
		tier,
		pairHeading,
		pairCell
	}: { tier: TierIndex; pairHeading: string; pairCell: Snippet<[Entry]> } = $props();

	const review = twoTierReview();
	const cell =
		'w-full rounded-sm border border-transparent bg-transparent px-1.5 py-1 hover:border-border focus:border-ring focus:bg-background focus:outline-none';
</script>

<div class="overflow-hidden rounded-xl border">
	<Table.Root class="table-fixed">
		<Table.Header>
			<Table.Row>
				<Table.Head class="w-20 px-2">Label</Table.Head>
				<Table.Head class="w-12 px-2">Q</Table.Head>
				<Table.Head class="w-16 px-2">Marks</Table.Head>
				<Table.Head class="px-2">Summary</Table.Head>
				<Table.Head class="w-24 px-2">Spec point</Table.Head>
				<Table.Head class="w-14 px-2">AO</Table.Head>
				<Table.Head class="w-44 px-2">{pairHeading}</Table.Head>
				<Table.Head class="w-10"></Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each review.tiers[tier].entries as entry (entry.id)}
				{@const paired = review.pairOf(tier, entry.id) !== undefined}
				<Table.Row class={cn('group', paired && 'bg-violet-500/5')}>
					<Table.Cell class="px-1">
						<input
							aria-label="Label for {entry.label}"
							class={cn(cell, 'font-medium')}
							value={entry.label}
							oninput={(e) => review.setField(tier, entry.id, 'label', e.currentTarget.value)}
						/>
					</Table.Cell>
					<Table.Cell class="px-2 text-muted-foreground">{entry.questionNumber}</Table.Cell>
					<Table.Cell class="px-1">
						<input
							aria-label="Marks for {entry.label}"
							class={cn(cell, 'text-right tabular-nums')}
							inputmode="numeric"
							value={entry.marks ?? ''}
							oninput={(e) => {
								const v = e.currentTarget.value.trim();
								review.setMarks(tier, entry.id, v === '' ? null : Number(v));
							}}
						/>
					</Table.Cell>
					<Table.Cell class="px-1">
						<input
							aria-label="Summary for {entry.label}"
							class={cell}
							value={entry.summary}
							oninput={(e) => review.setField(tier, entry.id, 'summary', e.currentTarget.value)}
						/>
					</Table.Cell>
					<Table.Cell class="px-2 font-mono text-xs whitespace-normal text-muted-foreground">
						{#each (entry.specPoint ?? '—').split(';') as point, i (i)}
							<span class="block py-0.5">{point.trim()}</span>
						{/each}
					</Table.Cell>
					<Table.Cell class="px-2 text-xs text-muted-foreground">{entry.ao ?? '—'}</Table.Cell>
					<Table.Cell class="px-1">{@render pairCell(entry)}</Table.Cell>
					<Table.Cell class="pr-2">
						<Button
							variant="ghost"
							size="icon-xs"
							class="text-destructive opacity-0 group-hover:opacity-100"
							aria-label="Delete {entry.label}"
							onclick={() => review.deleteEntry(tier, entry.id)}
						>
							<Trash2Icon class="size-3.5" />
						</Button>
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>
