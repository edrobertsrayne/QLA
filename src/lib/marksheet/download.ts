// The files QLA hands the browser, and the one call that hands them over.
//
// What a file is called and what it holds are built here as plain values, so
// what a download would contain is testable without a browser; `saveFile` is the
// only part that touches the DOM. Backup and marks export are told apart in the
// Downloads folder as well as in the app, because that is where they are picked
// up at restore time.

import {
	analyseCommonQuestions,
	analyseTier,
	facilityPercent,
	notScoredLabel
} from './analysis.js';
import { entryName } from './breakdown.js';
import {
	CORRUPT_KEY_PREFIX,
	tierEntries,
	totalMarks,
	type MarksheetDocument,
	type TierIndex
} from './document.js';
import { studentName, type StudentName } from './students.js';

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

/** `qla-<kind>-<paper>-<day>.<extension>`: how every export of the current paper is named. */
export function exportFilename(
	kind: string,
	document: MarksheetDocument,
	now: Date,
	extension: string,
	...also: string[]
): string {
	return [
		'qla',
		kind,
		slugOr(document.label, 'marksheet'),
		...also,
		`${dayStamp(now)}.${extension}`
	].join('-');
}

/**
 * A backup of the document as it stands: byte-identical to what storage holds,
 * so restoring it brings back exactly what the teacher had.
 */
export function backupFile(document: MarksheetDocument, now: Date): QlaFile {
	return {
		filename: `qla-backup-${slugOr(document.label, 'marksheet')}-${dayStamp(now)}.json`,
		text: JSON.stringify(document),
		type: 'application/json'
	};
}

/** A cell as it has to be written: quoted when a comma, a quote or a line break would split the row. */
function csvCell(value: string): string {
	// Spreadsheets evaluate a cell starting with a formula marker. A leading
	// apostrophe keeps paper- or model-derived text text — but a signed number
	// is a figure the teacher sorts, so it stays one.
	const formula = /^[=+\-@\t\r]/.test(value);
	const signedNumber = /^-?\d+(\.\d+)?$/.test(value);
	const safe = formula && !signedNumber ? `'${value}` : value;
	return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/**
 * One tier's marks as a spreadsheet reads them: one row per student on that
 * tier in display order, one column per entry on that tier in breakdown order,
 * and a `Max` row under the header saying what each column is out of.
 *
 * Lossy and one-way, by design: an unmarked cell is empty, an absent student is
 * flagged rather than dropped, and the total is the marks exactly as entered —
 * no band, no facility, nothing that could be read back as a marksheet.
 */
export function marksCsvFile(document: MarksheetDocument, tier: TierIndex): QlaFile {
	const entries = tierEntries(document, tier);
	const students = document.students.filter((student) => student.tier === tier);
	const rows = students.map((student) => {
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
	const tierSlug = slug(document.tiers[tier]?.tierName ?? '');

	return {
		filename: [
			slugOr(document.label, 'marksheet'),
			slugOr(document.className, 'class'),
			...(tierSlug === '' ? [] : [tierSlug]),
			'marks.csv'
		].join('-'),
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

/**
 * One tier's analysis figures as a spreadsheet reads them: one row per entry
 * on that tier, in breakdown order, every entry included. A missing field is
 * an empty cell. Lossy and one-way like the marks export, and like it, it
 * takes no part in the backup: nothing here marks a backup as taken.
 */
export function analysisCsvFile(document: MarksheetDocument, tier: TierIndex, now: Date): QlaFile {
	const rows = analyseTier(document, tier).entries.map((row) => [
		entryName(row.entry),
		row.entry.questionNumber,
		row.entry.summary,
		row.entry.marks === null ? '' : String(row.entry.marks),
		row.entry.specPoint ?? '',
		row.entry.ao ?? '',
		row.facility === null ? '' : String(facilityPercent(row.facility)),
		row.mean === null ? '' : row.mean.toFixed(2),
		row.band ?? '',
		String(row.coverage.marked),
		String(row.coverage.of),
		row.coverage.partMarked ? 'yes' : 'no',
		String(row.overMax),
		row.notScored === null ? '' : notScoredLabel(row)
	]);
	return {
		filename: exportFilename('analysis', document, now, 'csv'),
		text:
			[
				[
					'Question',
					'Q number',
					'Summary',
					'Available marks',
					'Spec point',
					'AO',
					'Facility %',
					'Mean mark',
					'Band',
					'Marked',
					'Of',
					'Part-marked',
					'Over-max marks',
					'Not-scored reason'
				],
				...rows
			]
				.map((row) => row.map(csvCell).join(','))
				.join('\r\n') + '\r\n',
		type: 'text/csv'
	};
}

/** How the common-questions export names a tier that has no printed name. */
function tierHeading(document: MarksheetDocument, tier: TierIndex): string {
	const name = document.tiers[tier]?.tierName?.trim() ?? '';
	return name === '' ? `Tier ${tier + 1}` : name;
}

/**
 * The common questions as a spreadsheet reads them: one row per pair in Tier
 * 1's paper order. Each tier's own figures sit beside the pooled figure and
 * the gap, so the comparison stands without the app. Summary, spec point and
 * AO come from Tier 1; a tier with no printed name is headed `Tier N`.
 */
export function commonQuestionsCsvFile(document: MarksheetDocument, now: Date): QlaFile {
	const tier1 = tierHeading(document, 0);
	const tier2 = tierHeading(document, 1);
	const rows = analyseCommonQuestions(document).map((row) => [
		row.tier1.entry.label,
		row.tier2.entry.label,
		row.tier1.entry.summary,
		row.tier1.entry.marks === null ? '' : String(row.tier1.entry.marks),
		row.tier1.entry.specPoint ?? '',
		row.tier1.entry.ao ?? '',
		row.tier1.analysis.facility === null
			? ''
			: String(facilityPercent(row.tier1.analysis.facility)),
		row.tier1.analysis.band ?? '',
		String(row.tier1.analysis.coverage.marked),
		String(row.tier1.analysis.coverage.of),
		row.tier2.analysis.facility === null
			? ''
			: String(facilityPercent(row.tier2.analysis.facility)),
		row.tier2.analysis.band ?? '',
		String(row.tier2.analysis.coverage.marked),
		String(row.tier2.analysis.coverage.of),
		row.pooled.facility === null ? '' : String(facilityPercent(row.pooled.facility)),
		row.pooled.band ?? '',
		row.gap === null ? '' : String(row.gap),
		row.pooled.partMarked ? 'yes' : 'no'
	]);
	return {
		filename: exportFilename('common-questions', document, now, 'csv'),
		text:
			[
				[
					`${tier1} question`,
					`${tier2} question`,
					'Summary',
					'Available marks',
					'Spec point',
					'AO',
					`${tier1} facility %`,
					`${tier1} band`,
					`${tier1} marked`,
					`${tier1} of`,
					`${tier2} facility %`,
					`${tier2} band`,
					`${tier2} marked`,
					`${tier2} of`,
					'Pooled facility %',
					'Pooled band',
					`Gap (${tier1} − ${tier2}, points)`,
					'Part-marked'
				],
				...rows
			]
				.map((row) => row.map(csvCell).join(','))
				.join('\r\n') + '\r\n',
		type: 'text/csv'
	};
}

/** The name of one student's report PDF. */
export function reportPdfFilename(
	document: MarksheetDocument,
	student: StudentName,
	now: Date
): string {
	return exportFilename('report', document, now, 'pdf', slugOr(studentName(student), 'student'));
}

/** The raw text of a document this app could not read, out of its preserved copy. */
export function corruptFile(preservedKey: string | null, raw: string): QlaFile {
	const stamp = preservedKey?.startsWith(CORRUPT_KEY_PREFIX)
		? preservedKey.slice(CORRUPT_KEY_PREFIX.length)
		: preservedKey;
	return {
		filename: stamp ? `qla-corrupt-${stamp.replace(/:/g, '-')}.json` : 'qla-corrupt.json',
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
	saveBlob(file.filename, new Blob([file.text], { type: file.type }));
}

/** Hand a binary file (a PDF, a zip) to the browser, the same way. */
export function saveBlob(filename: string, blob: Blob): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.rel = 'noopener';
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 0);
}
