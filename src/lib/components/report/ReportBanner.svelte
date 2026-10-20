<!-- The marksheet's way in to reports: how many could be written, or how many have been. -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import { isEligible } from '$lib/marksheet/report-eligibility.js';
	import { count } from '$lib/prose.js';

	const store = marksheetStore();
	const document = $derived(store.document);
	const written = $derived(document ? Object.keys(document.reports).length : 0);
	const eligible = $derived(
		document ? document.students.filter((s) => isEligible(document, s.id)).length : 0
	);
	const total = $derived(document?.students.length ?? 0);
</script>

{#if written > 0}
	<div class="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
		<p>{count(written, 'report')} written for this paper</p>
		<Button size="sm" onclick={() => void goto(resolve('/reports'))}>Open reports</Button>
	</div>
{:else if eligible > 0}
	<div class="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
		<p>{eligible} of {total} students are fully marked and can have a report</p>
		<Button size="sm" onclick={() => void goto(resolve('/reports'))}>Make reports</Button>
	</div>
{/if}
