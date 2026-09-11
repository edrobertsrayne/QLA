// PROTOTYPE — throwaway shared grid engine for wayfinder #27.
// Shared across all three layout variants so keyboard/paste "feel" is identical;
// only rendering (header treatment, frozen columns, roster tools, feedback surface) differs per variant.

import type { ParseQuestion } from '$lib/server/parse/schema.js';
import type { Student } from './sample-data.js';

export type MaxPolicy = 'reject' | 'clamp' | 'flag';
export type Keymap = 'spreadsheet' | 'apg';
export type PasteWidthPolicy = 'clip' | 'abort';

interface EditingState {
	row: number;
	col: number;
	value: string;
	/** true when entered via F2/double-click (select existing text); false when typing started it. */
	selectAll: boolean;
}

interface FlashState {
	kind: 'reject' | 'clamp';
	until: number;
}

function cellKey(studentId: string, leafId: string) {
	return `${studentId}::${leafId}`;
}

export class GridEngine {
	leaves = $state<ParseQuestion[]>([]);
	students = $state<Student[]>([]);
	marks = $state<Record<string, number>>({});
	absent = $state<Record<string, boolean>>({});

	/** col === -1 is the name column (paste target for roster names). */
	cursor = $state<{ row: number; col: number }>({ row: 0, col: 0 });
	editing = $state<EditingState | null>(null);
	flashes = $state<Record<string, FlashState>>({});

	config = $state<{ maxPolicy: MaxPolicy; keymap: Keymap; pasteWidthPolicy: PasteWidthPolicy }>({
		maxPolicy: 'flag',
		keymap: 'spreadsheet',
		pasteWidthPolicy: 'clip'
	});

	message = $state<{ text: string; tone: 'info' | 'warn' } | null>(null);

	private undoSnapshot: {
		marks: Record<string, number>;
		students: Student[];
		absent: Record<string, boolean>;
	} | null = null;
	private undoLabel = 'Paste';
	canUndo = $state(false);

	proxyEl = $state<HTMLElement | null>(null);

	/** Variant D opts in: typing/F2 on the name column renames, Enter on a just-added row adds another. */
	allowNameEdit = $state(false);
	/** Id of the row created by addStudent() while its name is still being typed. */
	private addingId: string | null = null;

	constructor(leaves: ParseQuestion[], students: Student[]) {
		this.leaves = leaves;
		this.students = students;
	}

	get maxRow() {
		return this.students.length - 1;
	}
	get maxCol() {
		return this.leaves.length - 1;
	}

	markAt(studentId: string, leafId: string): number | undefined {
		return this.marks[cellKey(studentId, leafId)];
	}

	isAbsent(studentId: string) {
		return !!this.absent[studentId];
	}

	isOverMax(studentId: string, leaf: ParseQuestion) {
		const v = this.markAt(studentId, leaf.id);
		return v != null && leaf.marks != null && v > leaf.marks;
	}

	flashKind(studentId: string, leafId: string): FlashState['kind'] | null {
		const f = this.flashes[cellKey(studentId, leafId)];
		if (!f) return null;
		if (f.until < Date.now()) return null;
		return f.kind;
	}

	private flash(studentId: string, leafId: string, kind: FlashState['kind']) {
		const key = cellKey(studentId, leafId);
		this.flashes[key] = { kind, until: Date.now() + 900 };
		setTimeout(() => {
			delete this.flashes[key];
		}, 950);
	}

	private snapshotForUndo(label = 'Paste') {
		this.undoSnapshot = {
			marks: { ...this.marks },
			students: this.students.map((s) => ({ ...s })),
			absent: { ...this.absent }
		};
		this.undoLabel = label;
		this.canUndo = true;
	}

	undo() {
		if (!this.undoSnapshot) return;
		this.marks = this.undoSnapshot.marks;
		this.students = this.undoSnapshot.students;
		this.absent = this.undoSnapshot.absent;
		this.canUndo = false;
		this.cursor = {
			row: Math.max(0, Math.min(this.cursor.row, this.maxRow)),
			col: this.cursor.col
		};
		this.message = { text: `${this.undoLabel} undone.`, tone: 'info' };
	}

	/** Appends a blank-named row and starts typing its name. */
	addStudent(initial = '') {
		const student = { id: `s-new-${Date.now()}`, name: '' };
		this.students.push(student);
		this.addingId = student.id;
		this.cursor = { row: this.students.length - 1, col: -1 };
		this.editing = { row: this.cursor.row, col: -1, value: initial, selectAll: false };
	}

	removeStudent(row: number) {
		const student = this.students[row];
		if (!student) return;
		this.snapshotForUndo('Removal');
		this.students.splice(row, 1);
		this.editing = null;
		this.cursor = {
			row: Math.max(0, Math.min(this.cursor.row, this.maxRow)),
			col: this.cursor.col
		};
		this.message = { text: `Removed ${student.name || 'unnamed student'}.`, tone: 'info' };
	}

	private renameStudent(row: number, raw: string) {
		const student = this.students[row];
		if (!student) return;
		const name = raw.trim();
		if (name !== '') {
			student.name = name;
			return;
		}
		if (student.name === '') {
			// Abandoned add: the row never got a name, so drop it without an undo entry.
			this.students.splice(row, 1);
			if (this.addingId === student.id) this.addingId = null;
			this.cursor = { row: Math.max(0, Math.min(row, this.maxRow)), col: -1 };
			return;
		}
		this.message = { text: "A student's name can't be blank — name left unchanged.", tone: 'warn' };
	}

	focusProxy() {
		this.proxyEl?.focus();
	}

	moveCursor(dr: number, dc: number, opts: { wrapToNextRow?: boolean } = {}) {
		let row = this.cursor.row + dr;
		let col = this.cursor.col + dc;
		if (opts.wrapToNextRow && col > this.maxCol) {
			col = 0;
			row += 1;
		}
		if (opts.wrapToNextRow && col < -1) {
			col = this.maxCol;
			row -= 1;
		}
		row = Math.max(0, Math.min(this.maxRow, row));
		col = Math.max(-1, Math.min(this.maxCol, col));
		this.cursor = { row, col };
		this.editing = null;
		this.focusProxy();
	}

	toggleAbsentAtCursor() {
		const student = this.students[this.cursor.row];
		if (!student) return;
		this.absent[student.id] = !this.absent[student.id];
	}

	private commitValue(row: number, col: number, raw: string) {
		if (col === -1) {
			if (this.allowNameEdit) this.renameStudent(row, raw);
			return;
		}
		const student = this.students[row];
		const leaf = this.leaves[col];
		if (!student || !leaf) return;
		const key = cellKey(student.id, leaf.id);
		if (raw.trim() === '') {
			delete this.marks[key];
			return;
		}
		if (!/^\d+$/.test(raw.trim())) {
			this.message = { text: `"${raw}" isn't a whole number — cell left unchanged.`, tone: 'warn' };
			return;
		}
		let value = parseInt(raw.trim(), 10);
		const max = leaf.marks;
		if (max != null && value > max) {
			if (this.config.maxPolicy === 'reject') {
				this.flash(student.id, leaf.id, 'reject');
				return;
			}
			if (this.config.maxPolicy === 'clamp') {
				value = max;
				this.flash(student.id, leaf.id, 'clamp');
			}
			// 'flag': commit as-is, isOverMax() renders the persistent flag.
		}
		this.marks[key] = value;
	}

	startEditingWithDigit(digit: string) {
		if (this.cursor.col < 0) return;
		this.editing = { row: this.cursor.row, col: this.cursor.col, value: digit, selectAll: false };
	}

	startEditingName(initial: string) {
		this.addingId = null;
		if (!this.students[this.cursor.row]) {
			this.addStudent(initial);
			return;
		}
		this.editing = { row: this.cursor.row, col: -1, value: initial, selectAll: false };
	}

	startEditingBlank() {
		const student = this.students[this.cursor.row];
		if (this.cursor.col < 0) {
			if (!this.allowNameEdit || !student) return;
			this.addingId = null;
			this.editing = { row: this.cursor.row, col: -1, value: student.name, selectAll: true };
			return;
		}
		const leaf = this.leaves[this.cursor.col];
		const current = student && leaf ? this.markAt(student.id, leaf.id) : undefined;
		this.editing = {
			row: this.cursor.row,
			col: this.cursor.col,
			value: current?.toString() ?? '',
			selectAll: true
		};
	}

	updateEditingValue(value: string) {
		if (this.editing) this.editing.value = value;
	}

	commitEditing() {
		if (!this.editing) return;
		this.commitValue(this.editing.row, this.editing.col, this.editing.value);
		this.editing = null;
	}

	clearCursorCell() {
		if (this.cursor.col < 0) return;
		this.commitValue(this.cursor.row, this.cursor.col, '');
	}

	cancelEditing() {
		const editing = this.editing;
		this.editing = null;
		if (editing?.col === -1 && this.students[editing.row]?.name === '') {
			// Escape on a row that was never named: same as committing it blank.
			this.commitValue(editing.row, -1, '');
		}
	}

	handleKeydown(e: KeyboardEvent) {
		const editing = this.editing;

		if (e.key === 'Escape') {
			this.cancelEditing();
			e.preventDefault();
			return;
		}

		if (e.key === 'Enter') {
			const addingId = this.addingId;
			const wasAdding =
				editing?.col === -1 && addingId != null && this.students[editing.row]?.id === addingId;
			this.commitEditing();
			e.preventDefault();
			if (wasAdding && this.students.some((s) => s.id === addingId)) {
				// Roster entry flow: name, Enter, next name, Enter… a blank Enter ends it.
				this.addStudent();
				return;
			}
			this.addingId = null;
			this.moveCursor(1, 0);
			return;
		}

		if (e.key === 'Tab') {
			if (this.config.keymap === 'apg') {
				// APG grid pattern: Tab leaves the widget entirely — let the browser move focus on.
				this.commitEditing();
				return;
			}
			this.commitEditing();
			this.moveCursor(0, e.shiftKey ? -1 : 1, { wrapToNextRow: true });
			e.preventDefault();
			return;
		}

		if (editing) {
			// Let the proxy's own input handling manage text entry while editing.
			return;
		}

		switch (e.key) {
			case 'ArrowUp':
				this.moveCursor(-1, 0);
				e.preventDefault();
				return;
			case 'ArrowDown':
				this.moveCursor(1, 0);
				e.preventDefault();
				return;
			case 'ArrowLeft':
				this.moveCursor(0, -1);
				e.preventDefault();
				return;
			case 'ArrowRight':
				this.moveCursor(0, 1);
				e.preventDefault();
				return;
			case 'Backspace':
			case 'Delete':
				this.clearCursorCell();
				e.preventDefault();
				return;
			case 'F2':
				this.startEditingBlank();
				e.preventDefault();
				return;
			default:
				if (e.ctrlKey || e.metaKey || e.altKey) return;
				if (this.cursor.col === -1 && this.allowNameEdit && e.key.length === 1 && e.key !== ' ') {
					this.startEditingName(e.key);
					e.preventDefault();
					return;
				}
				if (/^[0-9]$/.test(e.key)) {
					this.startEditingWithDigit(e.key);
					e.preventDefault();
				}
		}
	}

	private parsePastedBlock(text: string): string[][] {
		const normalised = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
		const lines = normalised.split('\n');
		while (lines.length && lines[lines.length - 1] === '') lines.pop();
		return lines.map((line) => line.split('\t'));
	}

	private parsePastedHtml(html: string): string[][] | null {
		try {
			const doc = new DOMParser().parseFromString(html, 'text/html');
			const table = doc.querySelector('table');
			if (!table) return null;
			const rows = [...table.querySelectorAll('tr')];
			if (!rows.length) return null;
			return rows.map((tr) =>
				[...tr.querySelectorAll('td,th')].map((td) => td.textContent?.trim() ?? '')
			);
		} catch {
			return null;
		}
	}

	handlePaste(e: ClipboardEvent) {
		e.preventDefault();
		const html = e.clipboardData?.getData('text/html');
		const text = e.clipboardData?.getData('text/plain') ?? '';
		const grid = (html ? this.parsePastedHtml(html) : null) ?? this.parsePastedBlock(text);
		if (!grid.length) return;

		if (this.cursor.col === -1) {
			this.pasteNames(grid);
			return;
		}
		this.pasteMarks(grid);
	}

	private pasteNames(grid: string[][]) {
		this.snapshotForUndo();
		const names = grid.map((row) => row[0]).filter((n) => n && n.trim() !== '');
		let row = this.cursor.row;
		let added = 0;
		for (const name of names) {
			if (row < this.students.length) {
				this.students[row] = { ...this.students[row], name: name.trim() };
			} else {
				this.students.push({ id: `s-new-${Date.now()}-${added}`, name: name.trim() });
				added++;
			}
			row++;
		}
		this.message = {
			text:
				added > 0
					? `Pasted ${names.length} names — added ${added} new student row(s).`
					: `Pasted ${names.length} names.`,
			tone: 'info'
		};
	}

	private pasteMarks(grid: string[][]) {
		const width = grid[0]?.length ?? 0;
		const availableCols = this.leaves.length - this.cursor.col;
		const availableRows = this.students.length - this.cursor.row;
		const tooWide = width > availableCols;

		if (tooWide && this.config.pasteWidthPolicy === 'abort') {
			this.message = {
				text: `Paste aborted: ${width} columns pasted but only ${availableCols} available from here.`,
				tone: 'warn'
			};
			return;
		}

		this.snapshotForUndo();
		const usedCols = tooWide ? availableCols : width;
		const extraRows = Math.max(0, grid.length - availableRows);

		for (let r = 0; r < grid.length; r++) {
			const studentIndex = this.cursor.row + r;
			let student = this.students[studentIndex];
			if (!student) {
				student = { id: `s-new-${Date.now()}-${r}`, name: `New student ${studentIndex + 1}` };
				this.students.push(student);
			}
			for (let c = 0; c < usedCols; c++) {
				const raw = grid[r][c] ?? '';
				if (raw.trim() === '') continue;
				this.commitValue(studentIndex, this.cursor.col + c, raw);
			}
		}

		const parts: string[] = [`Pasted ${grid.length}×${width} block.`];
		if (extraRows > 0) parts.push(`added ${extraRows} student row(s).`);
		if (tooWide)
			parts.push(`clipped to ${usedCols} of ${width} columns — paste was wider than the grid.`);
		this.message = { text: parts.join(' '), tone: tooWide ? 'warn' : 'info' };
	}

	dismissMessage() {
		this.message = null;
	}
}

export function createGridEngine(leaves: ParseQuestion[], students: Student[]) {
	return new GridEngine(leaves, students);
}
