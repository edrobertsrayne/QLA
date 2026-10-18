<!--
	PROTOTYPE (#55) — dialog entry 1: a small form table, top grade first. Type a grade,
	Tab to its mark, Enter for the next row. Each problem sits on its row. A board table
	pasted into any cell still fills the lot, but nothing asks for it.
-->
<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import { tick } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { cn } from '$lib/utils';
	import { draftIssues, paperTotal, readPaste, type Draft } from './grades.svelte.js';

	let { draft }: { draft: Draft } = $props();

	const total = $derived(paperTotal());
	const issues = $derived(draftIssues(draft));
	let body = $state<HTMLElement>();

	if (draft.rows.length === 0) draft.rows.push({ label: '', min: '' });

	async function nextRow(i: number) {
		if (i === draft.rows.length - 1) draft.rows.push({ label: '', min: '' });
		await tick();
		body?.querySelectorAll<HTMLInputElement>('[data-field="label"]')[i + 1]?.focus();
	}

	function onPaste(event: ClipboardEvent) {
		const text = event.clipboardData?.getData('text/plain') ?? '';
		if (text.trim().split(/[\s,]+/).length < 2) return;
		const read = readPaste(text, draft.rows);
		if (!read.ok) return;
		event.preventDefault();
		draft.rows = read.rows;
	}
</script>

<div class="space-y-3 text-sm" onpaste={onPaste}>
	<table class="w-full">
		<thead class="text-left text-xs text-muted-foreground">
			<tr>
				<th class="w-28 pb-1 font-normal">Grade</th>
				<th class="w-28 pb-1 font-normal">Lowest mark</th>
				<th></th>
			</tr>
		</thead>
		<tbody bind:this={body}>
			{#each draft.rows as row, i (i)}
				{@const rowIssues = issues.filter((x) => x.index === i)}
				<tr class="align-top">
					<td class="py-0.5 pr-2">
						<Input
							data-field="label"
							class={cn('h-8', rowIssues.some((x) => x.field === 'label') && 'border-destructive')}
							placeholder={i === 0 ? 'e.g. 9' : ''}
							bind:value={row.label}
							aria-label="Grade {i + 1}"
						/>
					</td>
					<td class="py-0.5 pr-2">
						<Input
							class={cn(
								'h-8 tabular-nums',
								rowIssues.some((x) => x.field === 'min') && 'border-destructive'
							)}
							inputmode="numeric"
							placeholder={i === 0 ? `of ${total}` : ''}
							bind:value={row.min}
							aria-label="Lowest mark for {row.label || `grade ${i + 1}`}"
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									void nextRow(i);
								}
							}}
						/>
					</td>
					<td class="py-1.5">
						<div class="flex items-start gap-2">
							<button
								type="button"
								class="text-muted-foreground hover:text-foreground"
								aria-label="Remove grade"
								onclick={() => draft.rows.splice(i, 1)}
							>
								<XIcon class="size-4" />
							</button>
							<span class="text-xs text-destructive">
								{rowIssues.map((x) => x.message).join('; ')}
							</span>
						</div>
					</td>
				</tr>
			{/each}
			<tr class="text-muted-foreground">
				<td class="py-0.5 pr-2">
					<Input class="h-8" bind:value={draft.below} aria-label="Label below the lowest grade" />
				</td>
				<td colspan="2" class="py-2 text-xs">below the lowest grade</td>
			</tr>
		</tbody>
	</table>
	<Button variant="ghost" size="xs" onclick={() => nextRow(draft.rows.length - 1)}>
		<PlusIcon class="size-3.5" /> Add grade
	</Button>
	<p class="text-xs text-muted-foreground">
		Top grade first, in raw marks out of {total}. Enter moves to the next grade.
	</p>
</div>
