<!-- The marksheet's way in to reports and grades: how many could be written,
     or how many have been — beside the open tier's grade boundaries, which both
     the marksheet columns and that tier's reports read. Report-ready students
     are counted across both tiers, and anyone still waiting for a tier is named
     as the reason the rest cannot be written. -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { tierNameLabel } from '$lib/components/marksheet/tier-label.js';
	import { Button } from '$lib/components/ui/button';
	import type { TierIndex } from '$lib/marksheet/document.js';
	import { boundariesOf } from '$lib/marksheet/grades.js';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import { isEligible } from '$lib/marksheet/report-eligibility.js';
	import { count } from '$lib/prose.js';
	import GradeBoundariesDialog from './GradeBoundariesDialog.svelte';

	let { tier }: { tier: TierIndex | null } = $props();

	const store = marksheetStore();
	const document = $derived(store.document);
	const written = $derived(document ? Object.keys(document.reports).length : 0);
	const eligible = $derived(
		document ? document.students.filter((s) => isEligible(document, s.id)).length : 0
	);
	const total = $derived(document?.students.length ?? 0);
	const notSet = $derived(document ? document.students.filter((s) => s.tier === null).length : 0);
	const boundaryCount = $derived(
		document !== null && tier !== null ? (boundariesOf(document, tier)?.length ?? 0) : 0
	);
	const boundariesLabel = $derived.by(() => {
		if (document === null || tier === null) return '';
		// One tier keeps today's wording: there is no other paper to tell it from.
		if (document.tiers.length === 1) {
			return boundaryCount > 0 ? `Grade boundaries (${boundaryCount})` : 'Set grade boundaries';
		}
		const name = tierNameLabel(document, tier);
		return boundaryCount > 0 ? `${name} boundaries (${boundaryCount})` : `Set ${name} boundaries`;
	});
	let gradesOpen = $state(false);
</script>

{#if document}
	<div class="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
		<p>
			{#if written > 0}
				{count(written, 'report')} written for this paper
			{:else if eligible > 0}
				{eligible} of {total} students are fully marked and can have a report
			{:else}
				Reports are written from a fully marked marksheet
			{/if}
			{#if notSet > 0}
				<span class="text-muted-foreground">· {notSet} have no tier yet</span>
			{/if}
		</p>
		<div class="flex gap-2">
			{#if tier !== null}
				<Button size="sm" variant="outline" onclick={() => (gradesOpen = true)}>
					{boundariesLabel}
				</Button>
			{/if}
			{#if written > 0}
				<Button size="sm" onclick={() => void goto(resolve('/reports'))}>Open reports</Button>
			{:else if eligible > 0}
				<Button size="sm" onclick={() => void goto(resolve('/reports'))}>Make reports</Button>
			{/if}
		</div>
	</div>
	{#if tier !== null}
		<GradeBoundariesDialog bind:open={gradesOpen} {tier} />
	{/if}
{/if}
