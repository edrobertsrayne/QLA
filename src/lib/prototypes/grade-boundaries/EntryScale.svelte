<!--
	PROTOTYPE (#55) — dialog entry 2: pick the grade scale, then type only the marks.
	The scale fills the labels; a grade left blank is one this paper doesn't award (a
	higher-tier paper has no 1 or 2) and is dropped. "Custom" makes the labels editable.
	Each row says how many fully-marked students it would catch.
-->
<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { cn } from '$lib/utils';
	import {
		SCALES,
		classTotals,
		draftIssues,
		draftRows,
		gradeOf,
		paperTotal,
		type Draft
	} from './grades.svelte.js';

	let { draft }: { draft: Draft } = $props();

	const total = $derived(paperTotal());
	const issues = $derived(draftIssues(draft, true));
	const totals = $derived(classTotals());

	/** The scale whose labels the draft carries, or custom. */
	function matchScale(): string {
		const labels = draft.rows.map((r) => r.label.trim()).join('|');
		return (
			SCALES.find((s) => s.labels.join('|') === labels)?.name ??
			(draft.rows.length === 0 ? '' : 'Custom')
		);
	}
	let scale = $state(matchScale());

	function pick(name: string) {
		scale = name;
		if (name === 'Custom') {
			if (draft.rows.length === 0) draft.rows = [{ label: '', min: '' }];
			return;
		}
		const labels = SCALES.find((s) => s.name === name)!.labels;
		const previous = new Map(draft.rows.map((r) => [r.label.trim(), r.min]));
		draft.rows = labels.map((label) => ({ label, min: previous.get(label) ?? '' }));
	}

	/** How many fully-marked students land on each grade, once the draft is valid. */
	const counts = $derived.by(() => {
		if (issues.length > 0) return null;
		const list = draftRows(draft, true).map((r) => ({ label: r.label.trim(), min: Number(r.min) }));
		if (list.length === 0) return null;
		const tally: Record<string, number> = {};
		for (const t of totals) {
			const g = gradeOf(t.total, list);
			if (g) tally[g.label] = (tally[g.label] ?? 0) + 1;
		}
		return tally;
	});
</script>

<div class="space-y-4 text-sm">
	<div class="space-y-1.5">
		<p class="text-xs text-muted-foreground">Grade scale</p>
		<div class="flex flex-wrap gap-1.5">
			{#each [...SCALES.map((s) => s.name), 'Custom'] as name (name)}
				<button
					type="button"
					class={cn(
						'rounded-full border px-3 py-1 text-xs',
						scale === name ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'
					)}
					onclick={() => pick(name)}
				>
					{name}
				</button>
			{/each}
		</div>
	</div>

	{#if scale === ''}
		<p class="text-muted-foreground">Pick a scale to start, or Custom to name your own grades.</p>
	{:else}
		<table class="w-full">
			<thead class="text-left text-xs text-muted-foreground">
				<tr>
					<th class="w-36 pb-1 font-normal">Grade</th>
					<th class="w-24 pb-1 font-normal">Lowest mark</th>
					<th class="w-20 pb-1 font-normal">Students</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each draft.rows as row, i (i)}
					{@const rowIssues = issues.filter((x) => x.index === i)}
					{@const off = row.min.trim() === ''}
					<tr class={cn('align-middle', off && scale !== 'Custom' && 'text-muted-foreground')}>
						<td class="py-0.5 pr-2">
							{#if scale === 'Custom'}
								<Input class="h-8" bind:value={row.label} aria-label="Grade {i + 1}" />
							{:else}
								<span class="font-semibold">{row.label}</span>
							{/if}
						</td>
						<td class="py-0.5 pr-2">
							<Input
								class={cn(
									'h-8 w-20 tabular-nums',
									rowIssues.some((x) => x.field === 'min') && 'border-destructive'
								)}
								inputmode="numeric"
								placeholder={scale === 'Custom' ? '' : 'not used'}
								bind:value={row.min}
								aria-label="Lowest mark for {row.label}"
							/>
						</td>
						<td class="py-0.5 text-xs tabular-nums text-muted-foreground">
							{counts && !off ? (counts[row.label.trim()] ?? 0) : ''}
						</td>
						<td class="py-0.5 text-xs text-destructive">
							{rowIssues.map((x) => x.message).join('; ')}
						</td>
					</tr>
				{/each}
				<tr class="text-muted-foreground">
					<td class="py-0.5 pr-2">
						<Input
							class="h-8 w-28"
							bind:value={draft.below}
							aria-label="Label below the lowest grade"
						/>
					</td>
					<td class="py-0.5 text-xs">below the rest</td>
					<td class="py-0.5 text-xs tabular-nums">
						{counts ? (counts[draft.below.trim() || 'U'] ?? 0) : ''}
					</td>
					<td></td>
				</tr>
			</tbody>
		</table>
		{#if scale === 'Custom'}
			<Button variant="ghost" size="xs" onclick={() => draft.rows.push({ label: '', min: '' })}>
				<PlusIcon class="size-3.5" /> Add grade
			</Button>
		{/if}
		<p class="text-xs text-muted-foreground">
			Raw marks out of {total}. Leave a grade blank if this paper doesn't award it.
		</p>
	{/if}
</div>
