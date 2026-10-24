<!--
	The Source files card: one tier is today's pair of pickers; a second tier
	turns the card into Tier 1 / Tier 2 tabs so only one tier's files are on
	screen. Same-inputs problems live on the tier that lacks the input.
-->
<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import PdfPicker from './PdfPicker.svelte';
	import type { UploadRun } from './run.svelte.js';

	interface Props {
		run: UploadRun;
		tab: number;
		onTabChange: (index: number) => void;
	}

	let { run, tab, onTabChange }: Props = $props();

	const current = $derived(Math.min(tab, run.tiers.length - 1));
	const tier = $derived(run.tiers[current]);
	const paperNeeded = $derived(
		run.mismatch.find((mismatch) => mismatch.tier === current && mismatch.kind === 'paper')
			?.message ?? null
	);
	const markschemeNeeded = $derived(
		run.mismatch.find((mismatch) => mismatch.tier === current && mismatch.kind === 'markscheme')
			?.message ?? null
	);

	function addTier(): void {
		run.addTier();
		onTabChange(1);
	}

	function removeTier(): void {
		run.removeTier();
		onTabChange(0);
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Source files</Card.Title>
		<Card.Description>
			{run.twoTiers
				? 'Both tiers need the same inputs.'
				: 'One or both PDFs, each up to 15 MB — paper and/or markscheme.'}
		</Card.Description>
		<Card.Action>
			{#if !run.twoTiers && run.phase === 'form'}
				<Button variant="ghost" size="sm" onclick={addTier}><PlusIcon />Add tier</Button>
			{/if}
		</Card.Action>
	</Card.Header>
	<Card.Content class="space-y-5">
		{#if run.twoTiers}
			<div class="flex items-center justify-between gap-2">
				<!-- Plain buttons, not a toggle group: pressing the open tier again must not clear it. -->
				<div class="flex flex-wrap items-center gap-2" role="group" aria-label="Tier">
					{#each run.tiers as slot, index (slot)}
						<Button
							size="sm"
							variant={current === index ? 'default' : 'outline'}
							aria-pressed={current === index}
							class="relative"
							onclick={() => onTabChange(index)}
						>
							Tier {index + 1}{slot.tierName ? ` · ${slot.tierName}` : ''}
							{#if run.mismatch.some((mismatch) => mismatch.tier === index) || slot.parse === 'failed'}
								<span
									class="absolute top-1 right-1 size-2 rounded-full bg-destructive"
									data-testid="tier-problem-{index}"
									aria-hidden="true"
								></span>
								<span class="sr-only">has a problem</span>
							{/if}
						</Button>
					{/each}
				</div>
				{#if current === 1 && run.phase === 'form'}
					<Button variant="ghost" size="sm" onclick={removeTier}>Remove Tier 2</Button>
				{/if}
			</div>
		{/if}

		{#if tier}
			{#key current}
				<PdfPicker
					id="paper-{current}"
					label="Assessment paper (PDF)"
					file={tier.paper}
					error={tier.paperError}
					needed={paperNeeded}
					disabled={!run.canEditFiles(current)}
					onpick={(file) => run.setFile(current, 'paper', file)}
				/>
				<PdfPicker
					id="markscheme-{current}"
					label="Markscheme (PDF)"
					file={tier.markscheme}
					error={tier.markschemeError}
					needed={markschemeNeeded}
					disabled={!run.canEditFiles(current)}
					onpick={(file) => run.setFile(current, 'markscheme', file)}
				/>
			{/key}
		{/if}
	</Card.Content>
</Card.Root>
