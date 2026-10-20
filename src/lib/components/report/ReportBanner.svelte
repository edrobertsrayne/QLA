<!-- The marksheet's way in to reports and grades: how many could be written,
     or how many have been — beside the paper's grade boundaries, which both the
     marksheet columns and the reports read. -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import { isEligible } from '$lib/marksheet/report-eligibility.js';
	import { count } from '$lib/prose.js';
	import GradeBoundariesDialog from './GradeBoundariesDialog.svelte';

	const store = marksheetStore();
	const document = $derived(store.document);
	const written = $derived(document ? Object.keys(document.reports).length : 0);
	const eligible = $derived(
		document ? document.students.filter((s) => isEligible(document, s.id)).length : 0
	);
	const total = $derived(document?.students.length ?? 0);
	const boundaryCount = $derived(document?.paper.boundaries?.length ?? 0);
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
		</p>
		<div class="flex gap-2">
			<Button size="sm" variant="outline" onclick={() => (gradesOpen = true)}>
				{boundaryCount > 0 ? `Grade boundaries (${boundaryCount})` : 'Set grade boundaries'}
			</Button>
			{#if written > 0}
				<Button size="sm" onclick={() => void goto(resolve('/reports'))}>Open reports</Button>
			{:else if eligible > 0}
				<Button size="sm" onclick={() => void goto(resolve('/reports'))}>Make reports</Button>
			{/if}
		</div>
	</div>
	<GradeBoundariesDialog bind:open={gradesOpen} />
{/if}
