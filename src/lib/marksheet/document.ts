// The stored marksheet document: one versioned JSON blob in browser storage.
//
// This module owns the document's shape and the single validator used both by
// boot-time load and (later) backup restore, so a file we accept from disk is
// the same thing we accept from storage. It has no I/O and no reactive state.

import {
	assessmentObjectiveOf,
	type AssessmentObjective
} from '$lib/parse/assessment-objectives.js';
import { isRecord } from '$lib/parse/is-breakdown.js';

/** localStorage key holding the marksheet document. */
export const STORAGE_KEY = 'qla:marksheet:v1';

/** Keys unreadable documents are preserved under, suffixed with an ISO timestamp. */
export const CORRUPT_KEY_PREFIX = 'qla:marksheet:corrupt:';

/** Only version we know how to read. Anything else is treated as unreadable. */
export const DOCUMENT_SCHEMA_VERSION = 1;

/**
 * One column of a marksheet: an undivided question or a marked subquestion.
 * `id` is generated on this device and is the stable key marks are filed under —
 * it is never the label, so editing a label moves no marks.
 */
export interface BreakdownEntry {
	id: string;
	/** Verbatim label from the parse, editable, display only. */
	label: string;
	/** The question this entry bands under (ADR 0002). */
	questionNumber: string;
	/** Null only before confirmation. */
	marks: number | null;
	summary: string;
	specPoint: string | null;
	commandWord: string | null;
	ao: AssessmentObjective | null;
}

/**
 * A parse finding, kept with its entry: `questionId` is the entry's generated
 * id (or null for run-level findings), rewritten from the parse label on import
 * so warnings follow their entry through label edits.
 */
export interface StoredWarning {
	questionId: string | null;
	code: string;
	message: string;
}

export interface StoredPaper {
	label: string | null;
	className: string | null;
	sourceFilenames: string[];
	parsedAt: string;
}

export interface StoredStudent {
	id: string;
	firstName: string;
	surname: string;
	absent: boolean;
}

/** The breakdown as stored: its entries, and the findings the parse left beside them. */
export interface StoredBreakdown {
	entries: BreakdownEntry[];
	warnings: StoredWarning[];
}

export interface MarksheetDocument {
	schemaVersion: number;
	createdAt: string;
	updatedAt: string;
	/** Null while the breakdown is still under review. */
	breakdownConfirmedAt: string | null;
	/** Last backup download. Marks export never touches it. */
	lastExportedAt: string | null;
	paper: StoredPaper;
	breakdown: StoredBreakdown;
	/** Array order is display order. */
	students: StoredStudent[];
	/** Sparse: `marks[studentId][entryId]`, absent key = unmarked. */
	marks: Record<string, Record<string, number>>;
}

function isStringOrNull(value: unknown): value is string | null {
	return value === null || typeof value === 'string';
}

function isAssessmentObjective(value: unknown): value is AssessmentObjective {
	return typeof value === 'string' && assessmentObjectiveOf(value) !== null;
}

/** Parse every item, or nothing: one unreadable item makes the whole document unreadable. */
function parseAll<T>(values: unknown[], parse: (value: unknown) => T | null): T[] | null {
	const parsed: T[] = [];
	for (const value of values) {
		const item = parse(value);
		if (item === null) return null;
		parsed.push(item);
	}
	return parsed;
}

function parseEntry(value: unknown): BreakdownEntry | null {
	if (!isRecord(value)) return null;
	const { id, label, questionNumber, marks, summary, specPoint, commandWord, ao } = value;
	if (typeof id !== 'string' || id === '') return null;
	if (typeof label !== 'string') return null;
	if (typeof questionNumber !== 'string') return null;
	if (marks !== null && !(typeof marks === 'number' && Number.isInteger(marks))) return null;
	if (typeof summary !== 'string') return null;
	if (!isStringOrNull(specPoint) || !isStringOrNull(commandWord)) return null;
	if (ao !== null && !isAssessmentObjective(ao)) return null;
	return {
		id,
		label,
		questionNumber,
		marks: marks as number | null,
		summary,
		specPoint,
		commandWord,
		ao
	};
}

function parseWarning(value: unknown): StoredWarning | null {
	if (!isRecord(value)) return null;
	const { questionId, code, message } = value;
	if (!isStringOrNull(questionId)) return null;
	if (typeof code !== 'string' || typeof message !== 'string') return null;
	return { questionId: questionId as string | null, code, message };
}

function parseStudent(value: unknown): StoredStudent | null {
	if (!isRecord(value)) return null;
	const { id, firstName, surname, absent } = value;
	if (typeof id !== 'string' || id === '') return null;
	if (typeof firstName !== 'string' || typeof surname !== 'string') return null;
	if (typeof absent !== 'boolean') return null;
	return { id, firstName, surname, absent };
}

function parseMarks(value: unknown): Record<string, Record<string, number>> | null {
	if (!isRecord(value)) return null;
	const marks: Record<string, Record<string, number>> = {};
	for (const [studentId, byEntry] of Object.entries(value)) {
		if (!isRecord(byEntry)) return null;
		const studentMarks: Record<string, number> = {};
		for (const [entryId, mark] of Object.entries(byEntry)) {
			if (typeof mark !== 'number' || !Number.isInteger(mark) || mark < 0) return null;
			studentMarks[entryId] = mark;
		}
		marks[studentId] = studentMarks;
	}
	return marks;
}

/**
 * The one "is this a valid document" check, shared by boot-time load and
 * restore. Returns a fresh document with only known fields, or null when the
 * value is not a document we can read (wrong version included).
 */
function parseDocumentValue(value: unknown): MarksheetDocument | null {
	if (!isRecord(value)) return null;
	if (value['schemaVersion'] !== DOCUMENT_SCHEMA_VERSION) return null;

	const createdAt = value['createdAt'];
	const updatedAt = value['updatedAt'];
	const breakdownConfirmedAt = value['breakdownConfirmedAt'];
	const lastExportedAt = value['lastExportedAt'];
	if (typeof createdAt !== 'string' || typeof updatedAt !== 'string') return null;
	if (!isStringOrNull(breakdownConfirmedAt) || !isStringOrNull(lastExportedAt)) return null;

	const paper = value['paper'];
	if (!isRecord(paper)) return null;
	const { label, className, sourceFilenames, parsedAt } = paper;
	if (!isStringOrNull(label) || !isStringOrNull(className)) return null;
	if (!Array.isArray(sourceFilenames) || !sourceFilenames.every((n) => typeof n === 'string')) {
		return null;
	}
	if (typeof parsedAt !== 'string') return null;

	const breakdown = value['breakdown'];
	if (!isRecord(breakdown)) return null;
	const rawEntries = breakdown['entries'];
	const rawWarnings = breakdown['warnings'];
	if (!Array.isArray(rawEntries) || !Array.isArray(rawWarnings)) return null;
	const entries = parseAll(rawEntries, parseEntry);
	const warnings = parseAll(rawWarnings, parseWarning);
	if (!entries || !warnings) return null;

	const rawStudents = value['students'];
	if (!Array.isArray(rawStudents)) return null;
	const students = parseAll(rawStudents, parseStudent);
	if (!students) return null;

	const marks = parseMarks(value['marks']);
	if (!marks) return null;

	return {
		schemaVersion: DOCUMENT_SCHEMA_VERSION,
		createdAt,
		updatedAt,
		breakdownConfirmedAt,
		lastExportedAt,
		paper: { label, className, sourceFilenames: [...sourceFilenames], parsedAt },
		breakdown: { entries, warnings },
		students,
		marks
	};
}

/** The one validator: parse stored (or restored) document text, or null when unreadable. */
export function parseStoredDocument(raw: string): MarksheetDocument | null {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return null;
	}
	return parseDocumentValue(value);
}

/**
 * Drop marks pointing at a student or entry that no longer exists. Reached
 * data raises no error and is never shown, so it is thrown away on load rather
 * than carried around.
 */
export function dropUnreachableMarks(document: MarksheetDocument): MarksheetDocument {
	const studentIds = new Set(document.students.map((student) => student.id));
	const entryIds = new Set(document.breakdown.entries.map((entry) => entry.id));
	const marks: Record<string, Record<string, number>> = {};
	for (const [studentId, byEntry] of Object.entries(document.marks)) {
		if (!studentIds.has(studentId)) continue;
		const kept: Record<string, number> = {};
		for (const [entryId, mark] of Object.entries(byEntry)) {
			if (entryIds.has(entryId)) kept[entryId] = mark;
		}
		marks[studentId] = kept;
	}
	return { ...document, marks };
}

/** What the breakdown adds up to: the marks a marksheet's columns carry. */
export function totalMarks(entries: BreakdownEntry[]): number {
	return entries.reduce((sum, entry) => sum + (entry.marks ?? 0), 0);
}

/** Seed the paper label from an uploaded filename: `10X Ph1.pdf` → `10X Ph1`. */
export function labelFromFilename(filename: string | undefined): string | null {
	if (filename === undefined) return null;
	const withoutExtension = filename.replace(/\.[^./\\]+$/, '').trim();
	return withoutExtension === '' ? null : withoutExtension;
}
