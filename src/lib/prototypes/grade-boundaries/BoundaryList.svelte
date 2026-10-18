<!--
	PROTOTYPE (#55) — boundaries as a vertical list, top grade first: one row per grade,
	label and minimum mark side by side, each problem under its row. A paste anywhere in
	the list reads a board's table and replaces the rows. Used by variant A's popover.
-->
<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { cn } from '$lib/utils';
	import { grades, issuesOf, paperTotal, readPaste } from './grades.svelte.js';

	const total = $derived(paperTotal());
	const issues = $derived(issuesOf(grades.rows, grades.below, total));
	let pasteNote = $state<{ ok: boolean; text: string } | null>(null);
	// An empty list opens on one blank row, somewhere to type or paste into.
	if (grades.rows.length === 0) grades.rows.push({ label: '', min: '' });

	function onPaste(event: ClipboardEvent) {
		const text = event.clipboardData?.getData('text/plain') ?? '';
		// A single value typed into one field is that field's; a table is the list's.
		if (text.trim().split(/[\s,]+/).length < 2) return;
		event.preventDefault();
		const read = readPaste(text, grades.rows);
		if (read.ok) grades.rows = read.rows;
		pasteNote = { ok: read.ok, text: read.ok ? read.note : read.error };
	}
</script>

<div class="space-y-2 text-sm" onpaste={onPaste}>
	<div class="grid grid-cols-[5rem_5rem_1.5rem] gap-x-2 text-xs text-muted-foreground">
		<span>Grade</span><span>From mark</span>
	</div>
	{#each grades.rows as row, i (i)}
		{@const rowIssues = issues.filter((issue) => issue.index === i)}
		<div class="space-y-0.5">
			<div class="grid grid-cols-[5rem_5rem_1.5rem] items-center gap-x-2">
				<Input
					class={cn('h-7', rowIssues.some((x) => x.field === 'label') && 'border-destructive')}
					bind:value={row.label}
					aria-label="Grade label"
				/>
				<Input
					class={cn(
						'h-7 tabular-nums',
						rowIssues.some((x) => x.field === 'min') && 'border-destructive'
					)}
					inputmode="numeric"
					bind:value={row.min}
					aria-label="Minimum mark for {row.label || 'this grade'}"
				/>
				<button
					type="button"
					class="text-muted-foreground hover:text-foreground"
					aria-label="Remove grade"
					onclick={() => grades.rows.splice(i, 1)}
				>
					<XIcon class="size-3.5" />
				</button>
			</div>
			{#each rowIssues as issue (issue.message)}
				<p class="text-xs text-destructive">{issue.message}</p>
			{/each}
		</div>
	{/each}
	<Button variant="ghost" size="xs" onclick={() => grades.rows.push({ label: '', min: '' })}>
		<PlusIcon class="size-3.5" /> Add grade
	</Button>
	<div class="grid grid-cols-[5rem_auto] items-center gap-x-2 border-t pt-2">
		<Input class="h-7" bind:value={grades.below} aria-label="Label below the lowest grade" />
		<span class="text-xs text-muted-foreground">below the lowest grade</span>
	</div>
	<p class="text-xs text-muted-foreground">
		Out of {total}. Paste a board's boundary table here to fill the list.
	</p>
	{#if pasteNote}
		<p
			class={cn(
				'text-xs',
				pasteNote.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'
			)}
		>
			{pasteNote.text}
		</p>
	{/if}
</div>
