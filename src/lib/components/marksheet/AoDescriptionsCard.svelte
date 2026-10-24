<!--
	One editable description per assessment objective the assessment uses, lifted
	from the specification at parse. The set is shared by every tier, so a code
	reads the same on each tier's reports; blank means the code stands alone.
-->
<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { usedAssessmentObjectives } from '$lib/marksheet/breakdown.js';
	import { marksheetStore } from '$lib/marksheet/index.js';

	const store = marksheetStore();
	const used = $derived(usedAssessmentObjectives(store.entries));
	const descriptions = $derived(store.aoDescriptions);
	const twoTiers = $derived(store.tierCount === 2);
</script>

{#if used.length > 0}
	<section class="space-y-2 rounded-lg border p-3" data-testid="ao-descriptions">
		<h2 class="text-sm font-semibold">
			Skill descriptions{#if twoTiers}<span class="font-normal text-muted-foreground">
					&#32;· both tiers</span
				>{/if}
		</h2>
		<p class="text-xs text-muted-foreground">
			Shown beside each skill on a student's report. Leave one blank to show the code alone.
		</p>
		<div class="grid gap-1.5 lg:grid-cols-2">
			{#each used as ao (ao)}
				<div class="space-y-1">
					<Label class="text-xs text-muted-foreground" for={`ao-description-${ao}`}>{ao}</Label>
					<Input
						id={`ao-description-${ao}`}
						class="h-8 text-xs"
						placeholder="No description"
						value={descriptions[ao] ?? ''}
						oninput={(event) => store.setAoDescription(ao, event.currentTarget.value)}
					/>
				</div>
			{/each}
		</div>
	</section>
{/if}
