<!--
	The Who gets one step: who is eligible, who is blocked and why, the model
	override, and the button that writes a report for everyone without one.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import ModelSelect from '$lib/components/parse/ModelSelect.svelte';
	import type { ModelList } from '$lib/components/parse/model-list.svelte.js';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { blockerText } from '$lib/marksheet/report-eligibility.js';
	import { count } from '$lib/prose.js';
	import { rowsOf, type RosterRow } from './report-roster.js';

	let {
		roster,
		running,
		models,
		modelOverride = $bindable(),
		onwrite
	}: {
		roster: RosterRow[];
		running: boolean;
		models: ModelList;
		modelOverride: string;
		onwrite: (ids: string[]) => void;
	} = $props();

	const blocked = $derived(rowsOf(roster, 'blocked'));
	/** Eligible students with no report: Who gets one never writes over a stored one. */
	const unwrittenIds = $derived(rowsOf(roster, 'unwritten').map((row) => row.studentId));
	const eligibleCount = $derived(roster.length - blocked.length);
</script>

<section class="space-y-4">
	<h1 class="text-xl font-semibold">{count(eligibleCount, 'student')} get a report</h1>
	{#if blocked.length > 0}
		<div class="space-y-2 rounded-md border p-3">
			<h2 class="font-medium">Not getting one yet</h2>
			<ul class="space-y-1 text-sm">
				{#each blocked as row (row.studentId)}
					<li>
						<span class="font-medium">{row.name}</span>
						<span class="text-muted-foreground"
							>{row.status.blockers.map((blocker) => blockerText(blocker)).join(' · ')}</span
						>
					</li>
				{/each}
			</ul>
			<a class="text-sm underline" href={resolve('/marksheet')}
				>Back to the marksheet to fix these</a
			>
		</div>
	{/if}
	<div class="max-w-sm space-y-2">
		<Label>Model override (optional)</Label>
		<ModelSelect
			bind:value={modelOverride}
			models={models.options}
			loading={models.loading}
			loadError={models.error}
			onretry={() => void models.load()}
		/>
	</div>
	<Button disabled={unwrittenIds.length === 0 || running} onclick={() => onwrite(unwrittenIds)}>
		Write {count(unwrittenIds.length, 'report')}
	</Button>
	{#if eligibleCount > 0 && unwrittenIds.length === 0}
		<p class="text-sm text-muted-foreground">
			Every student here has a report. Rewrite them from Review and print.
		</p>
	{/if}
</section>
