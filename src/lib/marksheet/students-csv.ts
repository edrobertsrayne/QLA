// Reading a class list from a CSV file: two columns, first name then surname.
//
// Pure, like the other name rules in `students.ts`, so the whole of it can be
// tested without a browser. The strict shape is the point: a file that is not
// exactly two columns is refused whole rather than guessed at.

import { count } from '$lib/prose.js';
import type { StudentName } from './students.js';

/** What the file said, or why it can't be used and nothing should change. */
export type StudentCsv = { ok: true; names: StudentName[] } | { ok: false; error: string };

const BYTE_ORDER_MARK = '\uFEFF';

/**
 * Split CSV text into records of cells, by RFC 4180: a quoted cell may hold
 * commas, line breaks and `""` for a quote; records end at LF or CRLF. Cells
 * are trimmed. Blank lines come back as a record of one empty cell, so a
 * record's index is its row number in the file. Null when a quote never closes.
 */
function parseCsv(text: string): string[][] | null {
	const source = text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text;
	const records: string[][] = [];
	let record: string[] = [];
	let cell = '';
	let quoted = false;
	let pending = false;

	const endCell = () => {
		record.push(cell.trim());
		cell = '';
	};
	const endRecord = () => {
		endCell();
		records.push(record);
		record = [];
		pending = false;
	};

	for (let i = 0; i < source.length; i++) {
		const char = source[i];
		if (quoted) {
			if (char !== '"') cell += char;
			else if (source[i + 1] === '"') {
				cell += '"';
				i++;
			} else quoted = false;
		} else if (char === '"') {
			quoted = true;
			pending = true;
		} else if (char === ',') {
			endCell();
			pending = true;
		} else if (char === '\n' || char === '\r') {
			if (char === '\r' && source[i + 1] === '\n') i++;
			endRecord();
		} else {
			cell += char;
			pending = true;
		}
	}
	if (quoted) return null;
	if (pending) endRecord();
	return records;
}

/**
 * The students a two-column CSV names. The header checkbox, not the content,
 * decides whether row 1 is a header. Blank rows (every cell empty) are ignored;
 * every other row must have exactly two cells, and the first that doesn't
 * rejects the whole file, named by its row number in the file.
 */
export function readStudentCsv(text: string, firstRowIsHeader: boolean): StudentCsv {
	if (text.trim() === '') return { ok: false, error: 'The file is empty.' };
	const records = parseCsv(text);
	if (records === null) {
		return { ok: false, error: 'A quoted cell is never closed, so the file cannot be read.' };
	}

	const names: StudentName[] = [];
	for (const [index, cells] of records.entries()) {
		if (firstRowIsHeader && index === 0) continue;
		if (cells.every((cell) => cell === '')) continue;
		if (cells.length !== 2) {
			return {
				ok: false,
				error: `Row ${index + 1} has ${count(cells.length, 'column')}; expected first name, last name.`
			};
		}
		names.push({ firstName: cells[0], surname: cells[1] });
	}

	if (names.length === 0) {
		return {
			ok: false,
			error: firstRowIsHeader ? 'The file has no names after the header.' : 'The file has no names.'
		};
	}
	return { ok: true, names };
}
