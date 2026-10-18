// Pasting a block from a spreadsheet: reading the clipboard's table, and the
// account of what one paste did.
//
// Clipboard payloads have no single shape: Excel and Sheets put a table in
// `text/html` as well as tab-separated text in `text/plain`. The HTML is the
// better source when it is there, because a cell containing a line break stays
// one cell there and would otherwise shift every row after it. Reading is pure
// and separate from the store, so the store's block application can be tested
// over plain rows.

/** The part of `DataTransfer` a paste needs: both flavours of the same block. */
export interface ClipboardDataLike {
	getData(type: string): string;
}

/** Where a pasted block starts: a student's row, in a mark column or the name column. */
export interface PasteAnchor {
	/** The row the block starts on; null starts below the last student, which is how an empty class is built. */
	studentId: string | null;
	/** The entry the first mark column lands on; null when the block starts with names. */
	entryId: string | null;
}

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
function textGrid(text: string): string[][] {
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
