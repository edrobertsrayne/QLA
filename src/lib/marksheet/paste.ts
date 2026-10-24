// Pasting a block from a spreadsheet: reading the clipboard's table, and the
// account of what one paste did.
//
// Clipboard payloads have no single shape: Excel and Sheets put a table in
// `text/html` as well as tab-separated text in `text/plain`. The HTML is the
// better source when it is there, because a cell containing a line break stays
// one cell there and would otherwise shift every row after it. Reading is pure
// and separate from the store, so the store's block application can be tested
// over plain rows.

import { isOverMax, putMark, readMarkText, removeMark, tierEntries } from './document.js';
import type { MarksheetDocument, TierIndex } from './document.js';
import { newStudent, readName } from './students.js';
import { agree, count } from '$lib/prose.js';

/** The part of `DataTransfer` a paste needs: both flavours of the same block. */
export interface ClipboardDataLike {
	getData(type: string): string;
}

/** Where a pasted block starts. */
export type PasteAnchor =
	/** A block whose first column is names, from a student's row or (null) below the class. */
	| { kind: 'names'; studentId: string | null }
	/** A block of marks from one cell onwards. */
	| { kind: 'marks'; studentId: string; entryId: string };

/** One pasted value that was not a mark, and where in the block it sat. */
export interface RefusedPasteCell {
	/** 1-based row within the pasted block. */
	row: number;
	/** 1-based column within the pasted block, the name column included. */
	column: number;
	value: string;
}

/** What one paste did, in the terms a message beside the grid needs. */
export interface PasteResult {
	/** Whether the document changed; a block of refusals changes nothing. */
	changed: boolean;
	marksStored: number;
	marksCleared: number;
	/** Stored marks above their entry's available marks, which the grid flags. */
	overMax: number;
	studentsAdded: number;
	/** Uploaded names left out because the class already had them. */
	duplicatesSkipped: number;
	/** Rows past the class with no name to give a student. */
	rowsDropped: number;
	/** Pasted columns past the last entry, with no column to land in. */
	columnsClipped: number;
	refused: RefusedPasteCell[];
}

/** A paste with nothing in it yet: the seed the counts are added to, and the answer when none can be. */
export function emptyPasteResult(): PasteResult {
	return {
		changed: false,
		marksStored: 0,
		marksCleared: 0,
		overMax: 0,
		studentsAdded: 0,
		duplicatesSkipped: 0,
		rowsDropped: 0,
		columnsClipped: 0,
		refused: []
	};
}

/**
 * One cell's text. A spreadsheet puts line breaks inside a cell either as `<br>`
 * or as stacked block elements; both are read as a newline *inside* the cell, so
 * a multi-line cell lands in one cell rather than shifting the rows after it.
 */
function cellText(cell: Element): string {
	const clone = cell.cloneNode(true) as Element;
	for (const lineBreak of [...clone.querySelectorAll('br')]) {
		lineBreak.replaceWith('\n');
	}
	for (const block of [...clone.querySelectorAll('div, p, li')]) {
		block.append('\n');
	}
	return (clone.textContent ?? '').replace(/\u00a0/g, ' ');
}

/** The first table in the clipboard's HTML, as rows of cell text. */
function htmlGrid(html: string): string[][] {
	const parsed = new DOMParser().parseFromString(html, 'text/html');
	const table = parsed.querySelector('table');
	if (!table) return [];

	return [...table.querySelectorAll('tr')].map((row) => {
		const cells = [...row.children].filter(
			(child) => child.tagName === 'TD' || child.tagName === 'TH'
		);
		return cells.map(cellText);
	});
}

/** Tab-separated text, with Windows and old-Mac line endings read as line breaks. */
export function textGrid(text: string): string[][] {
	return text
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map((line) => line.split('\t'));
}

/**
 * Read a clipboard payload as a block of cells. HTML wins when it holds a
 * table; otherwise the plain-text TSV is used. Trailing empty cells and rows
 * are dropped, so the newline every spreadsheet appends cannot add a phantom
 * row at the foot of the paste.
 */
export function clipboardGrid(clipboard: ClipboardDataLike | null | undefined): string[][] {
	if (!clipboard) return [];

	const html = clipboard.getData('text/html');
	const fromHtml = html === '' ? [] : trimPasteGrid(htmlGrid(html));
	if (fromHtml.length > 0) return fromHtml;
	return trimPasteGrid(textGrid(clipboard.getData('text/plain')));
}

/** Normalise a block for application: no trailing empty cells, no trailing empty rows. */
export function trimPasteGrid(rows: readonly (readonly string[])[]): string[][] {
	const trimmed = rows.map((row) => {
		const cells = row.map((cell) => cell.trim());
		while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
		return cells;
	});
	while (trimmed.length > 0 && trimmed[trimmed.length - 1].every((cell) => cell === '')) {
		trimmed.pop();
	}
	return trimmed;
}

/**
 * Apply a block to one tier's grid in place, and say what it did. A block
 * anchored in the name column reads its first column as names, mapped the way
 * a pasted class list is; every other block reads every column as marks from
 * the anchor's entry onwards. Rows line up with that tier's students, and a
 * pasted row past the class becomes a student on that tier.
 *
 * Pasted columns past the last entry are clipped. A cell that is not a whole
 * number is refused on its own and leaves the sheet as it was, while an empty
 * cell clears a mark — the same rules as typing, applied a block at a time.
 */
export function applyPaste(
	document: MarksheetDocument,
	rows: readonly (readonly string[])[],
	anchor: PasteAnchor,
	tier: TierIndex
): PasteResult {
	const result = emptyPasteResult();
	// No such tier is no grid: a paste must not add students or marks to a tier
	// the assessment does not have.
	if (document.tiers[tier] === undefined) return result;

	const students = document.students.filter((student) => student.tier === tier);
	// No student to anchor on starts the block below the class: only a block
	// that begins with names can do that, and it is how an empty class is built.
	const anchorRow =
		anchor.studentId === null
			? students.length
			: students.findIndex((student) => student.id === anchor.studentId);
	if (anchorRow === -1) return result;

	const entries = tierEntries(document, tier);
	const startsWithName = anchor.kind === 'names';
	const firstEntry = startsWithName ? 0 : entries.findIndex((entry) => entry.id === anchor.entryId);
	if (firstEntry === -1) return result;

	const block = trimPasteGrid(rows);
	if (block.length === 0) return result;

	const entriesFromAnchor = entries.slice(firstEntry);
	/** The first column of each row that holds a mark: past the name, or the block itself. */
	const firstMarkColumn = startsWithName ? 1 : 0;
	const pastedMarkColumns = Math.max(...block.map((row) => row.length - firstMarkColumn), 0);
	result.columnsClipped = Math.max(0, pastedMarkColumns - entriesFromAnchor.length);

	block.forEach((row, rowIndex) => {
		const name = startsWithName ? (row[0] ?? '') : '';
		let target = students[anchorRow + rowIndex];

		if (!target) {
			// A row with no cells at all is a blank line: nothing to count. Past
			// that, a mark-anchored block has no name for a student it would add; a
			// name-anchored one does, but only when the row names someone. A
			// cell that is blank or only punctuation is not a student.
			if (row.length === 0) return;
			const parsedName = startsWithName ? readName(name) : null;
			if (!parsedName) {
				result.rowsDropped += 1;
				return;
			}
			target = newStudent(parsedName, tier);
			document.students.push(target);
			students.push(target);
			result.studentsAdded += 1;
			result.changed = true;
		}

		for (let column = 0; column < pastedMarkColumns; column++) {
			const entry = entriesFromAnchor[column];
			if (!entry) break;

			const raw = row[firstMarkColumn + column];
			if (raw === undefined) continue;
			const read = readMarkText(raw);

			if (read.kind === 'clear') {
				if (!removeMark(document.marks, target.id, entry.id)) continue;
				result.marksCleared += 1;
				result.changed = true;
				continue;
			}

			if (read.kind === 'refused') {
				result.refused.push({
					row: rowIndex + 1,
					column: firstMarkColumn + column + 1,
					value: raw
				});
				continue;
			}

			if (!putMark(document.marks, target.id, entry.id, read.mark)) continue;
			result.marksStored += 1;
			result.changed = true;
			if (isOverMax(read.mark, entry)) result.overMax += 1;
		}
	});

	return result;
}

/** What a paste did, in sentences: the headline, and what it could not do. */
export function describePaste(result: PasteResult): { summary: string; losses: string[] } {
	const parts: string[] = [];
	if (result.marksStored > 0) {
		parts.push(`pasted ${count(result.marksStored, 'mark')}`);
	}
	if (result.marksCleared > 0) {
		parts.push(`cleared ${count(result.marksCleared, 'mark')}`);
	}
	if (result.studentsAdded > 0) {
		parts.push(`added ${count(result.studentsAdded, 'student')}`);
	}
	if (result.duplicatesSkipped > 0) {
		parts.push(`skipped ${count(result.duplicatesSkipped, 'duplicate')}`);
	}
	let summary = 'Nothing was pasted.';
	if (parts.length > 0) {
		const sentence = parts.join(', ');
		summary = `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
	}

	const losses: string[] = [];
	if (result.columnsClipped > 0) {
		const n = result.columnsClipped;
		losses.push(`${count(n, 'column')} past the last entry ${agree(n, 'was', 'were')} dropped.`);
	}
	if (result.rowsDropped > 0) {
		const n = result.rowsDropped;
		losses.push(
			`${count(n, 'pasted row')} had no name to make a student, so ${agree(n, 'it was', 'they were')} not added.`
		);
	}
	if (result.overMax > 0) {
		const n = result.overMax;
		losses.push(
			`${count(n, 'mark')} above the available marks ${agree(n, 'is', 'are')} flagged in the grid.`
		);
	}
	return { summary, losses };
}
