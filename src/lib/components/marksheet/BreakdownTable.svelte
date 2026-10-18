<!--
	The breakdown as an editable document: one row per entry, grouped under its
	question when banding is on. Every field is editable in place, so a mistake
	the model made is fixed here rather than by paying for another parse.
-->
<script lang="ts">
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import * as Popover from '$lib/components/ui/popover';
	import * as Table from '$lib/components/ui/table';
	import {
		entryName,
		isUndivided,
		warningsForEntry,
		type QuestionBand
	} from '$lib/marksheet/breakdown.js';
	import type { BreakdownEntry } from '$lib/marksheet/document.js';
	import { totalMarks } from '$lib/marksheet/document.js';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import {
		assessmentObjectiveOf,
		ASSESSMENT_OBJECTIVES
	} from '$lib/parse/assessment-objectives.js';

	let { banded = true }: { banded?: boolean } = $props();

	const store = marksheetStore();
	const entries = $derived(store.document?.breakdown.entries ?? []);
	const bands = $derived(store.questionBands);
	const warnings = $derived(store.document?.breakdown.warnings ?? []);

	/** A cell reads as plain text until hovered or focused: no box, no background. */
	const plain =
		'rounded-sm border border-transparent bg-transparent hover:border-border focus:border-ring focus:outline-none';
	const cell = `w-full px-1.5 py-1 ${plain} focus:bg-background`;
	const bandNumber = `ml-1 w-14 px-1 font-semibold ${plain}`;

	/**
	 * Enter a mark as it is typed. Only digits are a mark: anything else — a
	 * decimal, a letter — is refused, leaving the entry as it was, which the cell
	 * shows again once the teacher leaves it.
	 */
	function onMarksInput(entry: BreakdownEntry, event: Event): void {
		const typed = (event.currentTarget as HTMLInputElement).value.trim();
		if (typed === '') store.setEntryMarks(entry.id, null);
		else if (/^\d+$/.test(typed)) store.setEntryMarks(entry.id, Number(typed));
	}

	/** Show what the entry actually holds: a refused mark disappears as it is left. */
	function onMarksChange(entry: BreakdownEntry, event: Event): void {
		(event.currentTarget as HTMLInputElement).value =
			entry.marks === null ? '' : String(entry.marks);
	}

	/** An undivided question is one entry labelled with its own number. */
	function bandSummary(band: QuestionBand): string {
		if (isUndivided(band)) return 'undivided';
		return `${band.entries.length} subquestion${band.entries.length === 1 ? '' : 's'}`;
	}
</script>

{#snippet entryRow(entry: BreakdownEntry, showQuestion: boolean)}
	{@const own = warningsForEntry(warnings, entry.id)}
	<Table.Row data-entry={entry.id}>
		<Table.Cell class="w-6 pl-2">
			{#if own.length > 0}
				<Popover.Root>
					<Popover.Trigger
						class="text-amber-600 dark:text-amber-400"
						aria-label={`Parse warnings for ${entryName(entry)}`}
					>
						<TriangleAlertIcon class="size-4" />
					</Popover.Trigger>
					<Popover.Content class="w-72 text-xs">
						{#each own as warning (warning.code + warning.message)}
							<p><strong>{warning.code}</strong>: {warning.message}</p>
						{/each}
					</Popover.Content>
				</Popover.Root>
			{/if}
		</Table.Cell>
		<Table.Cell class="w-20 px-1">
			<input
				data-field="label"
				aria-label={`Label for ${entryName(entry)}`}
				class="{cell} font-medium"
				value={entry.label}
				oninput={(event) => store.setEntryLabel(entry.id, event.currentTarget.value)}
			/>
		</Table.Cell>
		{#if showQuestion}
			<Table.Cell class="w-16 px-1">
				<input
					data-field="questionNumber"
					aria-label={`Question number for ${entryName(entry)}`}
					class={cell}
					value={entry.questionNumber}
					onchange={(event) => store.setBandQuestionNumber([entry.id], event.currentTarget.value)}
				/>
			</Table.Cell>
		{/if}
		<Table.Cell class="w-16 px-1">
			<input
				data-field="marks"
				aria-label={`Marks for ${entryName(entry)}`}
				class="{cell} text-right tabular-nums {entry.marks === null
					? 'border-destructive/60 bg-destructive/10 text-destructive'
					: ''}"
				inputmode="numeric"
				placeholder="?"
				value={entry.marks ?? ''}
				oninput={(event) => onMarksInput(entry, event)}
				onchange={(event) => onMarksChange(entry, event)}
			/>
		</Table.Cell>
		<Table.Cell class="px-1">
			<input
				data-field="summary"
				aria-label={`Summary for ${entryName(entry)}`}
				class={cell}
				placeholder="What the question asks"
				value={entry.summary}
				oninput={(event) => store.setEntrySummary(entry.id, event.currentTarget.value)}
			/>
		</Table.Cell>
		<Table.Cell class="w-32 px-1">
			<input
				data-field="specPoint"
				aria-label={`Spec point for ${entryName(entry)}`}
				class="{cell} font-mono text-xs"
				placeholder="—"
				value={entry.specPoint ?? ''}
				oninput={(event) => store.setEntrySpecPoint(entry.id, event.currentTarget.value)}
			/>
		</Table.Cell>
		<Table.Cell class="w-32 px-1">
			<input
				data-field="commandWord"
				aria-label={`Command word for ${entryName(entry)}`}
				class={cell}
				placeholder="—"
				value={entry.commandWord ?? ''}
				oninput={(event) => store.setEntryCommandWord(entry.id, event.currentTarget.value)}
			/>
		</Table.Cell>
		<Table.Cell class="w-20 px-1">
			<select
				data-field="ao"
				aria-label={`Assessment objective for ${entryName(entry)}`}
				class="{cell} {entry.ao === null ? 'text-muted-foreground' : ''}"
				value={entry.ao ?? ''}
				onchange={(event) =>
					store.setEntryAo(entry.id, assessmentObjectiveOf(event.currentTarget.value))}
			>
				<option value="">—</option>
				{#each ASSESSMENT_OBJECTIVES as objective (objective)}
					<option value={objective}>{objective}</option>
				{/each}
			</select>
		</Table.Cell>
	</Table.Row>
{/snippet}

<div class="overflow-hidden rounded-xl border">
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head class="w-6" />
				<Table.Head class="w-20 px-2">Label</Table.Head>
				{#if !banded}
					<Table.Head class="w-16 px-2">Question</Table.Head>
				{/if}
				<Table.Head class="w-16 px-2">Marks</Table.Head>
				<Table.Head class="px-2">Summary</Table.Head>
				<Table.Head class="w-32 px-2">Spec point</Table.Head>
				<Table.Head class="w-32 px-2">Command word</Table.Head>
				<Table.Head class="w-20 px-2">AO</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#if banded}
				{#each bands as band (`${band.questionNumber}::${band.entries[0].id}`)}
					<Table.Row data-testid="band-row" class="bg-muted/30 hover:bg-muted/30">
						<Table.Cell />
						<Table.Cell colspan={6} class="py-1.5 text-xs">
							<span class="font-semibold">Question</span>
							<input
								aria-label={`Question number for band ${band.questionNumber === '' ? '(none)' : band.questionNumber}`}
								class={bandNumber}
								value={band.questionNumber}
								onchange={(event) =>
									store.setBandQuestionNumber(
										band.entries.map((entry) => entry.id),
										event.currentTarget.value
									)}
							/>
							<span class="text-muted-foreground">
								· {bandSummary(band)} · {totalMarks(band.entries)} marks
							</span>
						</Table.Cell>
					</Table.Row>
					{#each band.entries as entry (entry.id)}
						{@render entryRow(entry, false)}
					{/each}
				{/each}
			{:else}
				{#each entries as entry (entry.id)}
					{@render entryRow(entry, true)}
				{/each}
			{/if}
		</Table.Body>
	</Table.Root>
</div>
