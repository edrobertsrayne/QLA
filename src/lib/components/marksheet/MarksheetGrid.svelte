<!--
	The marksheet: the class down the side, the confirmed breakdown across the
	top, banded under its questions. Before a mark is entered this is the shape
	of the sheet — one column per breakdown entry, one row per student — with the
	class itself as editable here as the breakdown was on the review page: names
	pasted in a column, added one at a time, renamed in place, flagged absent or
	removed, and the lot reordered by either name part.
-->
<script lang="ts">
	import { flushSync, tick } from 'svelte';
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import ClipboardPasteIcon from '@lucide/svelte/icons/clipboard-paste';
	import FileSpreadsheetIcon from '@lucide/svelte/icons/file-spreadsheet';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';
	import UserXIcon from '@lucide/svelte/icons/user-x';
	import XIcon from '@lucide/svelte/icons/x';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import * as Table from '$lib/components/ui/table';
	import { Textarea } from '$lib/components/ui/textarea';
	import EditBreakdownDialog from '$lib/components/marksheet/EditBreakdownDialog.svelte';
	import {
		facilityPercent,
		notScoredLabel,
		type EntryAnalysis,
		type RagBand
	} from '$lib/marksheet/analysis.js';
	import {
		bandName,
		entryName,
		fallbackBands,
		isFallbackBand,
		isWholeNumber,
		warningsForEntry,
		runWarnings,
		type QuestionBand
	} from '$lib/marksheet/breakdown.js';
	import type { BreakdownEntry, StoredStudent } from '$lib/marksheet/document.js';
	import { exportMarksNow, marksheetStore } from '$lib/marksheet/index.js';
	import { clipboardGrid, type PasteResult } from '$lib/marksheet/paste.js';
	import { MISSING_QUESTION_NUMBER } from '$lib/parse/parse-warnings.js';
	import {
		progressOf,
		splitName,
		studentName,
		type StudentSortKey
	} from '$lib/marksheet/students.js';
	import { cn } from '$lib/utils.js';

	let { onViewAnalysis }: { onViewAnalysis: (entryId: string | null) => void } = $props();

	const store = marksheetStore();
	const entries = $derived(store.document?.breakdown.entries ?? []);
	const students = $derived(store.document?.students ?? []);
	const marks = $derived(store.document?.marks ?? {});
	const warnings = $derived(store.document?.breakdown.warnings ?? []);
	const bands = $derived(store.questionBands);
	const fallbacks = $derived(fallbackBands(bands, warnings));
	const undoable = $derived(store.undoable);
	/** Every entry's facility and band, recomputed as the sheet changes. */
	const analysis = $derived(store.analysis);
	const hardest = $derived(analysis.hardest);
	/** What the last paste did, cleared by the change that clears the undo it offered. */
	const pasteNotice = $derived(store.pasteNotice);

	/** Where the cursor is: a mark cell, or a row's name cell when `entryId` is null. */
	let cursor = $state<{ studentId: string; entryId: string | null } | null>(null);
	/** The open mark editor: the cell it is on, and what has been typed into it. */
	let editing = $state<{ studentId: string; entryId: string; value: string } | null>(null);
	/**
	 * Why the last keystroke did not become a mark, shown beside the grid rather
	 * than floating over it: a teacher mid-entry is looking at the cell, and a
	 * message that covers a control is one they have to dismiss to keep working.
	 */
	let refusal = $state<string | null>(null);
	/** The hidden field the clipboard lands on, so a paste is read before it is used. */
	let pasteProxy = $state<HTMLDivElement | null>(null);
	/** The open rename: both name parts, and which one the caret belongs in. */
	let renaming = $state<{
		studentId: string;
		firstName: string;
		surname: string;
		focus: 'firstName' | 'surname';
		/** Opened by typing over the name: what is typed is the whole name, split on commit. */
		replace: boolean;
	} | null>(null);
	/** The add-student row: whether it is open, and what has been typed into it. */
	let adding = $state(false);
	let newName = $state('');
	/** A column of names waiting to become the class. */
	let pastedNames = $state('');

	/**
	 * The frozen columns and the entry columns: their widths live in one place,
	 * because the sticky cells and the band label pin themselves at offsets the
	 * widths decide.
	 */
	const COLUMN = { name: '10rem', progress: '4rem', entry: '2.5rem' };
	const NAME_COLUMN = 'sticky left-0 z-20 border-r bg-background';
	const FROZEN_PROGRESS = 'sticky z-20 border-r bg-background';
	/** Where the progress column pins itself: past the name column. */
	const PROGRESS_PIN = `left: ${COLUMN.name}`;
	/** The room the frozen columns take, measured from the table's left edge. */
	const FROZEN_WIDTH = `calc(${COLUMN.name} + ${COLUMN.progress})`;
	/** Where a band label pins itself: past both frozen columns. */
	const BAND_LABEL_PIN = `left: ${FROZEN_WIDTH}`;
	/**
	 * What a mark cell keeps clear of when it is scrolled into view: the frozen
	 * columns pin over the cells beside them, so without this a cell can sit
	 * inside the viewport and still be underneath the name and progress columns.
	 * `scrollIntoView` honours it, which is the whole of the rule.
	 */
	const CELL_REVEAL = `scroll-margin-inline-start: ${FROZEN_WIDTH}`;
	const selectedCell = 'ring-2 ring-primary ring-inset';
	/** A cell reads as the document until it is being edited. */
	const CELL_EDITOR =
		'min-w-0 flex-1 rounded-sm bg-muted/40 px-1 py-0.5 outline-none focus:bg-background focus:ring-1 focus:ring-ring';
	/** Row controls stay out of the way until the row is hovered or focused — and are simply there where there is no hover to give, as on a touch screen. */
	const rowControl =
		'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100';
	/** A column of names, as a class list has them. */
	const NAMES_PLACEHOLDER = 'Lovelace, Ada\nGrace Hopper';
	/**
	 * What a facility figure is tinted with, per band. A mark cell is a fraction
	 * of a 40&nbsp;px column, so it takes a heavier fill than the analysis view's
	 * full-width rows to read as the same colour.
	 */
	const FACILITY_TINT: Record<RagBand, string> = {
		red: 'bg-red-500/25',
		amber: 'bg-amber-400/30',
		green: 'bg-emerald-500/20'
	};

	/**
	 * What one entry's figure rests on, for the cell that shows it: the cell is
	 * the whole width of a narrow column, so the detail is the title's to carry.
	 */
	function facilityTitle(row: EntryAnalysis): string {
		const lines = [`${entryName(row.entry)} — ${row.entry.summary}`];
		if (row.facility === null) {
			lines.push(notScoredLabel(row));
		} else {
			lines.push(
				`Facility ${facilityPercent(row.facility)}%${
					row.coverage.partMarked
						? ` — part-marked, ${row.coverage.marked} of ${row.coverage.of}`
						: ''
				}`
			);
		}
		if (row.overMax > 0) lines.push(`${row.overMax} above the available marks — not counted`);
		lines.push('Click to read the analysis');
		return lines.join('\n');
	}

	/** The cell a keystroke would land on: where the cursor is, else the first cell. */
	const activeCell = $derived(
		cursor ?? (students[0] ? { studentId: students[0].id, entryId: entries[0]?.id ?? null } : null)
	);

	/** The band the cursor's column belongs to, which the band row highlights. */
	const cursorBand = $derived(
		bands.find((band) => band.entries.some((entry) => entry.id === cursor?.entryId)) ?? null
	);

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
		const cell = document.querySelector<HTMLElement>(cellSelector(studentId, entryId));
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

	/**
	 * The row the keyboard is on. It is the cursor's, or the first row's before the
	 * teacher has moved or clicked: focusing the grid with Tab is enough to walk it.
	 */
	function cursorRow(): number {
		return students.findIndex((student) => student.id === activeCell?.studentId);
	}

	/** The column the keyboard is on: -1 for the name column, before the first entry. */
	function cursorColumn(): number {
		const entryId = activeCell?.entryId;
		if (!entryId) return -1;
		return entries.findIndex((entry) => entry.id === entryId);
	}

	/** Move to a cell and take the keyboard with it. */
	function moveTo(studentId: string, entryId: string | null): void {
		clearRefusal();
		cursor = { studentId, entryId };
		focusCell(studentId, entryId);
	}

	/** Move one row, staying in the column: what Enter and the up/down arrows do. */
	function moveRow(offset: -1 | 1): void {
		const from = cursorRow();
		if (from === -1) return;
		// The ends of the sheet are the ends: the cursor stays on the cell, so the
		// keyboard never falls out of the grid mid-entry.
		const to = Math.min(Math.max(from + offset, 0), students.length - 1);
		moveTo(students[to].id, activeCell?.entryId ?? null);
	}

	/** Move one column, into the name column and back: what the side arrows do. */
	function moveColumn(offset: -1 | 1): void {
		const row = cursorRow();
		if (row === -1) return;

		const to = Math.min(Math.max(cursorColumn() + offset, -1), entries.length - 1);
		moveTo(students[row].id, to === -1 ? null : entries[to].id);
	}

	/**
	 * Move one column, wrapping to the next or previous row past either end: what
	 * Tab does, deliberately overriding the convention that Tab leaves the grid.
	 */
	function moveTab(offset: -1 | 1): void {
		const row = cursorRow();
		if (row === -1) return;

		const entry = entries[cursorColumn() + offset];
		if (entry) {
			moveTo(students[row].id, entry.id);
			return;
		}

		const wrappedEntry = offset === 1 ? entries[0] : entries.at(-1);
		const wrappedRow = students[row + offset];
		// Past the first or last cell there is nothing to wrap onto, so the cursor
		// stays on the cell the teacher is on.
		if (!wrappedEntry || !wrappedRow) moveTo(students[row].id, activeCell?.entryId ?? null);
		else moveTo(wrappedRow.id, wrappedEntry.id);
	}

	/** What a mark cell shows: a mark that is there, and nothing where there is none. */
	function markOf(student: StoredStudent, entry: BreakdownEntry): number | undefined {
		return marks[student.id]?.[entry.id];
	}

	/** Whether a mark is above what the entry offers: kept as typed, and shown for what it is. */
	function isOverMax(mark: number | undefined, entry: BreakdownEntry): boolean {
		return mark !== undefined && entry.marks !== null && mark > entry.marks;
	}

	/** Put the caret at the end of an open editor, so typing carries on from there. */
	function focusEditor(studentId: string, entryId: string): void {
		const input = document.querySelector<HTMLInputElement>(
			`${cellSelector(studentId, entryId)} [data-testid="mark-editor"]`
		);
		input?.focus();
		input?.setSelectionRange(input.value.length, input.value.length);
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
		focusEditor(student.id, entry.id);
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

		const typed = open.value.trim();
		if (typed === '') {
			store.clearMark(open.studentId, open.entryId);
			return null;
		}
		if (!isWholeNumber(typed)) {
			return `“${open.value}” was not stored: a mark is a whole number, or empty for a cell with no mark.`;
		}
		store.setMark(open.studentId, open.entryId, Number(typed));
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
			if (key === 'Enter') moveRow(1);
			else moveTab(event.shiftKey ? -1 : 1);
			return;
		}

		if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
			// An open editor's arrows belong to the caret; the keys move the cursor.
			if (open) return;
			event.preventDefault();
			if (key === 'ArrowUp') moveRow(-1);
			else if (key === 'ArrowDown') moveRow(1);
			else moveColumn(key === 'ArrowRight' ? 1 : -1);
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
	 * Take a block from the clipboard and put it down at the cursor. The clipboard
	 * proxy is what a paste lands on; `text/html` wins over `text/plain` so cells
	 * holding line breaks keep their rows aligned.
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
		store.pasteMarks(rows, anchor);
	}

	/** A paste aimed at the grid rather than the proxy: the proxy's own is already taken. */
	function onGridPaste(event: ClipboardEvent): void {
		if (event.target === pasteProxy) return;
		onPaste(event);
	}

	/** A block taken back: the store clears its account along with the undo. */
	function undoPaste(): void {
		store.undo();
	}

	/** What one paste did, in one sentence: the marks, the students. */
	function pasteSummary(result: PasteResult): string {
		const parts: string[] = [];
		if (result.marksStored > 0) {
			parts.push(`pasted ${result.marksStored} mark${result.marksStored === 1 ? '' : 's'}`);
		}
		if (result.marksCleared > 0) {
			parts.push(`cleared ${result.marksCleared} mark${result.marksCleared === 1 ? '' : 's'}`);
		}
		if (result.studentsAdded > 0) {
			parts.push(`added ${result.studentsAdded} student${result.studentsAdded === 1 ? '' : 's'}`);
		}
		if (parts.length === 0) return 'Nothing was pasted.';
		const sentence = parts.join(', ');
		return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
	}

	/** Why a paste could not use part of the block, one line per kind of loss. */
	function pasteLosses(result: PasteResult): string[] {
		const losses: string[] = [];
		if (result.columnsClipped > 0) {
			const count = result.columnsClipped;
			losses.push(
				`${count} column${count === 1 ? '' : 's'} past the last entry ${count === 1 ? 'was' : 'were'} dropped.`
			);
		}
		if (result.rowsDropped > 0) {
			const count = result.rowsDropped;
			losses.push(
				`${count} pasted row${count === 1 ? '' : 's'} had no name to make a student, so ${count === 1 ? 'it was' : 'they were'} not added.`
			);
		}
		if (result.overMax > 0) {
			const count = result.overMax;
			losses.push(
				`${count} mark${count === 1 ? '' : 's'} above the available marks ${count === 1 ? 'is' : 'are'} flagged in the grid.`
			);
		}
		return losses;
	}

	/** Clicking a band moves the cursor to its first column, on the row it is on. */
	function jumpToBand(band: QuestionBand): void {
		const studentId = cursor?.studentId ?? students[0]?.id;
		const first = band.entries[0];
		if (!studentId || !first) return;
		moveTo(studentId, first.id);
	}

	function sortClass(by: StudentSortKey): void {
		renaming = null;
		store.sortStudents(by);
	}

	/**
	 * Open a rename on a student's two name parts. F2 and double-click bring the
	 * name as it stands for fixing; typing over a selected name brings what was
	 * typed, which is the whole name and is split when it is committed.
	 */
	async function startRename(
		student: StoredStudent,
		name: { firstName: string; surname: string; replace: boolean },
		focus: 'firstName' | 'surname' = 'firstName'
	): Promise<void> {
		cursor = { studentId: student.id, entryId: null };
		renaming = { studentId: student.id, ...name, focus };
		await tick();
		const input = document.querySelector<HTMLInputElement>(
			`[data-student-id="${student.id}"] [data-rename-field="${focus}"]`
		);
		input?.focus();
		input?.setSelectionRange(input.value.length, input.value.length);
	}

	/** The name as it stands, ready to be edited in place. */
	function nameOf(student: StoredStudent): { firstName: string; surname: string; replace: false } {
		return { firstName: student.firstName, surname: student.surname, replace: false };
	}

	/** An F2, a double-click or a typed character on a name cell opens its rename. */
	function onNameKeydown(student: StoredStudent, event: KeyboardEvent): void {
		// Keys from the row's own buttons are theirs, not the cell's.
		if (event.target !== event.currentTarget) return;
		if (event.key === 'F2') {
			event.preventDefault();
			void startRename(student, nameOf(student));
			return;
		}
		// The name column is a cell of the grid too: the arrows move through it and
		// out into the row's marks.
		if (event.key === 'ArrowRight') {
			event.preventDefault();
			moveColumn(1);
			return;
		}
		if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
			event.preventDefault();
			moveRow(event.key === 'ArrowUp' ? -1 : 1);
			return;
		}
		if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
			event.preventDefault();
			void startRename(student, { firstName: event.key, surname: '', replace: true });
		}
	}

	/** Commit the open rename, keeping the name it had when both parts are blank. */
	function commitRename(): void {
		const open = renaming;
		if (!open) return;
		renaming = null;

		// A name typed over the old one replaces it; a name edited in place keeps
		// whichever parts the teacher left alone.
		const name = open.replace
			? splitName(open.firstName)
			: { firstName: open.firstName.trim(), surname: open.surname.trim() };
		if (studentName(name) === '') return;
		store.renameStudent(open.studentId, name);
	}

	/** Leaving the name cell — not moving between its two fields — commits the rename. */
	function onNameFocusOut(event: FocusEvent): void {
		const cell = event.currentTarget as HTMLElement;
		if (event.relatedTarget instanceof Node && cell.contains(event.relatedTarget)) return;
		commitRename();
	}

	/** The add-student field, opened and kept open so a class is entered in one pass. */
	async function focusAddInput(): Promise<void> {
		await tick();
		document.querySelector<HTMLInputElement>('[data-testid="new-student-name"]')?.focus();
	}

	function startAdding(): void {
		adding = true;
		void focusAddInput();
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
		const name = splitName(newName);
		if (studentName(name) === '') {
			discardNewStudent();
			return;
		}
		store.addStudent(name);
		newName = '';
		void focusAddInput();
	}

	function discardNewStudent(): void {
		newName = '';
		adding = false;
	}

	/** Enter keeps the rename, Escape drops it, and leaving the cell commits it. */
	function onRenameKeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter') commitRename();
		else if (event.key === 'Escape') renaming = null;
	}

	/** A pasted column of names becomes the class, or joins it when there is one. */
	function addPastedNames(): void {
		if (store.pasteNames(pastedNames) > 0) pastedNames = '';
	}

	/**
	 * Why the band is flagged: the findings that say the parse could not read its
	 * question number, rather than anything else the parse said about its rows.
	 */
	function explainFallback(band: QuestionBand): string {
		return band.entries
			.flatMap((entry) => warningsForEntry(warnings, entry.id))
			.filter((warning) => warning.code === MISSING_QUESTION_NUMBER)
			.map((warning) => warning.message)
			.join(' ');
	}
</script>

{#if undoable?.kind === 'student-removal' || undoable?.kind === 'mark-paste' || refusal || pasteNotice}
	<!-- Sticky, and above the toolbar: a notice about a cell far down a long class
	     must still be where the teacher is looking. Neither notice takes a click,
	     so the mark cells it passes over stay reachable. -->
	<div class="pointer-events-none sticky top-2 z-10 space-y-2">
		{#if undoable?.kind === 'student-removal'}
			<Alert
				class="pointer-events-auto flex flex-row items-center gap-2 py-2 shadow-sm"
				data-testid="undo"
			>
				<AlertDescription>
					Removed <strong>{studentName(undoable.student)}</strong>.
				</AlertDescription>
				<Button variant="outline" size="xs" onclick={() => store.undo()}>Undo</Button>
			</Alert>
		{/if}
		{#if pasteNotice}
			<!-- What a block did, beside the grid: the sheet under it has already
			     changed, so the account has to be where the teacher can read it. -->
			<Alert
				class="pointer-events-auto flex flex-row items-start gap-2 py-2 shadow-sm"
				data-testid="paste-notice"
			>
				<AlertDescription class="space-y-1">
					<p>{pasteSummary(pasteNotice)}</p>
					{#if pasteLosses(pasteNotice).length > 0}
						<ul class="list-disc space-y-0.5 pl-4">
							{#each pasteLosses(pasteNotice) as loss (loss)}
								<li>{loss}</li>
							{/each}
						</ul>
					{/if}
					{#if pasteNotice.refused.length > 0}
						<ul class="list-disc space-y-0.5 pl-4" data-testid="paste-refusals">
							{#each pasteNotice.refused as cell (`${cell.row}:${cell.column}`)}
								<li>
									“{cell.value}” at row {cell.row}, column {cell.column} is not a whole number.
								</li>
							{/each}
						</ul>
					{/if}
				</AlertDescription>
				{#if undoable?.kind === 'mark-paste'}
					<Button variant="outline" size="xs" onclick={undoPaste}>Undo</Button>
				{/if}
			</Alert>
		{/if}
		{#if refusal}
			<!-- Saying why a keystroke did not become a mark, where the teacher is
			     looking: the cell in front of them has not changed. -->
			<Alert role="status" variant="destructive" class="py-2 shadow-sm" data-testid="refusal">
				<AlertDescription>{refusal}</AlertDescription>
			</Alert>
		{/if}
	</div>
{/if}

<div class="flex flex-wrap items-center gap-2">
	<Button variant="outline" size="xs" onclick={() => onViewAnalysis(null)}>
		<ChartColumnIcon class="size-3.5" /> View analysis
	</Button>
	{#if hardest.length > 0}
		<!-- The worst questions by name, so the ones to reteach are named without
		     opening anything. Every one of them is there with its figure. -->
		<span class="flex flex-wrap items-center gap-1.5 text-xs" data-testid="hardest">
			<span class="font-medium">Hardest</span>
			{#each hardest as row (row.entry.id)}
				{#if row.facility !== null}
					<button
						type="button"
						class="rounded border border-red-600/50 bg-red-500/10 px-1.5 py-0.5 tabular-nums hover:bg-red-500/20"
						title={facilityTitle(row)}
						onclick={() => onViewAnalysis(row.entry.id)}
					>
						{entryName(row.entry)}
						<span class="text-muted-foreground">{facilityPercent(row.facility)}%</span>
					</button>
				{/if}
			{/each}
		</span>
	{/if}
	<span class="text-xs text-muted-foreground">Sort the class</span>
	<Button variant="outline" size="xs" onclick={() => sortClass('firstName')}>By first name</Button>
	<Button variant="outline" size="xs" onclick={() => sortClass('surname')}>By surname</Button>
	{#if fallbacks.length > 0}
		<Popover.Root>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Badge
						{...props}
						variant="outline"
						class="border-amber-500/60 text-amber-700 dark:text-amber-300"
						data-testid="fallback-band-count"
					>
						<TriangleAlertIcon />
						{fallbacks.length} band{fallbacks.length === 1 ? '' : 's'} without a question number
					</Badge>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="w-80 text-xs">
				<p class="mb-1 font-medium">The parse could not read these questions' numbers.</p>
				<p class="text-muted-foreground">
					Their columns are banded under the entry's own label. Correct the question number on the
					breakdown page and the band moves where it belongs.
				</p>
			</Popover.Content>
		</Popover.Root>
	{/if}
	{#if warnings.length > 0}
		<!-- The parse's findings stay reachable after confirmation: the ones about
		     one entry, named by its label, and the ones about the run as a whole. -->
		<Popover.Root>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Badge {...props} variant="outline" data-testid="parse-warnings-count">
						<TriangleAlertIcon />
						{warnings.length} parse warning{warnings.length === 1 ? '' : 's'}
					</Badge>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="max-h-80 w-96 overflow-y-auto text-xs" data-testid="parse-warnings">
				<p class="mb-1 font-medium">From the parse</p>
				<ul class="space-y-1">
					{#each runWarnings(warnings) as warning (warning.code + warning.message)}
						<li><strong>{warning.code}</strong>: {warning.message}</li>
					{/each}
					{#each entries as entry (entry.id)}
						{#each warningsForEntry(warnings, entry.id) as warning (warning.code + warning.message)}
							<li><strong>{entryName(entry)}</strong> · {warning.code}: {warning.message}</li>
						{/each}
					{/each}
				</ul>
			</Popover.Content>
		</Popover.Root>
	{/if}
	<!-- The way back to the entries the marks are keyed against, and at the far
	     end from View analysis beside the marks export: a data tool, never
	     mistaken for the page's own backup. -->
	<div class="ml-auto flex items-center gap-2">
		<EditBreakdownDialog />
		<Button variant="outline" size="xs" onclick={exportMarksNow}>
			<FileSpreadsheetIcon class="size-3.5" /> Export marks to spreadsheet (.csv)
		</Button>
		<span class="text-[11px] text-muted-foreground" title="Not a backup: it cannot be restored">
			Not a backup
		</span>
	</div>
</div>

{#if students.length === 0}
	<!-- An empty class starts here rather than in the grid: the paste target and
	     the one-at-a-time row want room the columns do not have to give. -->
	<div class="max-w-xl space-y-2 rounded-xl border p-6">
		<p class="text-sm font-medium">No students on this marksheet yet.</p>
		<Textarea
			rows={5}
			aria-label="Paste a column of names"
			placeholder={NAMES_PLACEHOLDER}
			bind:value={pastedNames}
		/>
		<Button size="sm" onclick={addPastedNames} disabled={pastedNames.trim() === ''}>
			<ClipboardPasteIcon class="size-4" /> Add students
		</Button>
		<p class="text-xs text-muted-foreground">
			One name per line, as your class list has them. A comma means
			<code>Surname, First name</code>; otherwise the last word is the surname.
		</p>
		<Button variant="ghost" size="sm" class="w-fit" onclick={startAdding}>
			<UserPlusIcon class="size-4" /> Or add students one at a time
		</Button>
	</div>
{/if}

<div class="relative overflow-hidden rounded-xl border" onpaste={onGridPaste}>
	<!-- The clipboard lands here. A spreadsheet puts an HTML table in the
	     clipboard beside its TSV; reading it as it arrives is what keeps a cell
	     with a line break from shifting every row under it. -->
	<div
		bind:this={pasteProxy}
		contenteditable="true"
		role="textbox"
		tabindex="-1"
		aria-label="Paste marks from a spreadsheet"
		data-testid="paste-proxy"
		class="pointer-events-none absolute -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0"
		onpaste={onPaste}
	></div>
	<Table.Root class="table-fixed w-fit" role="grid" aria-label="Marksheet grid">
		<!-- The widths every cell obeys: narrow entry columns, a frozen name and
		     progress column, so a paper scrolls sideways only when it must. -->
		<colgroup>
			<col style="width: {COLUMN.name}" />
			<col style="width: {COLUMN.progress}" />
			{#each entries as entry (entry.id)}
				<col style="width: {COLUMN.entry}" />
			{/each}
		</colgroup>
		<Table.Header>
			{#if bands.length > 0}
				<Table.Row role="row" class="bg-muted/50 hover:bg-muted/50">
					<Table.Head class={NAME_COLUMN} />
					<Table.Head class={FROZEN_PROGRESS} style={PROGRESS_PIN} />
					{#each bands as band (band.entries[0].id)}
						{@const fallback = isFallbackBand(band, warnings)}
						<Table.Head
							colspan={band.entries.length}
							role="columnheader"
							class={cn(
								'p-0.5 text-xs',
								cursorBand === band ? 'bg-primary/15' : 'bg-muted/50',
								fallback && 'text-amber-700 dark:text-amber-300'
							)}
						>
							<span
								class="sticky inline-flex items-center gap-1"
								style={BAND_LABEL_PIN}
								data-band-label
							>
								<button
									type="button"
									class="font-semibold hover:underline"
									aria-label={`Jump to question ${bandName(band)}`}
									onclick={() => jumpToBand(band)}
								>
									{band.questionNumber === '' ? bandName(band) : `Q${bandName(band)}`}
								</button>
								{#if fallback}
									<Popover.Root>
										<Popover.Trigger
											class="text-amber-600 dark:text-amber-400"
											aria-label={`Why question ${bandName(band)} is flagged`}
										>
											<TriangleAlertIcon class="size-3.5" />
										</Popover.Trigger>
										<Popover.Content class="w-80 text-xs">
											<p class="font-medium">Question number not read from the paper.</p>
											<p class="mt-1 text-muted-foreground">{explainFallback(band)}</p>
										</Popover.Content>
									</Popover.Root>
								{/if}
							</span>
						</Table.Head>
					{/each}
				</Table.Row>
			{/if}
			<Table.Row role="row" class="hover:bg-transparent">
				<Table.Head class={cn(NAME_COLUMN, 'px-1.5 text-left text-xs')}>Student</Table.Head>
				<Table.Head class={cn(FROZEN_PROGRESS, 'px-1 text-xs')} style={PROGRESS_PIN}
					>Progress</Table.Head
				>
				{#each entries as entry (entry.id)}
					<Table.Head
						role="columnheader"
						class={cn(
							'border-l p-0',
							cursor?.entryId === entry.id ? 'bg-primary/15' : 'bg-muted/30'
						)}
					>
						<Popover.Root>
							<Popover.Trigger>
								{#snippet child({ props })}
									<button
										{...props}
										type="button"
										class="flex w-full flex-col items-center px-0.5 font-semibold hover:underline"
										aria-label={`Details for ${entryName(entry)}`}
										title={`${entryName(entry)} — what this column is`}
									>
										<span class="w-full truncate text-xs">{entry.label}</span>
										<span class="text-[11px] font-normal text-muted-foreground">
											/{entry.marks ?? '?'}
										</span>
									</button>
								{/snippet}
							</Popover.Trigger>
							<Popover.Content class="w-72 text-xs">
								<p class="font-medium">{entryName(entry)} — {entry.summary}</p>
								<dl class="mt-1 space-y-0.5 text-muted-foreground">
									<div>
										<dt class="inline font-medium text-foreground">Available marks:</dt>
										<dd class="inline">{entry.marks ?? 'unknown'}</dd>
									</div>
									<div>
										<dt class="inline font-medium text-foreground">Specification point:</dt>
										<dd class="inline">{entry.specPoint ?? '—'}</dd>
									</div>
									<div>
										<dt class="inline font-medium text-foreground">Assessment objective:</dt>
										<dd class="inline">{entry.ao ?? '—'}</dd>
									</div>
									<div>
										<dt class="inline font-medium text-foreground">Command word:</dt>
										<dd class="inline">{entry.commandWord ?? '—'}</dd>
									</div>
								</dl>
								{#each warningsForEntry(warnings, entry.id) as warning (warning.code + warning.message)}
									<p class="mt-1 text-amber-800 dark:text-amber-300">
										<TriangleAlertIcon class="mr-1 inline size-3" /><strong>{warning.code}</strong>:
										{warning.message}
									</p>
								{/each}
							</Popover.Content>
						</Popover.Root>
					</Table.Head>
				{/each}
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
					<Table.Cell
						role="rowheader"
						data-testid="name-cell"
						data-student-id={student.id}
						tabindex={isActiveCell(student.id, null) ? 0 : -1}
						class={cn(NAME_COLUMN, 'px-1.5 py-1', isActiveCell(student.id, null) && selectedCell)}
						onclick={() => selectCell(student.id, null)}
						ondblclick={(event) => {
							// A double-click on the row's own controls is theirs.
							if ((event.target as Element).closest('button')) return;
							void startRename(student, nameOf(student));
						}}
						onkeydown={(event) => onNameKeydown(student, event)}
						onfocusout={onNameFocusOut}
					>
						<span class="flex items-center gap-1">
							<Button
								variant="ghost"
								size="icon-xs"
								class={cn(
									'shrink-0',
									student.absent
										? 'text-destructive'
										: 'text-muted-foreground/40 hover:text-foreground'
								)}
								aria-pressed={student.absent}
								aria-label={`Mark ${name} absent`}
								title={student.absent ? 'Absent — click to mark present' : 'Mark absent'}
								onclick={() => store.setStudentAbsent(student.id, !student.absent)}
							>
								<UserXIcon class="size-3.5" />
							</Button>
							{#if renaming?.studentId === student.id}
								<input
									data-rename-field="firstName"
									aria-label={`First name of ${name}`}
									class={CELL_EDITOR}
									value={renaming.firstName}
									oninput={(event) => {
										if (renaming) renaming.firstName = event.currentTarget.value;
									}}
									onkeydown={onRenameKeydown}
								/>
								<input
									data-rename-field="surname"
									aria-label={`Surname of ${name}`}
									class={CELL_EDITOR}
									value={renaming.surname}
									oninput={(event) => {
										if (!renaming) return;
										renaming.surname = event.currentTarget.value;
										// Typed into deliberately: this is no longer an
										// overwrite of the whole name.
										renaming.replace = false;
									}}
									onkeydown={onRenameKeydown}
								/>
							{:else}
								<span
									data-testid="student-name"
									class={cn('min-w-0 flex-1 truncate', student.absent && 'line-through')}
								>
									{name}
								</span>
								<Button
									variant="ghost"
									size="icon-xs"
									class={cn(
										rowControl,
										'shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
									)}
									aria-label={`Remove ${name}`}
									title={`Remove ${name}`}
									onclick={() => store.removeStudent(student.id)}
								>
									<XIcon class="size-3.5" />
								</Button>
							{/if}
						</span>
					</Table.Cell>
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
						{@const overMax = isOverMax(mark, entry)}
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
									aria-label={`Mark for ${name} on ${entryName(entry)}`}
									inputmode="numeric"
									class="w-full min-w-0 rounded-sm bg-background px-0.5 py-0 text-center tabular-nums outline-none ring-1 ring-ring"
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
				</Table.Row>
			{/each}
			<Table.Row role="row" class="hover:bg-transparent">
				<Table.Cell role="gridcell" class={cn(NAME_COLUMN, 'p-1')}>
					{#if adding}
						<input
							data-testid="new-student-name"
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
				<Table.Cell colspan={entries.length + 1} role="gridcell" />
			</Table.Row>
		</Table.Body>
		<Table.Footer>
			<!-- The figures, under the columns they belong to: one per entry, on its
			     band's tint, so a weak question is visible while marks are entered.
			     Part-marked ones are drawn as the estimate they are, with their
			     coverage in the row beneath. -->
			<Table.Row class="hover:bg-transparent">
				<Table.Cell class={cn(NAME_COLUMN, 'px-1.5 py-1 text-xs font-semibold')}>
					Facility
				</Table.Cell>
				<Table.Cell class={FROZEN_PROGRESS} style={PROGRESS_PIN} />
				{#each analysis.entries as row (row.entry.id)}
					<Table.Cell
						class="border-l p-0 text-center"
						aria-invalid={row.overMax > 0 ? 'true' : undefined}
					>
						{#if row.facility !== null && row.band !== null}
							<button
								type="button"
								data-testid="facility-cell"
								data-entry-id={row.entry.id}
								title={facilityTitle(row)}
								class={cn(
									'my-0.5 w-[calc(100%-4px)] rounded-sm py-0.5 text-[11px] font-semibold tabular-nums hover:ring-2 hover:ring-primary',
									FACILITY_TINT[row.band],
									row.coverage.partMarked &&
										'italic outline-1 -outline-offset-2 outline-dashed outline-foreground',
									row.overMax > 0 && 'text-destructive'
								)}
								onclick={() => onViewAnalysis(row.entry.id)}
							>
								{facilityPercent(row.facility)}%
							</button>
						{:else}
							<!-- An entry with no figure opens the analysis just as a scored
							     one does: it is the entry a teacher most often needs to
							     look into, and the cell still says which one it is. -->
							<button
								type="button"
								data-testid="facility-cell"
								data-entry-id={row.entry.id}
								title={facilityTitle(row)}
								class="my-0.5 w-[calc(100%-4px)] rounded-sm py-0.5 text-xs text-muted-foreground hover:ring-2 hover:ring-primary"
								onclick={() => onViewAnalysis(row.entry.id)}
							>
								—
							</button>
						{/if}
					</Table.Cell>
				{/each}
			</Table.Row>
			<Table.Row class="hover:bg-transparent">
				<Table.Cell class={cn(NAME_COLUMN, 'px-1.5 text-[11px] text-muted-foreground')}>
					Marked
				</Table.Cell>
				<Table.Cell class={FROZEN_PROGRESS} style={PROGRESS_PIN} />
				{#each analysis.entries as row (row.entry.id)}
					<Table.Cell
						data-testid="coverage-cell"
						data-entry-id={row.entry.id}
						class="border-l text-center text-[10px] text-amber-700 tabular-nums dark:text-amber-300"
					>
						{row.coverage.partMarked ? `${row.coverage.marked}/${row.coverage.of}` : ''}
					</Table.Cell>
				{/each}
			</Table.Row>
		</Table.Footer>
	</Table.Root>
</div>
