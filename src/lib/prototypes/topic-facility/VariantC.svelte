<!--
	PROTOTYPE (#159) — Variant C: each tier tab toggles between "By entry" and
	"By topic", so the two readings of one tier swap in place. Three variants of
	where the topic view lives, switchable via ?variant= on the real
	/marksheet/analysis route; figures computed from real document data
	(fixtures.ts) by the real facility arithmetic.
-->
<script lang="ts">
	import { analyseCommonQuestions, analyseTier } from '$lib/marksheet/analysis.js';
	import CommonQuestions from '$lib/components/marksheet/CommonQuestions.svelte';
	import TierAnalysis from '$lib/components/marksheet/TierAnalysis.svelte';
	import { tierLabel, tierNameLabel, tierNameOf } from '$lib/components/marksheet/tier-label.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import type { TierIndex } from '$lib/marksheet/document.js';
	import { count } from '$lib/prose.js';
	import { currentFixture, topicPrototype } from './prototype-state.svelte.js';
	import { aoRowsOf, finishedRows } from './topic-rows.js';
	import TopicTable from './TopicTable.svelte';

	const proto = topicPrototype();
	const fixture = $derived(currentFixture());
	const document = $derived(fixture.document);
	const twoTiers = $derived(document.tiers.length === 2);
	const pairs = $derived(analyseCommonQuestions(document));

	let chosen = $state<string | null>(null);
	let shownTab = $state<string>('0');
	function chooseTab(next: string | string[] | undefined): void {
		if (next === '0' || next === '1' || next === 'common') {
			chosen = next;
			shownTab = next;
			return;
		}
		shownTab = chosen ?? '0';
	}
	const tab = $derived(chosen ?? '0');

	/** The tier tab's own switch: entries as questions, or as topics. */
	let mode = $state('entry');
	let shownMode = $state('entry');
	function chooseMode(next: string | string[] | undefined): void {
		if (next === 'entry' || next === 'topic') {
			mode = next;
			shownMode = next;
			return;
		}
		shownMode = mode;
	}

	function shortOf(tier: TierIndex): string {
		return tierNameOf(document, tier)?.charAt(0).toUpperCase() ?? `T${tier + 1}`;
	}

	const openTier = $derived<TierIndex>(tab === '1' ? 1 : 0);

	const facts = $derived.by(() => {
		const { studentsCounted, absentExcluded, marksCounted, partMarked } = analyseTier(
			document,
			openTier
		).summary;
		return [
			`${count(studentsCounted, 'student')} counted`,
			`${absentExcluded} absent excluded`,
			`${count(marksCounted, 'mark')} counted`,
			`${partMarked} part-marked`
		].join(' · ');
	});
</script>

<main class="mx-auto max-w-5xl space-y-4 p-6">
	<header class="space-y-1">
		<h2 class="text-xl font-semibold">
			Question analysis{twoTiers ? ` — ${tierLabel(document, openTier)}` : ''} — {fixture.document
				.label}
			{#if fixture.document.className !== null}
				· {fixture.document.className}
			{/if}
		</h2>
		{#if tab !== 'common'}
			<p class="text-sm text-muted-foreground">{facts}</p>
		{/if}
	</header>

	{#if twoTiers}
		<div class="flex flex-wrap items-center gap-3">
			<ToggleGroup.Root
				type="single"
				variant="outline"
				aria-label="Analysis tier"
				bind:value={shownTab}
				onValueChange={chooseTab}
				class="w-fit"
			>
				{#each [0, 1] as const as tier (tier)}
					<ToggleGroup.Item value={String(tier)} class="px-4"
						>{tierLabel(document, tier)}</ToggleGroup.Item
					>
				{/each}
				{#if pairs.length > 0}
					<ToggleGroup.Item value="common" class="px-4">
						Common questions <span class="text-muted-foreground tabular-nums">({pairs.length})</span
						>
					</ToggleGroup.Item>
				{/if}
			</ToggleGroup.Root>
		</div>
	{/if}

	{#if tab === 'common' && twoTiers}
		<CommonQuestions rows={pairs} tier1Short={shortOf(0)} tier2Short={shortOf(1)} />
	{:else}
		<div class="flex flex-wrap items-center gap-3">
			<ToggleGroup.Root
				type="single"
				variant="outline"
				size="sm"
				aria-label="Read one tier by entry or by topic"
				bind:value={shownMode}
				onValueChange={chooseMode}
				class="w-fit"
			>
				<ToggleGroup.Item value="entry" class="px-4">By entry</ToggleGroup.Item>
				<ToggleGroup.Item value="topic" class="px-4">By topic</ToggleGroup.Item>
			</ToggleGroup.Root>
		</div>

		{#if mode === 'entry'}
			<TierAnalysis
				rows={analyseTier(document, openTier).ordered}
				tier={openTier}
				tierShort={twoTiers ? shortOf(openTier) : null}
				otherShort={shortOf(openTier === 0 ? 1 : 0)}
				otherTierName={tierNameLabel(document, openTier === 0 ? 1 : 0)}
				{pairs}
			/>
		{:else}
			<TopicTable
				rows={finishedRows(document, openTier, proto.rules, proto.sort)}
				label={`Facility by topic — ${tierNameLabel(document, openTier)}`}
			/>
			{#if proto.rules.aoRows === 'separate' && aoRowsOf(document, openTier, proto.rules, proto.sort).length > 0}
				<h3 class="mt-2 text-base font-semibold">Assessment objectives</h3>
				<TopicTable
					rows={aoRowsOf(document, openTier, proto.rules, proto.sort)}
					label={`Facility by assessment objective — ${tierNameLabel(document, openTier)}`}
				/>
			{/if}
		{/if}
	{/if}
</main>
