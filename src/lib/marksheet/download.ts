// The files QLA hands the browser, and the one call that hands them over.
//
// What a file is called and what it holds are built here as plain values, so
// what a download would contain is testable without a browser; `saveFile` is the
// only part that touches the DOM. Backup and marks export are told apart in the
// Downloads folder as well as in the app, because that is where they are picked
// up at restore time.

import { CORRUPT_KEY_PREFIX, totalMarks, type MarksheetDocument } from './document.js';

/** A file the browser will save: its name, its body, and what it is. */
export interface QlaFile {
	filename: string;
	text: string;
	type: string;
}

/** A name that survives a Downloads folder: no spaces, nothing a filesystem refuses. */
function slug(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/** One part of a filename: sanitised, or the fallback word when there is nothing to take. */
function slugOr(value: string | null, fallback: string): string {
	return slug(value ?? '') || fallback;
}

/** The local day a file was made, as `2026-01-01`. */
function dayStamp(at: Date): string {
	const month = String(at.getMonth() + 1).padStart(2, '0');
	const day = String(at.getDate()).padStart(2, '0');
	return `${at.getFullYear()}-${month}-${day}`;
}

/**
 * A backup of the document as it stands: byte-identical to what storage holds,
 * so restoring it brings back exactly what the teacher had.
 */
export function backupFile(document: MarksheetDocument, now: Date): QlaFile {
	return {
		filename: `qla-backup-${slugOr(document.paper.label, 'marksheet')}-${dayStamp(now)}.json`,
		text: JSON.stringify(document),
		type: 'application/json'
	};
}

/** A cell as it has to be written: quoted when a comma, a quote or a line break would split the row. */
function csvCell(value: string): string {
	return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/**
 * The marksheet's marks as a spreadsheet reads them: one row per student in
 * display order, one column per breakdown entry in breakdown order, and a `Max`
 * row under the header saying what each column is out of.
 *
 * Lossy and one-way, by design: an unmarked cell is empty, an absent student is
 * flagged rather than dropped, and the total is the marks exactly as entered —
 * no band, no facility, nothing that could be read back as a marksheet.
 */
export function marksCsvFile(document: MarksheetDocument): QlaFile {
	const entries = document.breakdown.entries;
	const rows = document.students.map((student) => {
		const marks = entries.map((entry) => document.marks[student.id]?.[entry.id]);
		return [
			student.surname,
			student.firstName,
			student.absent ? 'Y' : '',
			...marks.map((mark) => (mark === undefined ? '' : String(mark))),
			String(marks.reduce((sum, mark) => sum + (mark ?? 0), 0))
		];
	});
	const maxima = entries.map((entry) => (entry.marks === null ? '' : String(entry.marks)));

	return {
		filename: `${slugOr(document.paper.label, 'marksheet')}-${slugOr(
			document.paper.className,
			'class'
		)}-marks.csv`,
		text:
			[
				['Surname', 'First name', 'Absent', ...entries.map((entry) => entry.label), 'Total'],
				['Max', '', '', ...maxima, String(totalMarks(entries))],
				...rows
			]
				.map((row) => row.map(csvCell).join(','))
				.join('\r\n') + '\r\n',
		type: 'text/csv'
	};
}

/** The raw text of a document this app could not read, out of its preserved copy. */
export function corruptFile(preservedKey: string, raw: string): QlaFile {
	const stamp = preservedKey.startsWith(CORRUPT_KEY_PREFIX)
		? preservedKey.slice(CORRUPT_KEY_PREFIX.length)
		: preservedKey;
	return {
		filename: `qla-corrupt-${stamp.replace(/:/g, '-')}.json`,
		text: raw,
		type: 'application/json'
	};
}

/**
 * Hand a file to the browser. The blob URL is released on the next turn rather
 * than at once: some browsers drop a download whose blob is revoked in the same
 * task as the click that started it.
 */
export function saveFile(file: QlaFile): void {
	const url = URL.createObjectURL(new Blob([file.text], { type: file.type }));
	const link = document.createElement('a');
	link.href = url;
	link.download = file.filename;
	link.rel = 'noopener';
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 0);
}
