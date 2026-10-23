<!--
	PROTOTYPE (#113) — Variant A "Pair column": tier tabs, and each tier's table gains a
	"Common with" column: a picker of the other tier's equal-mark free entries.
	`layout` tries three ways of laying out the page around the table:
	1 "One column": the sidebar is one flow, heading → what it builds → button.
	2 "Header bar": no sidebar; title, summary and button run across the top.
	3 "Sidebar tabs": the sidebar lists the tiers and is how you switch between them.
	PROTOTYPE (#118) — single: the winning layout 2 with one tier. No tabs (the summary
	and Confirm stay on that row), no Common with column, no pair count, no matching notice.
-->
<script lang="ts">
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { cn } from '$lib/utils.js';
	import Notices from './Notices.svelte';
	import PaperChecks from './PaperChecks.svelte';
	import TierTable from './TierTable.svelte';
	import { twoTierReview, type Entry, type TierIndex } from './review.svelte.js';

	// PROTOTYPE (#118): `checks` places today's sidebar cards on the header-bar layout.
	let { layout, checks }: { layout: 1 | 2 | 3; checks?: 'row' | 'panel' | 'fold' } = $props();

	const review = twoTierReview();
	let tab = $state('0');
	const current = $derived<TierIndex>(tab === '1' ? 1 : 0);
	const other = $derived<TierIndex>(current === 0 ? 1 : 0);
	const blockers = $derived(review.blockers);
	// PROTOTYPE (#118): one tier has no tabs, so these are the only tiers there are; the
	// heading goes singular ("Check the breakdown") and the summary drops "across both tiers"
	// and the pair count.
	const single = $derived(review.single);
	const tiers = $derived(review.tiers.map((_, i) => i as TierIndex));

	function tierProblems(t: TierIndex): string[] {
		return blockers.filter((b) => b.tier === t).map((b) => b.message);
	}
	const pairProblems = $derived(blockers.filter((b) => b.tier === 'pairs').map((b) => b.message));
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

{#snippet intro()}
	{#if single}
		<!-- PROTOTYPE (#118): one tier drops "either tier" and the pairing clause. -->
		<p class="text-sm text-muted-foreground">Fix anything the model got wrong.</p>
	{:else}
		<p class="text-sm text-muted-foreground">
			Fix anything the model got wrong on either tier, and pair the questions that appear on both in
			the <strong>Common with</strong> column (only entries with the same available marks are offered).
		</p>
	{/if}
{/snippet}

{#snippet confirmButton(cls: string)}
	<Button class={cls} disabled={blockers.length > 0} onclick={() => review.confirm()}>
		Confirm and build marksheet
	</Button>
{/snippet}

{#snippet blockerList()}
	{#if blockers.length > 0}
		<div class="space-y-1 text-xs text-destructive">
			{#each blockers as b (b.message)}
				<p>{b.message}</p>
			{/each}
		</div>
	{/if}
{/snippet}

{#snippet tierTabs()}
	{#if !single}
		<ToggleGroup.Root type="single" variant="outline" bind:value={tab}>
			{#each [0, 1] as const as t (t)}
				<ToggleGroup.Item value={String(t)} class="relative px-4">
					{review.tierLabel(t)}
					{#if tierProblems(t).length > 0}
						<span class="absolute top-1 right-1 size-2 rounded-full bg-destructive"></span>
					{/if}
				</ToggleGroup.Item>
			{/each}
		</ToggleGroup.Root>
	{/if}
{/snippet}

{#snippet tierPanel()}
	<div class="flex items-end gap-4">
		{#if !single}
			<!-- PROTOTYPE (#118): one tier hides the tier name field; the parsed name is still kept. -->
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
		{/if}
		<p class="pb-2 text-xs text-muted-foreground">
			{review.tiers[current].filename} · {review.tiers[current].entries.length} entries · {review.tierMarks(
				current
			)} marks
		</p>
	</div>
	{#key current}
		{#if single}
			<TierTable tier={current} />
		{:else}
			<TierTable tier={current} pairHeading="Common with Tier {other + 1}" {pairCell} />
		{/if}
	{/key}
{/snippet}

<main class="mx-auto max-w-7xl space-y-6 p-6">
	<p class="text-lg font-semibold">8463 Paper 1 June 2024</p>
	<Notices />

	{#if layout === 1}
		<div class="grid gap-6 lg:grid-cols-[280px_1fr]">
			<aside class="space-y-4 lg:sticky lg:top-4 lg:self-start">
				<h1 class="text-xl font-semibold">
					{single ? 'Check the breakdown' : 'Check the breakdowns'}
				</h1>
				{@render intro()}
				<dl class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-y py-3 text-sm">
					{#each tiers as t (t)}
						<dt>{review.tierLabel(t)}</dt>
						<dd class="text-right text-muted-foreground tabular-nums">
							{review.tiers[t].entries.length} columns · {review.tierMarks(t)} marks
						</dd>
					{/each}
					{#if !single}
						<dt>Common questions</dt>
						<dd class="text-right text-muted-foreground tabular-nums">
							{review.orderedPairs.length} pairs · {review.pairedMarks} marks
						</dd>
					{/if}
				</dl>
				{@render blockerList()}
				{@render confirmButton('w-full')}
				<p class="text-xs text-muted-foreground">
					{single
						? 'The breakdown becomes read-only.'
						: 'Both breakdowns and the pairs become read-only.'}
				</p>
			</aside>
			<div class="min-w-0 space-y-3">
				{@render tierTabs()}
				{@render tierPanel()}
			</div>
		</div>
	{:else if layout === 2}
		<header class="space-y-4">
			<div class="max-w-3xl space-y-1">
				<h1 class="text-xl font-semibold">
					{single ? 'Check the breakdown' : 'Check the breakdowns'}
				</h1>
				{@render intro()}
			</div>
			<div class="flex flex-wrap items-center gap-4">
				{@render tierTabs()}
				<p class="ml-auto text-right text-xs text-muted-foreground">
					{#if single}
						<!-- PROTOTYPE (#118): one tier drops "across both tiers" and the pair clause. -->
						{review.tiers[0].entries.length} columns
					{:else}
						{review.tiers[0].entries.length + review.tiers[1].entries.length} columns across both tiers
						· {review.orderedPairs.length} common questions ({review.pairedMarks} marks)
					{/if}
				</p>
				{@render confirmButton('')}
			</div>
			<div class="flex justify-end">{@render blockerList()}</div>
			{#if checks === 'fold'}
				<PaperChecks mode="fold" {current} {single} />
			{/if}
		</header>
		{#if checks === 'row' || checks === 'panel'}
			<PaperChecks mode={checks} {current} {single} />
		{/if}
		<div class="space-y-3">
			{@render tierPanel()}
		</div>
	{:else}
		<div class="grid gap-6 lg:grid-cols-[260px_1fr]">
			<aside class="space-y-4 lg:sticky lg:top-4 lg:self-start">
				<h1 class="text-xl font-semibold">
					{single ? 'Check the breakdown' : 'Check the breakdowns'}
				</h1>
				{@render intro()}
				<nav class="space-y-1">
					{#each tiers as t (t)}
						{@const problems = tierProblems(t)}
						<button
							type="button"
							class={cn(
								'flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-sm',
								current === t ? 'border-primary bg-muted' : 'border-transparent hover:bg-muted/50'
							)}
							aria-current={current === t ? 'page' : undefined}
							onclick={() => (tab = String(t))}
						>
							{#if problems.length > 0}
								<CircleAlertIcon class="mt-0.5 size-4 shrink-0 text-destructive" />
							{:else}
								<CircleCheckIcon class="mt-0.5 size-4 shrink-0 text-emerald-600" />
							{/if}
							<span class="space-y-0.5">
								<span class="block font-medium">{review.tierLabel(t)}</span>
								<span class="block text-xs text-muted-foreground">
									{review.tiers[t].entries.length} columns · {review.tierMarks(t)} marks
								</span>
								{#each problems as p (p)}
									<span class="block text-xs text-destructive">{p}</span>
								{/each}
							</span>
						</button>
					{/each}
					{#if !single}
						<div class="flex items-start gap-2 px-3 py-2 text-sm">
							{#if pairProblems.length > 0}
								<CircleAlertIcon class="mt-0.5 size-4 shrink-0 text-destructive" />
							{:else}
								<CircleCheckIcon class="mt-0.5 size-4 shrink-0 text-emerald-600" />
							{/if}
							<span class="space-y-0.5">
								<span class="block font-medium">Common questions</span>
								<span class="block text-xs text-muted-foreground">
									{review.orderedPairs.length} pairs · {review.pairedMarks} marks
								</span>
								{#each pairProblems as p (p)}
									<span class="block text-xs text-destructive">{p}</span>
								{/each}
							</span>
						</div>
					{/if}
				</nav>
				{@render confirmButton('w-full')}
				<p class="text-xs text-muted-foreground">
					Builds your marksheet. {single
						? 'The breakdown becomes read-only.'
						: 'Both breakdowns and the pairs become read-only.'}
				</p>
			</aside>
			<div class="min-w-0 space-y-3">
				{@render tierPanel()}
			</div>
		</div>
	{/if}
</main>
