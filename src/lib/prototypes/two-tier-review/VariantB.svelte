<!--
	PROTOTYPE (#113) — Variant B "Pairs tab": three tabs, Tier 1 / Tier 2 / Common
	questions. Tier tabs are today's table plus a read-only pair marker; every pair
	edit happens in the Common questions tab, a list in Tier 1's order with an
	"Add a pair" row underneath.
-->
<script lang="ts">
	import Link2Icon from '@lucide/svelte/icons/link-2';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Table from '$lib/components/ui/table';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import ConfirmCard from './ConfirmCard.svelte';
	import Notices from './Notices.svelte';
	import TierTable from './TierTable.svelte';
	import { twoTierReview, type Entry, type TierIndex } from './review.svelte.js';

	const review = twoTierReview();
	let tab = $state('pairs');
	const tierTab = $derived<TierIndex>(tab === '1' ? 1 : 0);

	/** The Add a pair row: a free Tier 1 entry, then one of its candidates. */
	let addFrom = $state('');
	let addTo = $state('');
	const freeTier1 = $derived(
		review.tiers[0].entries.filter((e) => e.marks !== null && !review.pairOf(0, e.id))
	);
	const addOptions = $derived(addFrom ? review.candidates(0, addFrom) : []);

	function addPair() {
		if (!addFrom || !addTo) return;
		review.setPartner(0, addFrom, addTo);
		addFrom = '';
		addTo = '';
	}

	function tabHasProblem(key: TierIndex | 'pairs'): boolean {
		return review.blockers.some((b) => b.tier === key);
	}
</script>

{#snippet pairMarker(entry: Entry)}
	{@const partner = review.partnerOf(tierTab, entry.id)}
	{#if partner}
		<button
			type="button"
			class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-violet-800 hover:bg-violet-500/10 dark:text-violet-300"
			onclick={() => (tab = 'pairs')}
		>
			<Link2Icon class="size-3" /> Tier {tierTab === 0 ? 2 : 1}
			{partner.label}
		</button>
	{/if}
{/snippet}

<main class="mx-auto max-w-7xl space-y-6 p-6">
	<header class="space-y-1">
		<p class="text-lg font-semibold">8463 Paper 1 June 2024</p>
		<h1 class="text-xl font-semibold">Check the breakdowns</h1>
		<p class="text-sm text-muted-foreground">
			Check each tier, then the questions common to both. Once confirmed, these build your
			marksheet.
		</p>
	</header>
	<Notices />

	<div class="grid gap-6 lg:grid-cols-[1fr_300px]">
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
				<ToggleGroup.Item value="pairs" class="relative px-4">
					Common questions ({review.orderedPairs.length})
					{#if tabHasProblem('pairs')}
						<span class="absolute top-1 right-1 size-2 rounded-full bg-destructive"></span>
					{/if}
				</ToggleGroup.Item>
			</ToggleGroup.Root>

			{#if tab === 'pairs'}
				<p class="text-sm text-muted-foreground">
					Each Tier 1 question that also appears on Tier 2. Change a partner, clear a pair, or add
					one the model missed. Only entries with the same available marks can be paired.
				</p>
				<div class="overflow-hidden rounded-xl border">
					<Table.Root class="table-fixed">
						<Table.Header>
							<Table.Row>
								<Table.Head class="px-2">{review.tierLabel(0)}</Table.Head>
								<Table.Head class="w-16 px-2 text-right">Marks</Table.Head>
								<Table.Head class="px-2">{review.tierLabel(1)}</Table.Head>
								<Table.Head class="w-10"></Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each review.orderedPairs as { a, b } (a.id)}
								{@const unequal = a.marks !== b.marks}
								<Table.Row class={unequal ? 'bg-destructive/5' : ''}>
									<Table.Cell class="px-2">
										<strong>{a.label}</strong>
										<span class="text-xs text-muted-foreground">{a.summary}</span>
									</Table.Cell>
									<Table.Cell
										class="px-2 text-right tabular-nums {unequal ? 'text-destructive' : ''}"
									>
										{a.marks ?? '?'}{#if unequal}&nbsp;≠ {b.marks ?? '?'}{/if}
									</Table.Cell>
									<Table.Cell class="px-1">
										<select
											aria-label="Tier 2 partner for {a.label}"
											class="w-full rounded-sm border bg-transparent px-1 py-1 text-sm"
											value={b.id}
											onchange={(e) => review.setPartner(0, a.id, e.currentTarget.value)}
										>
											{#if unequal}
												<option value={b.id}>{b.label} · {b.summary}</option>
											{/if}
											{#each review.candidates(0, a.id) as o (o.id)}
												<option value={o.id}>{o.label} · {o.summary}</option>
											{/each}
										</select>
									</Table.Cell>
									<Table.Cell class="pr-2">
										<Button
											variant="ghost"
											size="icon-xs"
											aria-label="Clear pair {a.label}"
											onclick={() => review.setPartner(0, a.id, null)}
										>
											<XIcon class="size-3.5" />
										</Button>
									</Table.Cell>
								</Table.Row>
							{:else}
								<Table.Row>
									<Table.Cell colspan={4} class="px-2 text-sm text-muted-foreground">
										No common questions yet.
									</Table.Cell>
								</Table.Row>
							{/each}
							<Table.Row class="bg-muted/30 hover:bg-muted/30">
								<Table.Cell class="px-1">
									<select
										aria-label="Tier 1 entry to pair"
										class="w-full rounded-sm border bg-background px-1 py-1 text-sm"
										bind:value={addFrom}
										onchange={() => (addTo = '')}
									>
										<option value="">Add a pair: choose a Tier 1 entry…</option>
										{#each freeTier1 as e (e.id)}
											<option value={e.id}>{e.label} · {e.summary}</option>
										{/each}
									</select>
								</Table.Cell>
								<Table.Cell class="px-2 text-right text-muted-foreground tabular-nums">
									{addFrom ? review.entry(0, addFrom)?.marks : ''}
								</Table.Cell>
								<Table.Cell class="px-1">
									<select
										aria-label="Tier 2 entry to pair"
										class="w-full rounded-sm border bg-background px-1 py-1 text-sm"
										bind:value={addTo}
										disabled={!addFrom}
									>
										<option value=""
											>{addFrom && addOptions.length === 0
												? 'No free Tier 2 entry has the same marks'
												: '…then its Tier 2 partner'}</option
										>
										{#each addOptions as o (o.id)}
											<option value={o.id}>{o.label} · {o.summary}</option>
										{/each}
									</select>
								</Table.Cell>
								<Table.Cell class="pr-2">
									<Button
										variant="ghost"
										size="icon-xs"
										aria-label="Add pair"
										disabled={!addTo}
										onclick={addPair}
									>
										<PlusIcon class="size-3.5" />
									</Button>
								</Table.Cell>
							</Table.Row>
						</Table.Body>
					</Table.Root>
				</div>
			{:else}
				<div class="flex items-end gap-4">
					<div class="space-y-1">
						<Label for="b-tier-name" class="text-xs text-muted-foreground"
							>Tier name, as printed on the paper</Label
						>
						<Input
							id="b-tier-name"
							class="w-56"
							placeholder="e.g. Higher"
							value={review.tiers[tierTab].tierName ?? ''}
							oninput={(e) => review.setTierName(tierTab, e.currentTarget.value)}
						/>
					</div>
					<p class="pb-2 text-xs text-muted-foreground">
						{review.tiers[tierTab].filename} · {review.tiers[tierTab].entries.length} entries · {review.tierMarks(
							tierTab
						)} marks
					</p>
				</div>
				{#key tierTab}
					<TierTable tier={tierTab} pairHeading="Common" pairCell={pairMarker} />
				{/key}
			{/if}
		</div>

		<aside class="space-y-4 lg:sticky lg:top-4 lg:self-start">
			<ConfirmCard />
		</aside>
	</div>
</main>
