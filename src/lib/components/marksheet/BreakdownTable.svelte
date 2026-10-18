<!--
	The breakdown as an editable document: one row per entry, grouped under its
	question when banding is on. Every field is editable in place, so a mistake
	the model made is fixed here rather than by paying for another parse — and
	the structure can be repaired too, by adding a row the parse missed, taking
	one out, or moving one to where the paper has it.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Popover from '$lib/components/ui/popover';
	import * as Table from '$lib/components/ui/table';
	import {
		bandName,
		entryEdits,
		entryName,
		isUndivided,
		warningsForEntry,
		type EntryEdits,
		type QuestionBand
	} from '$lib/marksheet/breakdown.js';
	import type { BreakdownEntry, EditableField } from '$lib/marksheet/document.js';
	import { isWholeNumber, totalMarks } from '$lib/marksheet/document.js';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import {
		assessmentObjectiveOf,
		ASSESSMENT_OBJECTIVES
	} from '$lib/parse/assessment-objectives.js';
	import { cn } from '$lib/utils.js';
	import { agree, count } from '$lib/prose.js';

	let { banded = true }: { banded?: boolean } = $props();

	const store = marksheetStore();
	const entries = $derived(store.entries);
	const bands = $derived(store.questionBands);
	const warnings = $derived(store.warnings);
	const undoable = $derived(store.undoable);
	/**
	 * The entry whose marks field the cursor is in. It is left out of the warning
	 * below while it is being typed in: a total is saved keystroke by keystroke,
	 * so a raise typed digit by digit would flash a warning on its way up.
	 */
	let editingMarks = $state<string | null>(null);
	/**
	 * Entries carrying marks above the available marks they now offer, and how
	 * many: what lowering an entry's available marks leaves behind, and what no
	 * figure counts until it is raised back or the mark is corrected. Nothing is
	 * clamped, so the marks stay exactly as they were entered and the teacher is
	 * told rather than have them rewritten.
	 */
	const overMax = $derived(
		entries
			.filter((entry) => entry.id !== editingMarks)
			.map((entry) => ({ entry, above: store.marksOverMax(entry.id) }))
			.filter((row) => row.above > 0)
	);
	/**
	 * The entry whose deletion is waiting on the teacher's yes. Deleting an entry
	 * takes its marks with it, so the number is said before the click lands rather
	 * than left to the one-level undo.
	 */
	let pendingDelete = $state<BreakdownEntry | null>(null);
	const pendingLoss = $derived(pendingDelete === null ? 0 : store.marksOnEntry(pendingDelete.id));

	/** A cell reads as plain text until hovered or focused: no box, no background. */
	const plain =
		'rounded-sm border border-transparent bg-transparent hover:border-border focus:border-ring focus:outline-none';
	const cell = `w-full px-1.5 py-1 ${plain} focus:bg-background`;
	const bandNumber = `ml-1 w-14 px-1 font-semibold ${plain}`;
	/** What the teacher has changed: the field itself, and the row that carries it. */
	const changedCell = 'text-sky-700 dark:text-sky-300';
	const changedChip = `border-transparent bg-sky-500/15 ${changedCell}`;
	/**
	 * Row actions stay out of the way until the row is hovered or focused — and
	 * are simply there where there is no hover to give, as on a touch screen.
	 */
	const rowActions =
		'flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100';
	/** What the teacher calls each field, as the table's own headings name it. */
	const FIELD_NAMES: Record<EditableField, string> = {
		label: 'Label',
		questionNumber: 'Question',
		marks: 'Marks',
		summary: 'Summary',
		specPoint: 'Spec point',
		commandWord: 'Command word',
		ao: 'AO'
	};

	/** A field's classes: what every cell has, plus whatever is special about this one. */
	function fieldClass(
		edits: EntryEdits,
		field: EditableField,
		...extra: (string | false)[]
	): string {
		return cn(cell, ...extra, edits.fields.includes(field) && changedCell);
	}

	/** What is different about the row, in the teacher's words rather than the document's. */
	function editedTitle(edits: EntryEdits): string {
		return `Edited: ${edits.fields.map((field) => FIELD_NAMES[field]).join(', ')}`;
	}

	/** Add a row and put the cursor in its label, so it can be named straight away. */
	async function addRow(add: () => string | null): Promise<void> {
		const id = add();
		if (id === null) return;
		await tick();
		document.querySelector<HTMLElement>(`[data-entry="${id}"] [data-field="label"]`)?.focus();
	}

	/**
	 * Enter a mark as it is typed. Only digits are a mark: anything else — a
	 * decimal, a letter — is refused, leaving the entry as it was, which the cell
	 * shows again once the teacher leaves it.
	 */
	function onMarksInput(entry: BreakdownEntry, event: Event): void {
		const typed = (event.currentTarget as HTMLInputElement).value.trim();
		if (typed === '') store.setEntryMarks(entry.id, null);
		else if (isWholeNumber(typed)) store.setEntryMarks(entry.id, Number(typed));
	}

	/** Show what the entry actually holds: a refused mark disappears as it is left. */
	function onMarksChange(entry: BreakdownEntry, event: Event): void {
		(event.currentTarget as HTMLInputElement).value =
			entry.marks === null ? '' : String(entry.marks);
	}

	/**
	 * Delete an entry, or ask first when it has marks: the number goes in the
	 * question, since those marks cannot be read again once the entry is gone.
	 */
	function askDelete(entry: BreakdownEntry): void {
		if (store.marksOnEntry(entry.id) === 0) {
			store.deleteEntry(entry.id);
			return;
		}
		pendingDelete = entry;
	}

	/** The teacher's yes: the entry and its marks go, with the undo beside the table. */
	function confirmDelete(): void {
		const entry = pendingDelete;
		pendingDelete = null;
		if (entry !== null) store.deleteEntry(entry.id);
	}

	/** What the band is: a whole question, subquestions of one, or a row to number. */
	function bandSummary(band: QuestionBand): string {
		if (band.questionNumber === '') return 'needs a question number';
		if (isUndivided(band)) return 'undivided';
		return count(band.entries.length, 'subquestion');
	}
</script>

{#snippet rowActionsCell(entry: BreakdownEntry, place: number)}
	<Table.Cell class="w-28 pr-2">
		<span class={rowActions}>
			<Button
				variant="ghost"
				size="icon-xs"
				disabled={place === 0}
				aria-label={`Move ${entryName(entry)} up`}
				onclick={() => store.moveEntry(entry.id, -1)}
			>
				<ArrowUpIcon class="size-3.5" />
			</Button>
			<Button
				variant="ghost"
				size="icon-xs"
				disabled={place === entries.length - 1}
				aria-label={`Move ${entryName(entry)} down`}
				onclick={() => store.moveEntry(entry.id, 1)}
			>
				<ArrowDownIcon class="size-3.5" />
			</Button>
			<Button
				variant="ghost"
				size="icon-xs"
				aria-label={`Insert a row below ${entryName(entry)}`}
				onclick={() => addRow(() => store.insertEntryAfter(entry.id))}
			>
				<PlusIcon class="size-3.5" />
			</Button>
			<Button
				variant="ghost"
				size="icon-xs"
				class="text-destructive"
				aria-label={`Delete ${entryName(entry)}`}
				onclick={() => askDelete(entry)}
			>
				<Trash2Icon class="size-3.5" />
			</Button>
		</span>
	</Table.Cell>
{/snippet}

{#snippet entryRow(entry: BreakdownEntry, showQuestion: boolean)}
	{@const own = warningsForEntry(warnings, entry.id)}
	{@const edits = entryEdits(entry)}
	{@const place = entries.indexOf(entry)}
	<Table.Row class="group" data-entry={entry.id}>
		<Table.Cell class="w-20 pl-2">
			<span class="flex items-center gap-1">
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
				{#if edits.added}
					<Badge variant="secondary" class={changedChip} title="Added by you">new</Badge>
				{:else if edits.fields.length > 0}
					<Badge variant="secondary" class={changedChip} title={editedTitle(edits)}>edited</Badge>
				{/if}
			</span>
		</Table.Cell>
		<Table.Cell class="w-20 px-1">
			<input
				data-field="label"
				aria-label={`Label for ${entryName(entry)}`}
				class={fieldClass(edits, 'label', 'font-medium')}
				value={entry.label}
				oninput={(event) => store.setEntryLabel(entry.id, event.currentTarget.value)}
			/>
		</Table.Cell>
		{#if showQuestion}
			<Table.Cell class="w-16 px-1">
				<input
					data-field="questionNumber"
					aria-label={`Question number for ${entryName(entry)}`}
					class={fieldClass(edits, 'questionNumber')}
					value={entry.questionNumber}
					onchange={(event) => store.setBandQuestionNumber([entry.id], event.currentTarget.value)}
				/>
			</Table.Cell>
		{/if}
		<Table.Cell class="w-16 px-1">
			<input
				data-field="marks"
				aria-label={`Marks for ${entryName(entry)}`}
				class={fieldClass(
					edits,
					'marks',
					'text-right tabular-nums',
					entry.marks === null && 'border-destructive/60 bg-destructive/10 text-destructive'
				)}
				inputmode="numeric"
				placeholder="?"
				value={entry.marks ?? ''}
				oninput={(event) => onMarksInput(entry, event)}
				onchange={(event) => onMarksChange(entry, event)}
				onfocus={() => (editingMarks = entry.id)}
				onblur={() => (editingMarks = null)}
			/>
		</Table.Cell>
		<Table.Cell class="px-1">
			<input
				data-field="summary"
				aria-label={`Summary for ${entryName(entry)}`}
				class={fieldClass(edits, 'summary')}
				placeholder="What the question asks"
				value={entry.summary}
				oninput={(event) => store.setEntrySummary(entry.id, event.currentTarget.value)}
			/>
		</Table.Cell>
		<Table.Cell class="px-1">
			<input
				data-field="specPoint"
				aria-label={`Spec point for ${entryName(entry)}`}
				class={fieldClass(edits, 'specPoint', 'font-mono text-xs')}
				placeholder="—"
				value={entry.specPoint ?? ''}
				oninput={(event) => store.setEntrySpecPoint(entry.id, event.currentTarget.value)}
			/>
		</Table.Cell>
		<Table.Cell class="px-1">
			<input
				data-field="commandWord"
				aria-label={`Command word for ${entryName(entry)}`}
				class={fieldClass(edits, 'commandWord')}
				placeholder="—"
				value={entry.commandWord ?? ''}
				oninput={(event) => store.setEntryCommandWord(entry.id, event.currentTarget.value)}
			/>
		</Table.Cell>
		<Table.Cell class="w-20 px-1">
			<select
				data-field="ao"
				aria-label={`Assessment objective for ${entryName(entry)}`}
				class={fieldClass(edits, 'ao', entry.ao === null && 'text-muted-foreground')}
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
		{@render rowActionsCell(entry, place)}
	</Table.Row>
{/snippet}

{#if undoable?.kind === 'entry-removal'}
	<!-- Sticky: a row deleted 30 rows down must still offer its undo where the
	     teacher is looking, and it stays until the next change clears it. -->
	<Alert
		class="sticky top-2 z-10 flex flex-row items-center gap-2 py-2 shadow-sm"
		data-testid="undo"
	>
		<AlertDescription>
			Deleted <strong>{undoable.name}</strong>.
		</AlertDescription>
		<Button variant="outline" size="xs" onclick={() => store.undo()}>Undo</Button>
	</Alert>
{/if}

{#if overMax.length > 0}
	<!-- A standing fact about the sheet rather than a report of one keystroke: an
	     entry's available marks were lowered under marks already entered, and no
	     figure counts those marks until one of the two is corrected. It clears
	     itself the moment there is nothing above. -->
	<Alert variant="destructive" data-testid="over-max-marks">
		<AlertTitle>Marks above the available marks</AlertTitle>
		<AlertDescription>
			<ul class="list-disc space-y-0.5 pl-4">
				{#each overMax as row (row.entry.id)}
					<li>
						{count(row.above, 'mark')} entered on
						<strong>{entryName(row.entry)}</strong>
						{agree(row.above, 'is', 'are')} above its {count(
							row.entry.marks ?? 0,
							'available mark'
						)}.
					</li>
				{/each}
			</ul>
			<p class="mt-1">
				They are kept exactly as they were entered — nothing is clamped — and no figure counts them
				until the entry's available marks are raised or the mark is corrected.
			</p>
		</AlertDescription>
	</Alert>
{/if}

<div class="overflow-hidden rounded-xl border">
	<Table.Root class="table-fixed">
		<Table.Header>
			<Table.Row>
				<Table.Head class="w-20" />
				<Table.Head class="w-20 px-2 whitespace-normal">{FIELD_NAMES.label}</Table.Head>
				{#if !banded}
					<Table.Head class="w-16 px-2 whitespace-normal">{FIELD_NAMES.questionNumber}</Table.Head>
				{/if}
				<Table.Head class="w-16 px-2 whitespace-normal">{FIELD_NAMES.marks}</Table.Head>
				<Table.Head class="px-2 whitespace-normal">{FIELD_NAMES.summary}</Table.Head>
				<Table.Head class="px-2 whitespace-normal">{FIELD_NAMES.specPoint}</Table.Head>
				<Table.Head class="px-2 whitespace-normal">{FIELD_NAMES.commandWord}</Table.Head>
				<Table.Head class="w-20 px-2 whitespace-normal">{FIELD_NAMES.ao}</Table.Head>
				<Table.Head class="w-28 px-2"></Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#if banded}
				{#each bands as band (band.entries[0].id)}
					<Table.Row data-testid="band-row" class="bg-muted/30 hover:bg-muted/30">
						<Table.Cell />
						<Table.Cell colspan={6} class="py-1.5 text-xs">
							<span class="font-semibold">Question</span>
							<input
								aria-label={`Question number for band ${bandName(band)}`}
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
						<Table.Cell class="pr-2">
							<Button
								variant="ghost"
								size="xs"
								class="text-muted-foreground"
								aria-label={`Add subquestion to question ${bandName(band)}`}
								onclick={() => {
									const last = band.entries.at(-1);
									if (last) void addRow(() => store.insertEntryAfter(last.id));
								}}
							>
								<PlusIcon class="size-3" /> subquestion
							</Button>
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

<Button variant="outline" size="sm" onclick={() => addRow(() => store.appendEntry())}>
	<PlusIcon class="size-4" /> Add entry at end
</Button>

{#if pendingDelete !== null}
	<!-- Opened only over an entry that has marks: deleting it takes them, so the
	     number is said before the click lands rather than left to the undo. -->
	<Dialog.Root
		open
		onOpenChange={(isOpen) => {
			if (!isOpen) pendingDelete = null;
		}}
	>
		<Dialog.Content>
			<Dialog.Header>
				<Dialog.Title>Delete {entryName(pendingDelete)}?</Dialog.Title>
				<Dialog.Description data-testid="delete-loss">
					{count(pendingLoss, 'mark')}
					{agree(pendingLoss, 'is', 'are')} entered against it, and every one goes with the entry. The
					undo beside the table puts the entry, and its marks, back.
				</Dialog.Description>
			</Dialog.Header>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (pendingDelete = null)}>Keep the entry</Button>
				<Button variant="destructive" onclick={confirmDelete}>
					Delete {entryName(pendingDelete)} and {count(pendingLoss, 'mark')}
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
{/if}
