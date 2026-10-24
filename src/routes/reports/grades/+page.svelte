<script lang="ts">
	import GradeBoundariesForm from '$lib/components/report/GradeBoundariesForm.svelte';
	import { goToStep } from '$lib/components/report/reports-flow.svelte.js';
	import { Button } from '$lib/components/ui/button';
	import type { TierIndex } from '$lib/marksheet/document.js';
	import { boundariesOf } from '$lib/marksheet/grades.js';
	import { marksheetStore } from '$lib/marksheet/index.js';

	const store = marksheetStore();
	const document = $derived(store.document);
	const tiers = $derived(store.tiers);
	/** Which tier's boundaries this step edits: a two-tier paper has one set each. */
	let tier = $state<TierIndex>(0);
	const TIERS: readonly TierIndex[] = [0, 1];
	const twoTiers = $derived(tiers.length > 1);
	const hasBoundaries = $derived(document ? boundariesOf(document, tier) !== null : false);
	/** The other tier, offered after a save so both can be set in one visit. */
	const otherTier = $derived<TierIndex | null>(twoTiers ? (tier === 0 ? 1 : 0) : null);
	/** What the last save or removal on this visit did, so its effect is stated. */
	let saved = $state<{ tier: TierIndex; action: 'saved' | 'removed' } | null>(null);

	function tierTitle(value: TierIndex): string {
		const name = tiers[value].tierName?.trim();
		return name ? `Tier ${value + 1} · ${name}` : `Tier ${value + 1}`;
	}

	function selectTier(value: TierIndex): void {
		tier = value;
		saved = null;
	}

	/**
	 * One tier keeps today's flow and leaves for Who. Two tiers stay here, so the
	 * teacher can save the other tier without walking back through the steps.
	 */
	function done(action: 'saved' | 'removed'): void {
		if (!twoTiers) {
			goToStep('who');
			return;
		}
		saved = { tier, action };
	}
</script>

{#if document}
	<section class="max-w-xl space-y-4">
		<h1 class="text-xl font-semibold">Grades</h1>
		<p class="max-w-prose text-sm text-muted-foreground">
			Reports show a grade when the paper has boundaries. Set them now, or skip and reports show
			marks only.
		</p>
		{#if twoTiers}
			<div class="flex flex-wrap gap-2" role="group" aria-label="Tier">
				{#each TIERS.slice(0, tiers.length) as value (value)}
					<Button
						size="sm"
						variant={tier === value ? 'default' : 'outline'}
						aria-pressed={tier === value}
						onclick={() => selectTier(value)}
					>
						{tierTitle(value)}
					</Button>
				{/each}
			</div>
		{/if}
		{#key tier}
			<GradeBoundariesForm {tier} onDone={done} />
		{/key}
		{#if saved !== null}
			<div class="flex flex-wrap items-center gap-2">
				<p class="text-sm text-muted-foreground" role="status">
					{tierTitle(saved.tier)} boundaries {saved.action}.
				</p>
				{#if otherTier !== null}
					<Button size="sm" variant="outline" onclick={() => selectTier(otherTier)}>
						Set {tierTitle(otherTier)} grades
					</Button>
				{/if}
			</div>
		{/if}
		<div class="flex flex-wrap gap-2">
			{#if hasBoundaries}
				<Button onclick={() => goToStep('who')}>Next</Button>
			{:else}
				<Button variant="outline" onclick={() => goToStep('who')}>
					Skip: no grades on these reports
				</Button>
			{/if}
		</div>
	</section>
{/if}
