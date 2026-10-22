<!--
	The marksheet: the class down the side, the confirmed breakdown across the
	top, banded under its questions. Before a mark is entered this is the shape
	of the sheet — one column per breakdown entry, one row per student — with the
	class itself as editable here as the breakdown was on the review page: names
	pasted in a column, added one at a time, renamed in place, flagged absent or
	removed, and the lot reordered by either name part.
-->
<script lang="ts">
	import { flushSync } from 'svelte';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import { caretAtEnd } from '$lib/attachments.js';
	import { entryName, type QuestionBand } from '$lib/marksheet/breakdown.js';
	import {
		isOverMax,
		readMarkText,
		type BreakdownEntry,
		type StoredStudent
	} from '$lib/marksheet/document.js';
	import { boundariesOf, studentGrade, toNextText } from '$lib/marksheet/grades.js';
	import { resolveCell, step, type GridCell } from '$lib/marksheet/grid-cursor.js';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import { clipboardGrid } from '$lib/marksheet/paste.js';
	import { progressOf, readName, studentName } from '$lib/marksheet/students.js';
	import { cn } from '$lib/utils.js';
	import BandHeaderRow from './BandHeaderRow.svelte';
	import EmptyClassPanel from './EmptyClassPanel.svelte';
	import EntryColumnHead from './EntryColumnHead.svelte';
	import FacilityFooter from './FacilityFooter.svelte';
	import GridNotices from './GridNotices.svelte';
	import GridToolbar from './GridToolbar.svelte';
	import NameCell from './NameCell.svelte';
	import {
		CELL_EDITOR,
		CELL_REVEAL,
		COLUMN,
		FROZEN_PROGRESS,
		NAME_COLUMN,
		PROGRESS_PIN,
		selectedCell
	} from './grid-layout.js';

	let { onViewAnalysis }: { onViewAnalysis: (entryId: string | null) => void } = $props();

	const store = marksheetStore();
	const entries = $derived(store.entries);
	const students = $derived(store.students);
	const marks = $derived(store.document?.marks ?? {});
	/** Grade columns beside the marks: total always, grade and to-next only with boundaries. */
	const hasGrades = $derived(store.document ? boundariesOf(store.document) !== null : false);
	const graded = $derived.by(() => {
		const document = store.document;
		if (!document) return new Map<string, ReturnType<typeof studentGrade>>();
		return new Map(students.map((student) => [student.id, studentGrade(document, student)]));
	});

	/** Where the cursor is: a mark cell, or a row's name cell when `entryId` is null. */
	let cursor = $state<GridCell | null>(null);
	/** The open mark editor: the cell it is on, and what has been typed into it. */
	let editing = $state<{ studentId: string; entryId: string; value: string } | null>(null);
	/**
	 * Why the last keystroke did not become a mark, shown beside the grid rather
	 * than floating over it: a teacher mid-entry is looking at the cell, and a
	 * message that covers a control is one they have to dismiss to keep working.
	 */
	let refusal = $state<string | null>(null);
	/** The add-student row: whether it is open, and what has been typed into it. */
	let adding = $state(false);
	let newName = $state('');
	/** The grid's own element, so a cell is looked for only where it can be. */
	let gridRoot = $state<HTMLDivElement>();

	const shape = $derived({
		studentIds: students.map((student) => student.id),
		entryIds: entries.map((entry) => entry.id)
	});
	/** The cell a keystroke would land on: the cursor while its row and column exist, else the first cell. */
	const activeCell = $derived(resolveCell(cursor, shape));

	function isActiveCell(studentId: string, entryId: string | null): boolean {
		return activeCell?.studentId === studentId && activeCell.entryId === entryId;
	}

	/** Where a cell is — a mark cell, or a row's name cell when `entryId` is null. */
	function cellSelector(studentId: string, entryId: string | null): string {
		return entryId === null
			? `[data-testid="name-cell"][data-student-id="${studentId}"]`
			: `[data-testid="mark-cell"][data-student-id="${studentId}"][data-entry-id="${entryId}"]`;
	}

	/** Put the keyboard on a cell, whether or not it was in view. */
	function focusCell(studentId: string, entryId: string | null): void {
		const cell = gridRoot?.querySelector<HTMLElement>(cellSelector(studentId, entryId));
		if (!cell) return;
		cell.focus({ preventScroll: true });
		cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}

	/** Put the cursor in a cell. The name column is a cell of the grid too. */
	function selectCell(studentId: string, entryId: string | null): void {
		// A click is not a reason to clear the message: it can be the very click
		// that left a refused cell, and the refusal was raised as the cell was left.
		cursor = { studentId, entryId };
	}

	/** Move to a cell and take the keyboard with it. */
	function moveTo(cell: GridCell | null): void {
		if (!cell) return;
		clearRefusal();
		cursor = cell;
		focusCell(cell.studentId, cell.entryId);
	}

	/** What a mark cell shows: a mark that is there, and nothing where there is none. */
	function markOf(student: StoredStudent, entry: BreakdownEntry): number | undefined {
		return marks[student.id]?.[entry.id];
	}

	/**
	 * Open a cell's editor holding `value`, with the caret after it. The editor is
	 * in the DOM and has the caret before this returns: a teacher typing at speed
	 * sends the next keystroke in the same turn, and it has to land in the editor
	 * rather than be read as another start.
	 */
	function startMarkEdit(student: StoredStudent, entry: BreakdownEntry, value: string): void {
		clearRefusal();
		cursor = { studentId: student.id, entryId: entry.id };
		editing = { studentId: student.id, entryId: entry.id, value };
		flushSync();
	}

	/** Open a cell's editor on the mark it already holds: what F2 and a double-click do. */
	function editMark(student: StoredStudent, entry: BreakdownEntry): void {
		startMarkEdit(student, entry, String(markOf(student, entry) ?? ''));
	}

	/**
	 * Take what the open editor holds: a whole number becomes the mark, an empty
	 * editor goes back to unmarked, and anything else is refused and leaves the cell
	 * as it was — so `2.000` never becomes 2. Returns what to tell the teacher
	 * about a refusal, or null when there was nothing to refuse.
	 */
	function commitMarkEdit(): string | null {
		const open = editing;
		editing = null;
		if (!open) return null;

		const read = readMarkText(open.value);
		if (read.kind === 'refused') {
			return `“${open.value}” was not stored: a mark is a whole number, or empty for a cell with no mark.`;
		}
		if (read.kind === 'clear') store.clearMark(open.studentId, open.entryId);
		else store.setMark(open.studentId, open.entryId, read.mark);
		return null;
	}

	/** A refusal belongs to the cell it happened on: moving or editing again drops it. */
	function clearRefusal(): void {
		refusal = null;
	}

	/** Whether a key event came from a cell's own editor rather than the cell. */
	function isMarkEditor(target: EventTarget | null): boolean {
		return target instanceof HTMLElement && target.dataset.testid === 'mark-editor';
	}

	/**
	 * The grid's keys, handled wherever a keystroke lands in a mark cell — on the
	 * cell itself, or in the editor once it is open — so a key never depends on
	 * which of the two the browser has focused yet.
	 */
	function onMarkKeydown(
		student: StoredStudent,
		entry: BreakdownEntry,
		event: KeyboardEvent
	): void {
		if (event.target !== event.currentTarget && !isMarkEditor(event.target)) return;

		const key = event.key;
		const open = editing?.studentId === student.id && editing.entryId === entry.id;

		if (key === 'Escape') {
			if (!open) return;
			event.preventDefault();
			editing = null;
			focusCell(student.id, entry.id);
			return;
		}

		if (key === 'Enter' || key === 'Tab') {
			event.preventDefault();
			refusal = commitMarkEdit();
			// A refused cell is left where it is, with the keyboard still on it, so
			// the message beside the grid is about the cell in front of the teacher.
			if (refusal) {
				focusCell(student.id, entry.id);
				return;
			}
			moveTo(
				activeCell &&
					step(activeCell, shape, key === 'Enter' ? 'down' : event.shiftKey ? 'previous' : 'next')
			);
			return;
		}

		if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
			// An open editor's arrows belong to the caret; the keys move the cursor.
			if (open) return;
			event.preventDefault();
			const move = {
				ArrowUp: 'up',
				ArrowDown: 'down',
				ArrowLeft: 'left',
				ArrowRight: 'right'
			} as const;
			moveTo(activeCell && step(activeCell, shape, move[key]));
			return;
		}

		if (key === 'Delete' || key === 'Backspace') {
			// Backspace in an open editor is deleting a character.
			if (open) return;
			event.preventDefault();
			clearRefusal();
			store.clearMark(student.id, entry.id);
			return;
		}

		if (key === 'F2') {
			// An editor that is already open is where the teacher is typing.
			if (open) return;
			event.preventDefault();
			editMark(student, entry);
			return;
		}

		// A digit begins a mark, replacing whatever the cell holds. A keystroke
		// that landed in the editor itself is the input's to take, not the grid's.
		if (
			key.length === 1 &&
			/\d/.test(key) &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.altKey &&
			!isMarkEditor(event.target)
		) {
			event.preventDefault();
			startMarkEdit(student, entry, key);
		}
	}

	/** Leaving the cell — by clicking another one — keeps what the editor holds. */
	function onEditorFocusOut(): void {
		// Only an editor that is still open has anything to take: the focusout that
		// follows a commit the keyboard already made must not undo it.
		if (!editing) return;
		refusal = commitMarkEdit();
	}

	/**
	 * Take a block from the clipboard and put it down at the cursor. A paste lands
	 * on the focused cell and bubbles here; `text/html` wins over `text/plain` so
	 * cells holding line breaks keep their rows aligned.
	 */
	function onPaste(event: ClipboardEvent): void {
		const anchor = activeCell;
		if (!anchor) return;

		// A name field has its own paste: that text is a name, not a grid.
		const target = event.target instanceof Element ? event.target : null;
		if (target?.closest('[data-rename-field], [data-testid="new-student-name"]')) return;

		const rows = clipboardGrid(event.clipboardData);
		if (rows.length === 0) return;
		event.preventDefault();

		// An open mark editor commits first, so the block lands on the sheet the
		// teacher can see rather than over a value still being typed.
		if (editing) {
			const refused = commitMarkEdit();
			if (refused) {
				refusal = refused;
				return;
			}
		}

		clearRefusal();
		store.pasteMarks(
			rows,
			anchor.entryId === null
				? { kind: 'names', studentId: anchor.studentId }
				: { kind: 'marks', studentId: anchor.studentId, entryId: anchor.entryId }
		);
	}

	/** Clicking a band moves the cursor to its first column, on the row it is on. */
	function jumpToBand(band: QuestionBand): void {
		const studentId = cursor?.studentId ?? students[0]?.id;
		const first = band.entries[0];
		if (!studentId || !first) return;
		moveTo({ studentId, entryId: first.id });
	}

	function startAdding(): void {
		adding = true;
	}

	/** Enter commits the name and opens the next; a blank Enter or Escape discards it. */
	function onAddKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			discardNewStudent();
			return;
		}
		if (event.key !== 'Enter') return;
		event.preventDefault();
		const name = readName(newName);
		if (!name) {
			discardNewStudent();
			return;
		}
		store.addStudent(name);
		newName = '';
	}

	function discardNewStudent(): void {
		newName = '';
		adding = false;
	}
</script>

<GridNotices {refusal} />

<GridToolbar {onViewAnalysis} />

{#if students.length === 0}
	<EmptyClassPanel onAddOne={startAdding} />
{/if}

<div class="relative overflow-hidden rounded-xl border" onpaste={onPaste} bind:this={gridRoot}>
	<Table.Root class="table-fixed w-fit" role="grid" aria-label="Marksheet grid">
		<!-- The widths every cell obeys: narrow entry columns, a frozen name and
		     progress column, so a paper scrolls sideways only when it must. -->
		<colgroup>
			<col style="width: {COLUMN.name}" />
			<col style="width: {COLUMN.progress}" />
			{#each entries as entry (entry.id)}
				<col style="width: {COLUMN.entry}" />
			{/each}
			<col style="width: 3rem" />
			{#if hasGrades}
				<col style="width: 3rem" />
				<col style="width: 5rem" />
			{/if}
		</colgroup>
		<Table.Header>
			{#if store.questionBands.length > 0}
				<BandHeaderRow
					cursorEntryId={cursor?.entryId ?? null}
					onJump={jumpToBand}
					endColumns={hasGrades ? 3 : 1}
				/>
			{/if}
			<Table.Row role="row" class="hover:bg-transparent">
				<Table.Head class={cn(NAME_COLUMN, 'px-1.5 text-left text-xs')}>Student</Table.Head>
				<Table.Head class={cn(FROZEN_PROGRESS, 'px-1 text-xs')} style={PROGRESS_PIN}
					>Progress</Table.Head
				>
				{#each entries as entry (entry.id)}
					<EntryColumnHead {entry} active={cursor?.entryId === entry.id} />
				{/each}
				<Table.Head class="border-l-2 px-1 text-center text-xs">Total</Table.Head>
				{#if hasGrades}
					<Table.Head class="px-1 text-center text-xs">Grade</Table.Head>
					<Table.Head class="px-1 text-center text-xs">To next</Table.Head>
				{/if}
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each students as student (student.id)}
				{@const name = studentName(student)}
				{@const progress = progressOf(marks[student.id], entries)}
				<Table.Row
					role="row"
					data-testid="student-row"
					data-student-id={student.id}
					class={cn(
						'group',
						cursor?.studentId === student.id && 'bg-muted/50 hover:bg-muted/50',
						student.absent && 'text-muted-foreground'
					)}
				>
					<NameCell
						{student}
						active={isActiveCell(student.id, null)}
						onSelect={() => selectCell(student.id, null)}
						onMove={(move) => moveTo(activeCell && step(activeCell, shape, move))}
					/>
					<Table.Cell
						data-testid="progress-cell"
						class={cn(
							FROZEN_PROGRESS,
							'px-1 text-center text-xs text-muted-foreground tabular-nums'
						)}
						style={PROGRESS_PIN}
					>
						{student.absent ? 'absent' : `${progress.marked}/${progress.total}`}
					</Table.Cell>
					{#each entries as entry (entry.id)}
						{@const mark = markOf(student, entry)}
						{@const overMax = mark !== undefined && isOverMax(mark, entry)}
						<Table.Cell
							role="gridcell"
							data-testid="mark-cell"
							data-student-id={student.id}
							data-entry-id={entry.id}
							tabindex={isActiveCell(student.id, entry.id) ? 0 : -1}
							aria-invalid={overMax ? 'true' : undefined}
							style={CELL_REVEAL}
							class={cn(
								'border-l px-0.5 py-1 text-center tabular-nums',
								// A mark above what the entry offers is kept and shown as the
								// typo it is, never clamped into a mark nobody gave.
								overMax && 'font-semibold text-destructive',
								isActiveCell(student.id, entry.id) && selectedCell,
								student.absent && 'bg-muted/40'
							)}
							onclick={() => selectCell(student.id, entry.id)}
							ondblclick={(event) => {
								// A double-click in an open editor selects what is in it.
								if ((event.target as Element).closest('input')) return;
								editMark(student, entry);
							}}
							onkeydown={(event) => onMarkKeydown(student, entry, event)}
						>
							{#if editing?.studentId === student.id && editing.entryId === entry.id}
								<input
									data-testid="mark-editor"
									{@attach caretAtEnd}
									aria-label={`Mark for ${name} on ${entryName(entry)}`}
									inputmode="numeric"
									class="m-0 block w-full min-w-0 appearance-none rounded-none border-0 bg-transparent p-0 text-center tabular-nums shadow-none outline-none ring-0"
									value={editing.value}
									oninput={(event) => {
										if (editing) editing.value = event.currentTarget.value;
									}}
									onfocusout={onEditorFocusOut}
								/>
							{:else}
								{mark ?? ''}
							{/if}
						</Table.Cell>
					{/each}
					{@const grade = graded.get(student.id)}
					<Table.Cell
						data-testid="total-cell"
						data-student-id={student.id}
						class={cn(
							'border-l-2 px-1 text-center tabular-nums',
							grade?.kind === 'partial' && 'text-muted-foreground italic'
						)}
					>
						{#if grade?.kind === 'complete' || grade?.kind === 'partial'}{grade.total}{/if}
					</Table.Cell>
					{#if hasGrades}
						<Table.Cell
							data-testid="grade-cell"
							data-student-id={student.id}
							class={cn(
								'px-1 text-center font-semibold',
								grade?.kind === 'partial' && 'font-normal text-muted-foreground italic'
							)}
							title={grade?.kind === 'partial' ? 'Provisional: not every mark is in' : undefined}
						>
							{#if (grade?.kind === 'complete' || grade?.kind === 'partial') && grade.grade}{grade
									.grade.label}{grade.kind === 'partial'
									? '*'
									: ''}{:else if grade?.kind === 'over-max'}<span class="text-destructive">!</span
								>{/if}
						</Table.Cell>
						<Table.Cell
							data-testid="to-next-cell"
							data-student-id={student.id}
							class={cn(
								'px-1 text-center text-xs tabular-nums',
								grade?.kind === 'partial' && 'text-muted-foreground italic'
							)}
						>
							{#if grade?.kind === 'partial' && grade.grade}so far{:else if (grade?.kind === 'complete' || grade?.kind === 'partial') && grade.grade}{toNextText(
									grade.grade
								)}{/if}
						</Table.Cell>
					{/if}
				</Table.Row>
			{/each}
			<Table.Row role="row" class="hover:bg-transparent">
				<Table.Cell role="gridcell" class={cn(NAME_COLUMN, 'p-1')}>
					{#if adding}
						<input
							data-testid="new-student-name"
							{@attach caretAtEnd}
							aria-label="New student name"
							class={cn(CELL_EDITOR, 'w-full')}
							placeholder="First name Surname"
							value={newName}
							oninput={(event) => (newName = event.currentTarget.value)}
							onkeydown={onAddKeydown}
							onblur={() => {
								if (newName.trim() === '') adding = false;
							}}
						/>
					{:else}
						<Button variant="ghost" size="xs" onclick={startAdding}>
							<UserPlusIcon class="size-3.5" /> Add student
						</Button>
					{/if}
				</Table.Cell>
				<Table.Cell colspan={entries.length + (hasGrades ? 3 : 1)} role="gridcell" />
			</Table.Row>
		</Table.Body>
		<FacilityFooter {onViewAnalysis} />
	</Table.Root>
</div>
