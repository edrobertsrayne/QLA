<!--
	PROTOTYPE (#113) — Variant A "Pair column": today's review page with tier tabs
	(as on upload). Each tier's table gains a "Common with" column: a picker of the
	other tier's equal-mark free entries. A pair is the same fact seen from either tab.
-->
<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import ConfirmCard from './ConfirmCard.svelte';
	import Notices from './Notices.svelte';
	import TierTable from './TierTable.svelte';
	import { twoTierReview, type Entry, type TierIndex } from './review.svelte.js';

	const review = twoTierReview();
	let tab = $state('0');
	const current = $derived<TierIndex>(tab === '1' ? 1 : 0);
	const other = $derived<TierIndex>(current === 0 ? 1 : 0);

	function tabHasProblem(t: TierIndex): boolean {
		return review.blockers.some((b) => b.tier === t);
	}
</script>

{#snippet pairCell(entry: Entry)}
	{@const options = review.candidates(current, entry.id)}
	{@const partner = review.partnerOf(current, entry.id)}
	{@const unequal = partner !== undefined && partner.marks !== entry.marks}
	<select
		aria-label="Common question for {entry.label}"
		class={[
			'w-full rounded-sm border bg-transparent px-1 py-1 text-xs',
			partner ? 'border-violet-400 text-violet-800 dark:text-violet-300' : 'text-muted-foreground',
			unequal && 'border-destructive text-destructive'
		]}
		value={partner?.id ?? ''}
		onchange={(e) => review.setPartner(current, entry.id, e.currentTarget.value || null)}
	>
		<option value="">{options.length === 0 && !partner ? '— (no equal-mark entry)' : '—'}</option>
		{#if unequal && partner}
			<option value={partner.id}>{partner.label} ({partner.marks ?? '?'} marks, unequal)</option>
		{/if}
		{#each options as o (o.id)}
			<option value={o.id}>{o.label} · {o.summary.slice(0, 28)}</option>
		{/each}
	</select>
{/snippet}

<main class="mx-auto max-w-7xl space-y-6 p-6">
	<header class="space-y-1">
		<p class="text-lg font-semibold">8463 Paper 1 June 2024</p>
		<p class="text-sm text-muted-foreground">
			Two tiers · {review.orderedPairs.length} common questions
		</p>
	</header>
	<Notices />

	<div class="grid gap-6 lg:grid-cols-[300px_1fr]">
		<aside class="space-y-4 lg:sticky lg:top-4 lg:self-start">
			<div>
				<h1 class="text-xl font-semibold">Check the breakdowns</h1>
				<p class="text-sm text-muted-foreground">
					Fix anything the model got wrong on either tier, and check which questions are common to
					both. Once confirmed, these build your marksheet.
				</p>
			</div>
			<section class="space-y-1 rounded-lg border p-3 text-xs">
				<h2 class="text-sm font-semibold">Common questions</h2>
				<p class="text-muted-foreground">
					Pick each question's partner in the <strong>Common with</strong> column. Only entries with the
					same available marks are offered.
				</p>
				<p>
					{review.orderedPairs.length} pairs · {review.pairedMarks} marks
				</p>
			</section>
			<ConfirmCard />
		</aside>

		<div class="min-w-0 space-y-3">
			<ToggleGroup.Root type="single" variant="outline" bind:value={tab}>
				{#each [0, 1] as const as t (t)}
					<ToggleGroup.Item value={String(t)} class="relative px-4">
						{review.tierLabel(t)}
						{#if tabHasProblem(t)}
							<span class="absolute top-1 right-1 size-2 rounded-full bg-destructive"></span>
						{/if}
					</ToggleGroup.Item>
				{/each}
			</ToggleGroup.Root>

			<div class="flex items-end gap-4">
				<div class="space-y-1">
					<Label for="a-tier-name" class="text-xs text-muted-foreground"
						>Tier name, as printed on the paper</Label
					>
					<Input
						id="a-tier-name"
						class="w-56"
						placeholder="e.g. Higher"
						value={review.tiers[current].tierName ?? ''}
						oninput={(e) => review.setTierName(current, e.currentTarget.value)}
					/>
				</div>
				<p class="pb-2 text-xs text-muted-foreground">
					{review.tiers[current].filename} · {review.tiers[current].entries.length} entries · {review.tierMarks(
						current
					)} marks
				</p>
			</div>

			{#key current}
				<TierTable tier={current} pairHeading="Common with Tier {other + 1}" {pairCell} />
			{/key}
		</div>
	</div>
</main>
