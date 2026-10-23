<!--
	PROTOTYPE (#113) — Variant C "Side by side": both tiers on screen at once, each a
	compact editable list scrolling on its own. Pairs are numbered chips on both
	sides; hover one to light up its partner. To pair, click an entry's link button,
	then pick from the other tier's highlighted (equal-mark, free) entries.
	Confirmation sits in a bar along the bottom.
-->
<script lang="ts">
	import Link2Icon from '@lucide/svelte/icons/link-2';
	import XIcon from '@lucide/svelte/icons/x';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Popover from '$lib/components/ui/popover';
	import { cn } from '$lib/utils.js';
	import Notices from './Notices.svelte';
	import { twoTierReview, type Entry, type TierIndex } from './review.svelte.js';

	const review = twoTierReview();

	/** The entry waiting for a partner, if the teacher has started a pairing. */
	let picking = $state<{ tier: TierIndex; id: string } | null>(null);
	/** The pair under the pointer: both its rows light up. */
	let hovered = $state<string | null>(null);

	const pairNumbers = $derived(
		new Map(review.orderedPairs.map(({ a, b }, i) => [`${a.id}|${b.id}`, i + 1]))
	);
	const candidateIds = $derived(
		picking ? new Set(review.candidates(picking.tier, picking.id).map((e) => e.id)) : null
	);
	const blockers = $derived(review.blockers);

	function pairKey(tier: TierIndex, id: string): string | null {
		const p = review.pairOf(tier, id);
		return p ? `${p.tier1EntryId}|${p.tier2EntryId}` : null;
	}

	function startPick(tier: TierIndex, id: string) {
		picking = picking?.id === id ? null : { tier, id };
	}

	function choose(tier: TierIndex, id: string) {
		if (!picking || picking.tier === tier) return;
		review.setPartner(picking.tier, picking.id, id);
		picking = null;
	}

	function showPartner(tier: TierIndex, id: string) {
		const partner = review.partnerOf(tier, id);
		if (!partner) return;
		document
			.querySelector(`[data-c-entry="${partner.id}"]`)
			?.scrollIntoView({ block: 'center', behavior: 'smooth' });
	}

	const cell =
		'w-full rounded-sm border border-transparent bg-transparent px-1 py-0.5 hover:border-border focus:border-ring focus:bg-background focus:outline-none';
</script>

{#snippet row(tier: TierIndex, entry: Entry)}
	{@const key = pairKey(tier, entry.id)}
	{@const n = key ? pairNumbers.get(key) : undefined}
	{@const partner = review.partnerOf(tier, entry.id)}
	{@const unequal = partner !== undefined && partner.marks !== entry.marks}
	{@const isPicking = picking?.id === entry.id}
	{@const isCandidate = picking !== null && picking.tier !== tier && candidateIds?.has(entry.id)}
	{@const dim = picking !== null && !isPicking && !isCandidate}
	<li
		data-c-entry={entry.id}
		class={cn(
			'group grid grid-cols-[3.5rem_2.5rem_1fr_4.5rem] items-center gap-1 rounded px-1 py-0.5 text-sm',
			key && 'bg-violet-500/5',
			key !== null && hovered === key && 'bg-violet-500/20',
			isPicking && 'ring-2 ring-violet-500',
			isCandidate && 'bg-emerald-500/10 ring-1 ring-emerald-500',
			dim && 'opacity-40'
		)}
		onmouseenter={() => (hovered = key)}
		onmouseleave={() => (hovered = null)}
	>
		<input
			aria-label="Label for {entry.label}"
			class={cn(cell, 'font-medium')}
			value={entry.label}
			oninput={(e) => review.setField(tier, entry.id, 'label', e.currentTarget.value)}
		/>
		<input
			aria-label="Marks for {entry.label}"
			class={cn(cell, 'text-right tabular-nums', unequal && 'text-destructive')}
			inputmode="numeric"
			value={entry.marks ?? ''}
			oninput={(e) => {
				const v = e.currentTarget.value.trim();
				review.setMarks(tier, entry.id, v === '' ? null : Number(v));
			}}
		/>
		<input
			aria-label="Summary for {entry.label}"
			class={cell}
			value={entry.summary}
			oninput={(e) => review.setField(tier, entry.id, 'summary', e.currentTarget.value)}
		/>
		<span class="flex justify-end gap-0.5">
			{#if isCandidate}
				<Button size="xs" variant="outline" onclick={() => choose(tier, entry.id)}>Pair</Button>
			{:else if n !== undefined && partner}
				<Popover.Root>
					<Popover.Trigger
						class={cn(
							'rounded-full px-2 py-0.5 text-xs font-medium',
							unequal
								? 'bg-destructive/15 text-destructive'
								: 'bg-violet-500/15 text-violet-800 dark:text-violet-300'
						)}
						aria-label="Common question {n}: {entry.label} with {partner.label}"
					>
						#{n} · {partner.label}
					</Popover.Trigger>
					<Popover.Content class="w-64 space-y-2 text-xs">
						<p>
							Common question #{n}: Tier {tier + 1} <strong>{entry.label}</strong> with Tier {tier ===
							0
								? 2
								: 1}
							<strong>{partner.label}</strong> ({partner.summary}).
						</p>
						{#if unequal}
							<p class="text-destructive">
								Available marks differ: {entry.marks} vs {partner.marks}.
							</p>
						{/if}
						<div class="flex gap-2">
							<Button size="xs" variant="outline" onclick={() => showPartner(tier, entry.id)}
								>Show partner</Button
							>
							<Button size="xs" variant="outline" onclick={() => startPick(tier, entry.id)}
								>Change partner</Button
							>
							<Button
								size="xs"
								variant="ghost"
								class="text-destructive"
								onclick={() => review.setPartner(tier, entry.id, null)}
							>
								<XIcon class="size-3" /> Clear
							</Button>
						</div>
					</Popover.Content>
				</Popover.Root>
			{:else if !picking}
				<Button
					variant="ghost"
					size="icon-xs"
					class="opacity-0 group-hover:opacity-100"
					aria-label="Pair {entry.label} with a Tier {tier === 0 ? 2 : 1} question"
					disabled={entry.marks === null}
					onclick={() => startPick(tier, entry.id)}
				>
					<Link2Icon class="size-3.5" />
				</Button>
			{/if}
		</span>
	</li>
{/snippet}

<main class="mx-auto max-w-[96rem] space-y-4 p-6 pb-40">
	<header class="space-y-1">
		<p class="text-lg font-semibold">8463 Paper 1 June 2024</p>
		<h1 class="text-xl font-semibold">Check the breakdowns</h1>
		<p class="text-sm text-muted-foreground">
			Both tiers side by side. Numbered chips are common questions: hover to see the partner, click
			to change or clear it. To add one, hover an entry and click
			<Link2Icon class="inline size-3.5" />.
		</p>
	</header>
	<Notices />

	{#if picking}
		{@const from = review.entry(picking.tier, picking.id)}
		<div
			class="sticky top-2 z-10 flex items-center gap-3 rounded-lg border border-violet-400 bg-background p-2 text-sm shadow"
		>
			<span>
				Pairing Tier {picking.tier + 1} <strong>{from?.label}</strong> ({from?.marks} marks): pick a highlighted
				Tier {picking.tier === 0 ? 2 : 1} entry.
				{#if candidateIds?.size === 0}
					<span class="text-destructive"
						>No free Tier {picking.tier === 0 ? 2 : 1} entry has {from?.marks} marks.</span
					>
				{/if}
			</span>
			<Button size="xs" variant="ghost" class="ml-auto" onclick={() => (picking = null)}
				>Cancel</Button
			>
		</div>
	{/if}

	<div class="grid gap-4 lg:grid-cols-2">
		{#each [0, 1] as const as t (t)}
			<section class="space-y-2 rounded-xl border p-3">
				<div class="flex items-center gap-3">
					<span class="text-sm font-semibold">Tier {t + 1}</span>
					<Input
						aria-label="Tier {t + 1} name"
						class={cn(
							'h-8 w-40',
							blockers.some((b) => b.tier === t && b.message.includes('name')) &&
								'border-destructive'
						)}
						placeholder="Tier name"
						value={review.tiers[t].tierName ?? ''}
						oninput={(e) => review.setTierName(t, e.currentTarget.value)}
					/>
					<span class="ml-auto text-xs text-muted-foreground">
						{review.tiers[t].entries.length} entries · {review.tierMarks(t)} marks
					</span>
				</div>
				<div
					class="grid grid-cols-[3.5rem_2.5rem_1fr_4.5rem] gap-1 px-1 text-xs text-muted-foreground"
				>
					<span>Label</span><span class="text-right">Marks</span><span>Summary</span><span
						class="text-right">Common</span
					>
				</div>
				<ul class="max-h-[65vh] space-y-0.5 overflow-y-auto">
					{#each review.tiers[t].entries as entry (entry.id)}
						{@render row(t, entry)}
					{/each}
				</ul>
			</section>
		{/each}
	</div>
</main>

<div
	class="fixed inset-x-0 bottom-[var(--status-bar-height)] z-40 border-t bg-background/95 p-3 backdrop-blur"
>
	<div class="mx-auto flex max-w-[96rem] items-center gap-4 pr-16 pl-80">
		<div class="text-xs">
			<p>
				<strong>{review.tierLabel(0)}</strong>
				{review.tiers[0].entries.length} columns ·
				<strong>{review.tierLabel(1)}</strong>
				{review.tiers[1].entries.length} columns ·
				<strong>{review.orderedPairs.length}</strong> common questions ({review.pairedMarks} marks)
			</p>
			{#each blockers as b (b.message)}
				<p class="text-destructive">{b.message}</p>
			{/each}
		</div>
		<Button class="ml-auto" disabled={blockers.length > 0} onclick={() => review.confirm()}>
			Confirm both tiers and build marksheet
		</Button>
	</div>
</div>
