<!--
	PROTOTYPE (#55) — boundaries as a strip above the marksheet, shaped like a board's
	printed table: grades across, the minimum mark under each, the below-lowest label at
	the end, and how many fully-marked students land on each grade underneath. A paste
	anywhere on the strip reads a board's row and replaces it. Variant B.
-->
<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import { Button } from '$lib/components/ui/button';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import { cn } from '$lib/utils';
	import { grades, issuesOf, paperTotal, readPaste, studentGrade } from './grades.svelte.js';

	const store = marksheetStore();
	const total = $derived(paperTotal());
	const issues = $derived(issuesOf(grades.rows, grades.below, total));
	let pasteNote = $state<{ ok: boolean; text: string } | null>(null);
	let open = $state(false);

	/** Fully-marked students per grade label, for the counts row. */
	const counts = $derived.by(() => {
		const tally: Record<string, number> = {};
		for (const student of store.students) {
			const g = studentGrade(student.id);
			if (g.kind === 'complete' && g.grade) tally[g.grade.label] = (tally[g.grade.label] ?? 0) + 1;
		}
		return tally;
	});

	function onPaste(event: ClipboardEvent) {
		const text = event.clipboardData?.getData('text/plain') ?? '';
		if (text.trim().split(/[\s,]+/).length < 2) return;
		event.preventDefault();
		const read = readPaste(text, grades.rows);
		if (read.ok) grades.rows = read.rows;
		pasteNote = { ok: read.ok, text: read.ok ? read.note : read.error };
		open = true;
	}

	const cell =
		'h-7 w-12 rounded-sm border bg-background px-1 text-center tabular-nums outline-none focus:ring-1 focus:ring-ring';
</script>

<div
	class="rounded-lg border p-3 text-sm"
	onpaste={onPaste}
	role="group"
	aria-label="Grade boundaries"
>
	{#if grades.rows.length === 0 && !open}
		<div class="flex flex-wrap items-center gap-3">
			<span class="font-medium">Grade boundaries</span>
			<span class="text-muted-foreground">
				None set, so no grades. Paste a board's boundary row here, or
			</span>
			<Button
				variant="outline"
				size="xs"
				onclick={() => {
					open = true;
					grades.rows.push({ label: '', min: '' });
				}}
			>
				type them in
			</Button>
			{#if pasteNote && !pasteNote.ok}
				<span class="text-xs text-destructive">{pasteNote.text}</span>
			{/if}
		</div>
	{:else}
		<div class="flex items-start gap-3">
			<div class="pt-1">
				<p class="font-medium">Grade boundaries</p>
				<p class="text-xs text-muted-foreground">out of {total}</p>
			</div>
			<div class="overflow-x-auto">
				<table class="border-separate border-spacing-x-1 border-spacing-y-0.5">
					<tbody>
						<tr>
							<th class="pr-1 text-left text-xs font-normal text-muted-foreground">Grade</th>
							{#each grades.rows as row, i (i)}
								{@const bad = issues.some((x) => x.index === i && x.field === 'label')}
								<td class="relative">
									<input
										class={cn(cell, 'font-semibold', bad && 'border-destructive')}
										bind:value={row.label}
										aria-label="Grade label {i + 1}"
									/>
								</td>
							{/each}
							<td>
								<button
									type="button"
									class="flex h-7 w-7 items-center justify-center rounded-sm border border-dashed text-muted-foreground hover:text-foreground"
									aria-label="Add grade"
									onclick={() => grades.rows.push({ label: '', min: '' })}
								>
									<PlusIcon class="size-3.5" />
								</button>
							</td>
							<td class="border-l pl-2">
								<input
									class={cn(cell, 'font-semibold')}
									bind:value={grades.below}
									aria-label="Label below the lowest grade"
								/>
							</td>
						</tr>
						<tr>
							<th class="pr-1 text-left text-xs font-normal text-muted-foreground">From</th>
							{#each grades.rows as row, i (i)}
								{@const bad = issues.some((x) => x.index === i && x.field === 'min')}
								<td>
									<input
										class={cn(cell, bad && 'border-destructive bg-destructive/10')}
										inputmode="numeric"
										bind:value={row.min}
										aria-label="Minimum mark for {row.label || `grade ${i + 1}`}"
									/>
								</td>
							{/each}
							<td></td>
							<td class="border-l pl-2 text-center text-xs text-muted-foreground">below</td>
						</tr>
						<tr class="text-center text-xs text-muted-foreground">
							<th class="pr-1 text-left font-normal">Students</th>
							{#each grades.rows as row, i (i)}
								<td class="tabular-nums">
									{issues.length === 0 ? (counts[row.label.trim()] ?? 0) : ''}
									<button
										type="button"
										class="ml-0.5 align-middle opacity-40 hover:opacity-100"
										aria-label="Remove grade {row.label}"
										onclick={() => grades.rows.splice(i, 1)}
									>
										<XIcon class="inline size-3" />
									</button>
								</td>
							{/each}
							<td></td>
							<td class="border-l pl-2 tabular-nums">
								{issues.length === 0 ? (counts[grades.below.trim() || 'U'] ?? 0) : ''}
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>
		{#if issues.length > 0}
			<ul class="mt-2 space-y-0.5 text-xs text-destructive">
				{#each issues as issue (issue.index + issue.field + issue.message)}
					<li>
						{grades.rows[issue.index].label || `Grade ${issue.index + 1}`}: {issue.message}
					</li>
				{/each}
				<li class="text-muted-foreground">No grades show until these are fixed.</li>
			</ul>
		{:else if pasteNote}
			<p class={cn('mt-2 text-xs', pasteNote.ok ? 'text-muted-foreground' : 'text-destructive')}>
				{pasteNote.text}
			</p>
		{/if}
	{/if}
</div>
