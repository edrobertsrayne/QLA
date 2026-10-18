<!--
	PROTOTYPE (#55) — boundaries as text: paste a board's table (or type one grade and
	mark per line) into a box, read back what was understood as a table with each
	problem on its row, and save it as a whole. Nothing changes until Save. Variant C,
	used both from the marksheet toolbar and as the report flow's grades step.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { cn } from '$lib/utils';
	import { grades, issuesOf, paperTotal, readPaste, type BoundaryRow } from './grades.svelte.js';

	let { onDone }: { onDone?: () => void } = $props();

	const total = $derived(paperTotal());
	const toText = (rows: BoundaryRow[]) => rows.map((r) => `${r.label}\t${r.min}`).join('\n');
	let text = $state(toText(grades.rows));
	let below = $state(grades.below);

	const read = $derived(text.trim() === '' ? null : readPaste(text, []));
	const rows = $derived(read?.ok ? read.rows : []);
	const issues = $derived(issuesOf(rows, below, total));
	const canSave = $derived(text.trim() === '' || (read?.ok === true && issues.length === 0));

	function save() {
		grades.rows = rows.map((r) => ({ ...r }));
		grades.below = below.trim() || 'U';
		onDone?.();
	}
</script>

<div class="grid gap-4 text-sm md:grid-cols-2">
	<div class="space-y-2">
		<label class="block font-medium" for="boundary-text">Paste or type the boundaries</label>
		<Textarea
			id="boundary-text"
			class="h-48 font-mono text-xs"
			placeholder={'9\t36\n8\t32\n7\t28\n…\n\nor paste the board’s two rows:\nGrade 9 8 7 6 5 4\nMark 36 32 28 24 20 16'}
			bind:value={text}
		/>
		<p class="text-xs text-muted-foreground">
			Raw marks on this paper, out of {total}. Leave empty for no grades.
		</p>
		<div class="flex items-center gap-2">
			<Input class="h-7 w-16" bind:value={below} aria-label="Label below the lowest grade" />
			<span class="text-xs text-muted-foreground">for a total below the lowest grade</span>
		</div>
	</div>
	<div class="space-y-2">
		<p class="font-medium">Read as</p>
		{#if read === null}
			<p class="text-muted-foreground">No boundaries: the marksheet and reports show no grade.</p>
		{:else if !read.ok}
			<p class="text-destructive">{read.error}</p>
		{:else}
			<table class="w-full text-left">
				<thead class="text-xs text-muted-foreground">
					<tr><th class="font-normal">Grade</th><th class="font-normal">From mark</th><th></th></tr>
				</thead>
				<tbody>
					{#each rows as row, i (i)}
						{@const rowIssues = issues.filter((x) => x.index === i)}
						<tr class={cn(rowIssues.length > 0 && 'text-destructive')}>
							<td class="font-semibold">{row.label}</td>
							<td class="tabular-nums">{row.min}</td>
							<td class="text-xs">{rowIssues.map((x) => x.message).join('; ')}</td>
						</tr>
					{/each}
					<tr class="text-muted-foreground">
						<td class="font-semibold">{below.trim() || 'U'}</td>
						<td colspan="2" class="text-xs">below {rows.at(-1)?.min ?? '—'}</td>
					</tr>
				</tbody>
			</table>
			<p class="text-xs text-muted-foreground">{read.note}</p>
		{/if}
		<Button disabled={!canSave} onclick={save}>Save boundaries</Button>
	</div>
</div>
