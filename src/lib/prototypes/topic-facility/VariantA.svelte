<!--
	PROTOTYPE (#159) — Variant A: the class's topics get their own tab beside
	the tier and common-questions tabs. Every tier's topic list lives there,
	grouped by tier. Three variants of where the topic view lives, switchable
	via ?variant= on the real /marksheet/analysis route; figures computed from
	real document data (fixtures.ts) by the real facility arithmetic.
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
		if (next === '0' || next === '1' || next === 'common' || next === 'topics') {
			chosen = next;
			shownTab = next;
			return;
		}
		shownTab = chosen ?? '0';
	}
	const tab = $derived(chosen ?? '0');

	function shortOf(tier: TierIndex): string {
		return tierNameOf(document, tier)?.charAt(0).toUpperCase() ?? `T${tier + 1}`;
	}

	const shownTiers = $derived<TierIndex[]>(twoTiers ? [0, 1] : [0]);

	function factsOf(tier: TierIndex): string {
		const { studentsCounted, absentExcluded, marksCounted, partMarked } = analyseTier(
			document,
			tier
		).summary;
		return [
			`${count(studentsCounted, 'student')} counted`,
			`${absentExcluded} absent excluded`,
			`${count(marksCounted, 'mark')} counted`,
			`${partMarked} part-marked`
		].join(' · ');
	}
</script>

<main class="mx-auto max-w-5xl space-y-4 p-6">
	<header class="space-y-1">
		<h2 class="text-xl font-semibold">
			{tab === 'topics' ? 'By topic' : 'Question analysis'} — {fixture.document.label}
			{#if fixture.document.className !== null}
				· {fixture.document.className}
			{/if}
		</h2>
		{#if tab !== 'topics' && tab !== 'common'}
			<p class="text-sm text-muted-foreground">{factsOf(tab === '1' ? 1 : 0)}</p>
		{/if}
	</header>

	<div class="flex flex-wrap items-center gap-3">
		<ToggleGroup.Root
			type="single"
			variant="outline"
			aria-label="Analysis view"
			bind:value={shownTab}
			onValueChange={chooseTab}
			class="w-fit"
		>
			{#if twoTiers}
				{#each [0, 1] as const as tier (tier)}
					<ToggleGroup.Item value={String(tier)} class="px-4"
						>{tierLabel(document, tier)}</ToggleGroup.Item
					>
				{/each}
			{:else}
				<ToggleGroup.Item value="0" class="px-4">Question analysis</ToggleGroup.Item>
			{/if}
			{#if twoTiers && pairs.length > 0}
				<ToggleGroup.Item value="common" class="px-4">
					Common questions <span class="text-muted-foreground tabular-nums">({pairs.length})</span>
				</ToggleGroup.Item>
			{/if}
			<ToggleGroup.Item value="topics" class="px-4">By topic</ToggleGroup.Item>
		</ToggleGroup.Root>
	</div>

	{#if tab === 'topics'}
		{#each shownTiers as tier (tier)}
			<section class="space-y-2">
				{#if twoTiers}
					<h3 class="text-base font-semibold">{tierLabel(document, tier)}</h3>
				{/if}
				<TopicTable
					rows={finishedRows(document, tier, proto.rules, proto.sort)}
					label={`Facility by topic — ${tierNameLabel(document, tier)}`}
				/>
				{#if proto.rules.aoRows === 'separate'}
					{#if aoRowsOf(document, tier, proto.rules, proto.sort).length > 0}
						<h3 class="text-base font-semibold">Assessment objectives</h3>
						<TopicTable
							rows={aoRowsOf(document, tier, proto.rules, proto.sort)}
							label={`Facility by assessment objective — ${tierNameLabel(document, tier)}`}
						/>
					{/if}
				{/if}
			</section>
		{/each}
	{:else if tab === 'common' && twoTiers}
		<CommonQuestions rows={pairs} tier1Short={shortOf(0)} tier2Short={shortOf(1)} />
	{:else}
		{@const tier = tab === '1' ? 1 : 0}
		<TierAnalysis
			rows={analyseTier(document, tier).ordered}
			{tier}
			tierShort={twoTiers ? shortOf(tier) : null}
			otherShort={shortOf(tier === 0 ? 1 : 0)}
			otherTierName={tierNameLabel(document, tier === 0 ? 1 : 0)}
			{pairs}
		/>
	{/if}
</main>
