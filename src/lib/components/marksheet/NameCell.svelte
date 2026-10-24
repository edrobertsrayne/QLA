<!--
	A student's name cell: the name, the absent toggle and the remove button, and
	the rename that opens in place of the name. A cell of the grid like any
	other, so the keys move through it and out into the row's marks.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import ArrowLeftRightIcon from '@lucide/svelte/icons/arrow-left-right';
	import UserXIcon from '@lucide/svelte/icons/user-x';
	import XIcon from '@lucide/svelte/icons/x';
	import { caretAtEnd } from '$lib/attachments.js';
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import type { StoredStudent } from '$lib/marksheet/document.js';
	import type { GridMove } from '$lib/marksheet/grid-cursor.js';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import { readName, studentName } from '$lib/marksheet/students.js';
	import { cn } from '$lib/utils.js';
	import { CELL_EDITOR, NAME_COLUMN, rowControl, selectedCell } from './grid-layout.js';
	import OffTierBadge from './OffTierBadge.svelte';

	let {
		student,
		active,
		onSelect,
		onMove,
		onMoveTier,
		moveLabel
	}: {
		student: StoredStudent;
		active: boolean;
		onSelect: () => void;
		onMove: (move: GridMove) => void;
		/** Move the student to the other tier: present only on a two-tier tab. */
		onMoveTier?: () => void;
		/** The tier that control moves them to, for its label and tooltip. */
		moveLabel?: string;
	} = $props();

	const store = marksheetStore();
	const name = $derived(studentName(student));
	let cell = $state<HTMLTableCellElement | null>(null);
	/** The open rename: both name parts. */
	let renaming = $state<{
		firstName: string;
		surname: string;
		/** Opened by typing over the name: what is typed is the whole name, split on commit. */
		replace: boolean;
	} | null>(null);

	/**
	 * Open a rename on the student's two name parts. F2 and double-click bring the
	 * name as it stands for fixing; typing over a selected name brings what was
	 * typed, which is the whole name and is split when it is committed.
	 */
	function startRename(opened: { firstName: string; surname: string; replace: boolean }): void {
		onSelect();
		renaming = opened;
	}

	/** The name as it stands, ready to be edited in place. */
	function nameOf(): { firstName: string; surname: string; replace: false } {
		return { firstName: student.firstName, surname: student.surname, replace: false };
	}

	/** An F2, a double-click or a typed character on a name cell opens its rename. */
	function onNameKeydown(event: KeyboardEvent): void {
		// Keys from the row's own buttons are theirs, not the cell's.
		if (event.target !== event.currentTarget) return;
		if (event.key === 'F2') {
			event.preventDefault();
			startRename(nameOf());
			return;
		}
		// The name column is a cell of the grid too: the arrows move through it and
		// out into the row's marks.
		if (event.key === 'ArrowRight') {
			event.preventDefault();
			onMove('right');
			return;
		}
		if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
			event.preventDefault();
			onMove(event.key === 'ArrowUp' ? 'up' : 'down');
			return;
		}
		if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
			event.preventDefault();
			startRename({ firstName: event.key, surname: '', replace: true });
		}
	}

	/** Commit the open rename, keeping the name it had when both parts are blank. */
	function commitRename(): void {
		const open = renaming;
		if (!open) return;
		renaming = null;

		// A name typed over the old one replaces it; a name edited in place keeps
		// whichever parts the teacher left alone.
		const next = open.replace
			? readName(open.firstName)
			: { firstName: open.firstName.trim(), surname: open.surname.trim() };
		if (!next || studentName(next) === '') return;
		store.renameStudent(student.id, next);
	}

	/** Leaving the name cell — not moving between its two fields — commits the rename. */
	function onNameFocusOut(event: FocusEvent): void {
		const current = event.currentTarget as HTMLElement;
		if (event.relatedTarget instanceof Node && current.contains(event.relatedTarget)) return;
		commitRename();
	}

	/** Enter keeps the rename, Escape drops it, and leaving the cell commits it. */
	async function onRenameKeydown(event: KeyboardEvent): Promise<void> {
		if (event.key === 'Enter') commitRename();
		else if (event.key === 'Escape') renaming = null;
		else return;
		// The input unmounts with the rename, taking the keyboard with it: put it
		// back on the name cell.
		await tick();
		cell?.focus({ preventScroll: true });
	}
</script>

<Table.Cell
	bind:ref={cell}
	role="rowheader"
	data-testid="name-cell"
	data-student-id={student.id}
	tabindex={active ? 0 : -1}
	class={cn(NAME_COLUMN, 'px-1.5 py-1', active && selectedCell)}
	onclick={onSelect}
	ondblclick={(event) => {
		// A double-click on the row's own controls is theirs.
		if ((event.target as Element).closest('button')) return;
		startRename(nameOf());
	}}
	onkeydown={onNameKeydown}
	onfocusout={onNameFocusOut}
>
	<span class="flex items-center gap-1">
		<Button
			variant="ghost"
			size="icon-xs"
			class={cn(
				'shrink-0',
				student.absent ? 'text-destructive' : 'text-muted-foreground/40 hover:text-foreground'
			)}
			aria-pressed={student.absent}
			aria-label={`Mark ${name} absent`}
			title={student.absent ? 'Absent — click to mark present' : 'Mark absent'}
			onclick={() => store.setStudentAbsent(student.id, !student.absent)}
		>
			<UserXIcon class="size-3.5" />
		</Button>
		{#if renaming}
			<input
				data-rename-field="firstName"
				{@attach caretAtEnd}
				aria-label={`First name of ${name}`}
				class={CELL_EDITOR}
				value={renaming.firstName}
				oninput={(event) => {
					if (renaming) renaming.firstName = event.currentTarget.value;
				}}
				onkeydown={(event) => void onRenameKeydown(event)}
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
				onkeydown={(event) => void onRenameKeydown(event)}
			/>
		{:else}
			<span
				data-testid="student-name"
				class={cn('min-w-0 flex-1 truncate', student.absent && 'line-through')}
			>
				{name}
			</span>
			<OffTierBadge {student} />
			{#if onMoveTier && moveLabel}
				<Button
					variant="ghost"
					size="icon-xs"
					class={cn(rowControl, 'shrink-0 text-muted-foreground')}
					aria-label={`Move ${name} to ${moveLabel}`}
					title={`Move to ${moveLabel}`}
					onclick={onMoveTier}
				>
					<ArrowLeftRightIcon class="size-3.5" />
				</Button>
			{/if}
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
