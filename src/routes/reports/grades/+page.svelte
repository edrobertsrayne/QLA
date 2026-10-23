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
	const hasBoundaries = $derived(document ? boundariesOf(document, tier) !== null : false);
</script>

{#if document}
	<section class="max-w-xl space-y-4">
		<h1 class="text-xl font-semibold">Grades</h1>
		<p class="max-w-prose text-sm text-muted-foreground">
			Reports show a grade when the paper has boundaries. Set them now, or skip and reports show
			marks only.
		</p>
		{#if tiers.length > 1}
			<div class="flex flex-wrap gap-2" role="group" aria-label="Tier">
				{#each TIERS.slice(0, tiers.length) as value (value)}
					<Button
						size="sm"
						variant={tier === value ? 'default' : 'outline'}
						aria-pressed={tier === value}
						onclick={() => (tier = value)}
					>
						{tiers[value].tierName
							? `Tier ${value + 1} · ${tiers[value].tierName}`
							: `Tier ${value + 1}`}
					</Button>
				{/each}
			</div>
		{/if}
		<GradeBoundariesForm {tier} onDone={() => goToStep('who')} />
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
