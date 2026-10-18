<!--
	The marksheet: the class down the side, the confirmed breakdown across the
	top, banded under its questions. Before a mark is entered this is the shape
	of the sheet — one column per breakdown entry, one row per student — with the
	class itself as editable here as the breakdown was on the review page: names
	pasted in a column, added one at a time, renamed in place, flagged absent or
	removed, and the lot reordered by either name part.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import ClipboardPasteIcon from '@lucide/svelte/icons/clipboard-paste';
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
	import {
		bandName,
		entryName,
		fallbackBands,
		isFallbackBand,
		warningsForEntry,
		type QuestionBand
	} from '$lib/marksheet/breakdown.js';
	import type { BreakdownEntry, StoredStudent } from '$lib/marksheet/document.js';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import { MISSING_QUESTION_NUMBER } from '$lib/parse/parse-warnings.js';
	import {
		progressOf,
		splitName,
		studentName,
		type StudentSortKey
	} from '$lib/marksheet/students.js';
	import { cn } from '$lib/utils.js';

	const store = marksheetStore();
	const entries = $derived(store.document?.breakdown.entries ?? []);
	const students = $derived(store.document?.students ?? []);
	const marks = $derived(store.document?.marks ?? {});
	const warnings = $derived(store.document?.breakdown.warnings ?? []);
	const bands = $derived(store.questionBands);
	const fallbacks = $derived(fallbackBands(bands, warnings));
	const undoable = $derived(store.undoable);

	/** Where the cursor is: a mark cell, or a row's name cell when `entryId` is null. */
	let cursor = $state<{ studentId: string; entryId: string | null } | null>(null);
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
	/** Where a band label pins itself: past both frozen columns. */
	const BAND_LABEL_PIN = `left: calc(${COLUMN.name} + ${COLUMN.progress})`;
	const selectedCell = 'ring-2 ring-primary ring-inset';
	/** A cell reads as the document until it is being edited. */
	const CELL_EDITOR =
		'min-w-0 flex-1 rounded-sm bg-muted/40 px-1 py-0.5 outline-none focus:bg-background focus:ring-1 focus:ring-ring';
	/** Row controls stay out of the way until the row is hovered or focused — and are simply there where there is no hover to give, as on a touch screen. */
	const rowControl =
		'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100';
	/** A column of names, as a class list has them. */
	const NAMES_PLACEHOLDER = 'Lovelace, Ada\nGrace Hopper';

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

	/** Where a mark cell is, for scrolling to it and focusing it after a jump. */
	function markCellSelector(studentId: string, entryId: string): string {
		return `[data-testid="mark-cell"][data-student-id="${studentId}"][data-entry-id="${entryId}"]`;
	}

	async function focusCell(studentId: string, entryId: string): Promise<void> {
		await tick();
		document.querySelector<HTMLElement>(markCellSelector(studentId, entryId))?.focus();
	}

	/** Put the cursor in a cell. The name column is a cell of the grid too. */
	function selectCell(studentId: string, entryId: string | null): void {
		cursor = { studentId, entryId };
	}

	/** Clicking a band moves the cursor to its first column, on the row it is on. */
	function jumpToBand(band: QuestionBand): void {
		const studentId = cursor?.studentId ?? students[0]?.id;
		const first = band.entries[0];
		if (!studentId || !first) return;
		cursor = { studentId, entryId: first.id };
		void focusCell(studentId, first.id);
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

	/** What a mark cell shows: a mark that is there, and nothing where there is none. */
	function markOf(student: StoredStudent, entry: BreakdownEntry): number | undefined {
		return marks[student.id]?.[entry.id];
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

{#if undoable?.kind === 'student-removal'}
	<!-- Sticky: a student removed near the foot of a long class must still offer
	     their undo where the teacher is looking. -->
	<Alert
		class="sticky top-2 z-10 flex flex-row items-center gap-2 py-2 shadow-sm"
		data-testid="undo"
	>
		<AlertDescription>
			Removed <strong>{studentName(undoable.student)}</strong>.
		</AlertDescription>
		<Button variant="outline" size="xs" onclick={() => store.undo()}>Undo</Button>
	</Alert>
{/if}

<div class="flex flex-wrap items-center gap-2">
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

<div class="overflow-hidden rounded-xl border">
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
						<Table.Cell
							role="gridcell"
							data-testid="mark-cell"
							data-student-id={student.id}
							data-entry-id={entry.id}
							tabindex={isActiveCell(student.id, entry.id) ? 0 : -1}
							class={cn(
								'border-l px-0.5 py-1 text-center tabular-nums',
								isActiveCell(student.id, entry.id) && selectedCell,
								student.absent && 'bg-muted/40'
							)}
							onclick={() => selectCell(student.id, entry.id)}
						>
							{mark ?? ''}
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
	</Table.Root>
</div>
