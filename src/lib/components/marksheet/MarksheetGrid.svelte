<!--
	The marksheet: the class down the side, the confirmed breakdown across the
	top, banded under its questions. Before a mark is entered this is the shape
	of the sheet — one column per breakdown entry, one row per student — with the
	class itself as editable here as the breakdown was on the review page: names
	pasted in a column, added one at a time, renamed in place, flagged absent or
	removed, and the lot reordered by either name part. On a two-tier assessment
	the grid shows the open tier's paper and that tier's students; the students
	still to be placed get a list instead of columns.
-->
<script lang="ts">
	import { flushSync } from 'svelte';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import { caretAtEnd } from '$lib/attachments.js';
	import { entryName, type QuestionBand } from '$lib/marksheet/breakdown.js';
	import {
		isOverMax,
		otherTier,
		readMarkText,
		type BreakdownEntry,
		type StoredStudent,
		type TierIndex
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
	import TierNotSet from './TierNotSet.svelte';
	import {
		CELL_EDITOR,
		CELL_REVEAL,
		COLUMN,
		FROZEN_PROGRESS,
		NAME_COLUMN,
		PROGRESS_PIN,
		selectedCell
	} from './grid-layout.js';
	import { tierLabel } from './tier-label.js';

	let {
		tier,
		onViewAnalysis
	}: {
		/** The open tier, or null while the teacher is placing students. */
		tier: TierIndex | null;
		onViewAnalysis: (entryId: string | null) => void;
	} = $props();

	/** The open mark editor: the cell it is on, and what has been typed into it. */
	interface MarkEditor {
		studentId: string;
		entryId: string;
		value: string;
	}

	/** Everything about the grid that belongs to one paper rather than the document. */
	interface SheetState {
		/** Where the cursor is: a mark cell, or a row's name cell when `entryId` is null. */
		cursor: GridCell | null;
		editing: MarkEditor | null;
		/**
		 * Why the last keystroke did not become a mark, shown beside the grid rather
		 * than floating over it: a teacher mid-entry is looking at the cell, and a
		 * message that covers a control is one they have to dismiss to keep working.
		 */
		refusal: string | null;
		/** The add-student row: whether it is open, and what has been typed into it. */
		adding: boolean;
		newName: string;
	}

	const store = marksheetStore();
	const document = $derived(store.document);
	const tiered = $derived(store.tierCount === 2);
	const entries = $derived(tier === null ? [] : store.entriesOf(tier));
	const students = $derived(tier === null ? store.studentsWithoutTier() : store.studentsOf(tier));
	const bands = $derived<QuestionBand[]>(tier === null ? [] : store.bandsOf(tier));
	const marks = $derived(store.document?.marks ?? {});
	/** The open tier's parse findings: the ones its columns are flagged from. */
	const warnings = $derived(tier === null ? [] : store.warningsOf(tier));
	/** Grade columns beside the marks: total always, grade and to-next only with boundaries. */
	const hasGrades = $derived(
		document !== null && tier !== null && boundariesOf(document, tier) !== null
	);
	const graded = $derived.by(() => {
		if (!document) return new Map<string, ReturnType<typeof studentGrade>>();
		return new Map(students.map((student) => [student.id, studentGrade(document, student)]));
	});

	/**
	 * The grid's view state, remade when the open tier changes: a cursor, an open
	 * editor, a refusal or a half-typed name from another paper means nothing on
	 * this one.
	 */
	const sheet = $derived.by(() => {
		void tier;
		const state = $state<SheetState>({
			cursor: null,
			editing: null,
			refusal: null,
			adding: false,
			newName: ''
		});
		return state;
	});
	/** The grid's own element, so a cell is looked for only where it can be. */
	let gridRoot: HTMLDivElement | undefined;

	function attachGridRoot(node: HTMLDivElement): void {
		gridRoot = node;
	}

	const shape = $derived({
		studentIds: students.map((student) => student.id),
		entryIds: entries.map((entry) => entry.id)
	});
	/** The cell a keystroke would land on: the cursor while its row and column exist, else the first cell. */
	const activeCell = $derived(resolveCell(sheet.cursor, shape));

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
		sheet.cursor = { studentId, entryId };
	}

	/** Move to a cell and take the keyboard with it. */
	function moveTo(cell: GridCell | null): void {
		if (!cell) return;
		clearRefusal();
		sheet.cursor = cell;
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
		sheet.cursor = { studentId: student.id, entryId: entry.id };
		sheet.editing = { studentId: student.id, entryId: entry.id, value };
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
		const open = sheet.editing;
		sheet.editing = null;
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
		sheet.refusal = null;
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
		const open = sheet.editing?.studentId === student.id && sheet.editing.entryId === entry.id;

		if (key === 'Escape') {
			if (!open) return;
			event.preventDefault();
			sheet.editing = null;
			focusCell(student.id, entry.id);
			return;
		}

		if (key === 'Enter' || key === 'Tab') {
			event.preventDefault();
			sheet.refusal = commitMarkEdit();
			// A refused cell is left where it is, with the keyboard still on it, so
			// the message beside the grid is about the cell in front of the teacher.
			if (sheet.refusal) {
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
		if (!sheet.editing) return;
		sheet.refusal = commitMarkEdit();
	}

	/**
	 * Take a block from the clipboard and put it down at the cursor. A paste lands
	 * on the focused cell and bubbles here; `text/html` wins over `text/plain` so
	 * cells holding line breaks keep their rows aligned.
	 */
	function onPaste(event: ClipboardEvent): void {
		const anchor = activeCell;
		if (!anchor || tier === null) return;

		// A name field has its own paste: that text is a name, not a grid.
		const target = event.target instanceof Element ? event.target : null;
		if (target?.closest('[data-rename-field], [data-testid="new-student-name"]')) return;

		const rows = clipboardGrid(event.clipboardData);
		if (rows.length === 0) return;
		event.preventDefault();

		// An open mark editor commits first, so the block lands on the sheet the
		// teacher can see rather than over a value still being typed.
		if (sheet.editing) {
			const refused = commitMarkEdit();
			if (refused) {
				sheet.refusal = refused;
				return;
			}
		}

		clearRefusal();
		store.pasteMarks(
			rows,
			anchor.entryId === null
				? { kind: 'names', studentId: anchor.studentId }
				: { kind: 'marks', studentId: anchor.studentId, entryId: anchor.entryId },
			tier
		);
	}

	/** Clicking a band moves the cursor to its first column, on the row it is on. */
	function jumpToBand(band: QuestionBand): void {
		const studentId = activeCell?.studentId;
		const first = band.entries[0];
		if (!studentId || !first) return;
		moveTo({ studentId, entryId: first.id });
	}

	function startAdding(): void {
		sheet.adding = true;
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
		const name = readName(sheet.newName);
		if (!name) {
			discardNewStudent();
			return;
		}
		// On one tier there is nowhere else to put them; on two, a name typed on a
		// tier tab joins that tier, so the row they typed stays where they are.
		if (tier === null || store.tierCount === 1) store.addStudent(name);
		else store.pasteNames(sheet.newName, tier);
		sheet.newName = '';
	}

	function discardNewStudent(): void {
		sheet.newName = '';
		sheet.adding = false;
	}

	/** Move a student to the other tier: the marks they leave behind are kept, uncounted. */
	function moveStudent(student: StoredStudent): void {
		const from = student.tier;
		if (from === null) return;
		const to: TierIndex = otherTier(from);
		if (!store.setStudentTier(student.id, to)) return;
		toast(`${studentName(student)} moved to ${tierLabel(document, to)}`, {
			description: 'Their marks on the tier they left are kept, not counted.'
		});
	}
</script>

{#snippet addStudentControl()}
	{#if sheet.adding}
		<input
			data-testid="new-student-name"
			{@attach caretAtEnd}
			aria-label="New student name"
			class={cn(CELL_EDITOR, 'w-full')}
			placeholder="First name Surname"
			value={sheet.newName}
			oninput={(event) => (sheet.newName = event.currentTarget.value)}
			onkeydown={onAddKeydown}
			onblur={() => {
				if (sheet.newName.trim() === '') sheet.adding = false;
			}}
		/>
	{:else}
		<Button variant="ghost" size="xs" onclick={startAdding}>
			<UserPlusIcon class="size-3.5" /> Add student
		</Button>
	{/if}
{/snippet}

<GridNotices refusal={sheet.refusal} />

<GridToolbar {tier} {onViewAnalysis} />

{#if tier === null && store.students.length === 0}
	<EmptyClassPanel {tier} onAddOne={startAdding} />
	{#if sheet.adding}
		<div class="max-w-xl">{@render addStudentControl()}</div>
	{/if}
{:else if tier === null}
	<TierNotSet />
	<div class="w-fit">{@render addStudentControl()}</div>
{:else}
	{#if store.students.length === 0}
		<EmptyClassPanel {tier} onAddOne={startAdding} />
	{/if}
	<div
		class="relative overflow-hidden rounded-xl border"
		onpaste={onPaste}
		{@attach attachGridRoot}
	>
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
				{#if bands.length > 0}
					<BandHeaderRow
						{bands}
						{warnings}
						cursorEntryId={sheet.cursor?.entryId ?? null}
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
						<EntryColumnHead {entry} active={sheet.cursor?.entryId === entry.id} />
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
							activeCell?.studentId === student.id && 'bg-muted/50 hover:bg-muted/50',
							student.absent && 'text-muted-foreground'
						)}
					>
						<NameCell
							{student}
							active={isActiveCell(student.id, null)}
							onSelect={() => selectCell(student.id, null)}
							onMove={(move) => moveTo(activeCell && step(activeCell, shape, move))}
							onMoveTier={tiered ? () => moveStudent(student) : undefined}
							moveLabel={tiered ? tierLabel(document, otherTier(tier)) : undefined}
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
								{#if sheet.editing?.studentId === student.id && sheet.editing.entryId === entry.id}
									<input
										data-testid="mark-editor"
										{@attach caretAtEnd}
										aria-label={`Mark for ${name} on ${entryName(entry)}`}
										inputmode="numeric"
										class="m-0 block w-full min-w-0 appearance-none rounded-none border-0 bg-transparent p-0 text-center tabular-nums shadow-none outline-none ring-0"
										value={sheet.editing.value}
										oninput={(event) => {
											if (sheet.editing) sheet.editing.value = event.currentTarget.value;
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
				{:else}
					{#if tiered && store.students.length > 0}
						<Table.Row role="row" class="hover:bg-transparent">
							<Table.Cell
								role="gridcell"
								colspan={entries.length + (hasGrades ? 5 : 3)}
								class="px-3 py-6 text-sm text-muted-foreground"
							>
								{#if store.studentsWithoutTier().length > 0}
									No students on {tierLabel(document, tier)} yet. Set tiers on the Tier not set tab.
								{:else}
									No students on {tierLabel(document, tier)} yet. Move a student here from
									{tierLabel(document, otherTier(tier))} with the ⇄ button.
								{/if}
							</Table.Cell>
						</Table.Row>
					{/if}
				{/each}
				<Table.Row role="row" class="hover:bg-transparent">
					<Table.Cell role="gridcell" class={cn(NAME_COLUMN, 'p-1')}>
						{@render addStudentControl()}
					</Table.Cell>
					<Table.Cell colspan={entries.length + (hasGrades ? 3 : 1)} role="gridcell" />
				</Table.Row>
			</Table.Body>
			<FacilityFooter {tier} {onViewAnalysis} />
		</Table.Root>
	</div>
{/if}
