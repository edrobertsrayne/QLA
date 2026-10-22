<!--
	One editable description per assessment objective the paper uses, lifted from
	the specification at parse. They appear beside the code in a report's By skill
	strip; blank means the code stands alone.
-->
<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { usedAssessmentObjectives } from '$lib/marksheet/breakdown.js';
	import { marksheetStore } from '$lib/marksheet/index.js';

	const store = marksheetStore();
	const used = $derived(usedAssessmentObjectives(store.entries));
	const descriptions = $derived(store.document?.breakdown.aoDescriptions ?? {});
</script>

{#if used.length > 0}
	<section class="space-y-2 rounded-lg border p-3" data-testid="ao-descriptions">
		<h2 class="text-sm font-semibold">Skill descriptions</h2>
		<p class="text-xs text-muted-foreground">
			Shown beside each skill on a student's report. Leave one blank to show the code alone.
		</p>
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
	</section>
{/if}
