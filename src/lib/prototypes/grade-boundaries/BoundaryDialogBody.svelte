<!--
	PROTOTYPE (#55, round 2) — the body of the "Set grade boundaries" dialog, with the
	entry method under test: `table`, `scale`, `line`, or `text` (round 1's paste box).
	Every method edits a working copy; Save writes it, so a half-typed set never shows.
-->
<script lang="ts" module>
	export type Entry = 'table' | 'scale' | 'line' | 'text';
</script>

<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import BoundaryText from './BoundaryText.svelte';
	import EntryLine from './EntryLine.svelte';
	import EntryScale from './EntryScale.svelte';
	import EntryTable from './EntryTable.svelte';
	import { draftFromGrades, draftIssues, draftRows, grades, saveDraft } from './grades.svelte.js';

	let { entry, onDone }: { entry: Entry; onDone?: () => void } = $props();

	const draft = $state(draftFromGrades());
	const dropUnmarked = $derived(entry === 'scale');
	const issues = $derived(draftIssues(draft, dropUnmarked));
	const count = $derived(draftRows(draft, dropUnmarked).length);

	function save() {
		saveDraft(draft, dropUnmarked);
		onDone?.();
	}
</script>

{#if entry === 'text'}
	<BoundaryText {onDone} />
{:else}
	<div class="space-y-4">
		{#if entry === 'table'}
			<EntryTable {draft} />
		{:else if entry === 'scale'}
			<EntryScale {draft} />
		{:else}
			<EntryLine {draft} />
		{/if}
		<div class="flex items-center gap-2 border-t pt-3">
			{#if grades.rows.length > 0}
				<Button
					variant="ghost"
					size="sm"
					class="text-muted-foreground"
					onclick={() => {
						draft.rows = [];
						save();
					}}
				>
					Remove grades
				</Button>
			{/if}
			<span class="ml-auto text-xs text-muted-foreground">
				{issues.length > 0
					? `${issues.length} ${issues.length === 1 ? 'problem' : 'problems'} to fix`
					: count === 0
						? 'No grades: reports show marks only'
						: `${count} grades`}
			</span>
			<Button disabled={issues.length > 0} onclick={save}>Save boundaries</Button>
		</div>
	</div>
{/if}
