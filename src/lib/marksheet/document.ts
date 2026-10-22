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

/**
 * The version this app writes. v2 documents, written before changes were
 * tracked, are still read; anything else is treated as unreadable.
 */
export const DOCUMENT_SCHEMA_VERSION = 3;

/** The version written before `firstUnbackedChangeAt` existed. */
const EARLIER_SCHEMA_VERSION = 2;

/** The label for a total below every grade boundary, when the paper has grades. */
export const DEFAULT_BELOW_LOWEST_LABEL = 'U';

/**
 * The editable values of one entry, as the parse produced them and as the
 * teacher leaves them.
 */
export interface EntryValues {
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
 * One column of a marksheet: an undivided question or a marked subquestion.
 * `id` is generated on this device and is the stable key marks are filed under —
 * it is never the label, so editing a label moves no marks.
 */
export interface BreakdownEntry extends EntryValues {
	id: string;
	/**
	 * The parse's own values, so the table can show what the teacher has
	 * changed: `null` for an entry the teacher added, otherwise the parse's values.
	 */
	original: EntryValues | null;
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
	/**
	 * Grade boundaries, top grade first, or null when the paper shows marks
	 * only. A blank row is never stored: it reads as "not used".
	 */
	boundaries: GradeBoundary[] | null;
	/** The label for a total below every boundary. */
	belowLowestLabel: string;
}

/** The minimum total mark on this paper for a grade, in raw marks. */
export interface GradeBoundary {
	label: string;
	minimum: number;
}

export interface StoredStudent {
	id: string;
	firstName: string;
	surname: string;
	absent: boolean;
}

/** A short, student-readable description per assessment objective that has one. */
export type AoDescriptions = Partial<Record<AssessmentObjective, string>>;

/**
 * The breakdown as stored: its entries, the findings the parse left beside
 * them, and the AO descriptions lifted from the specification. The
 * descriptions are display only: reports are written without them.
 */
export interface StoredBreakdown {
	entries: BreakdownEntry[];
	warnings: StoredWarning[];
	aoDescriptions: AoDescriptions;
}

/** One breakdown entry's figures as a report was written from them. */
export interface ReportEntryInput {
	label: string;
	summary: string;
	commandWord: string | null;
	ao: AssessmentObjective | null;
	topics: string[];
	gained: number;
	available: number;
}

/** The generation input a report's prose was written from, verbatim. */
export interface ReportGenerationInput {
	paperLabel: string;
	entries: ReportEntryInput[];
}

/** Generated feedback prose: up to 3 strengths beside up to 2 areas for improvement. */
export interface ReportProse {
	strengths: string[];
	areasForImprovement: string[];
}

/**
 * One student's report: the generated prose, the teacher's edit beside it
 * (null when unedited), the verbatim generation input, the model used
 * (display only) and the generation time.
 */
export interface StoredReport extends ReportProse {
	edit: ReportProse | null;
	input: ReportGenerationInput;
	model: string;
	generatedAt: string;
}

export interface MarksheetDocument {
	schemaVersion: number;
	createdAt: string;
	updatedAt: string;
	/** Null while the breakdown is still under review. */
	breakdownConfirmedAt: string | null;
	/** Last backup download. Marks export never touches it. */
	lastExportedAt: string | null;
	/**
	 * The oldest change the last backup does not hold, or null when it holds
	 * every change. A document that has never been backed up is changed from
	 * `createdAt`, whatever this records.
	 */
	firstUnbackedChangeAt: string | null;
	paper: StoredPaper;
	breakdown: StoredBreakdown;
	/** Array order is display order. */
	students: StoredStudent[];
	/** Sparse: `marks[studentId][entryId]`, absent key = unmarked. */
	marks: Record<string, Record<string, number>>;
	/** Student-readable name per normalised specification-point code. */
	topicNames: Record<string, string>;
	/** One report per student, keyed by student id. */
	reports: Record<string, StoredReport>;
}

function isStringOrNull(value: unknown): value is string | null {
	return value === null || typeof value === 'string';
}

function isAssessmentObjective(value: unknown): value is AssessmentObjective {
	return typeof value === 'string' && assessmentObjectiveOf(value) !== null;
}

/**
 * The fields a teacher can change, listed as a record over `EntryValues` so a
 * field added to an entry cannot be forgotten.
 */
const FIELDS: Record<keyof EntryValues, true> = {
	label: true,
	questionNumber: true,
	marks: true,
	summary: true,
	specPoint: true,
	commandWord: true,
	ao: true
};

/** The editable fields, in a fixed order. */
export const EDITABLE_FIELDS = Object.keys(FIELDS) as EditableField[];

/** One field of an entry. */
export type EditableField = keyof EntryValues;

/** Whether a value is a set of editable values: an entry, or an entry's remembered parse values. */
function isEntryValues(value: unknown): value is EntryValues {
	if (!isRecord(value)) return false;
	const { label, questionNumber, marks, summary, specPoint, commandWord, ao } = value;
	if (typeof label !== 'string' || typeof questionNumber !== 'string') return false;
	if (marks !== null && !(typeof marks === 'number' && Number.isInteger(marks))) return false;
	if (typeof summary !== 'string') return false;
	if (!isStringOrNull(specPoint) || !isStringOrNull(commandWord)) return false;
	return ao === null || isAssessmentObjective(ao);
}

/** The editable values of an entry, or of an entry's remembered parse values, as they stand. */
export function entryValuesOf(entry: EntryValues): EntryValues {
	return {
		label: entry.label,
		questionNumber: entry.questionNumber,
		marks: entry.marks,
		summary: entry.summary,
		specPoint: entry.specPoint,
		commandWord: entry.commandWord,
		ao: entry.ao
	};
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
	const { id, original } = value;
	if (typeof id !== 'string' || id === '') return null;
	// Absent, null (added by the teacher) or the parse's values — nothing else.
	if (original !== undefined && original !== null && !isEntryValues(original)) return null;
	if (!isEntryValues(value)) return null;
	return {
		id,
		...entryValuesOf(value),
		original: original === null ? null : entryValuesOf(original ?? value)
	};
}

/** Absent in a document written before descriptions existed: none. `null` means invalid. */
function parseAoDescriptions(value: unknown): AoDescriptions | null {
	if (value === undefined) return {};
	if (!isRecord(value)) return null;
	const descriptions: AoDescriptions = {};
	for (const [key, description] of Object.entries(value)) {
		const ao = assessmentObjectiveOf(key);
		if (ao === null || typeof description !== 'string') return null;
		descriptions[ao] = description;
	}
	return descriptions;
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
function parseGradeBoundary(value: unknown): GradeBoundary | null {
	if (!isRecord(value)) return null;
	const { label, minimum } = value;
	if (typeof label !== 'string' || label === '') return null;
	if (typeof minimum !== 'number' || !Number.isFinite(minimum)) return null;
	return { label, minimum };
}

/**
 * Grade boundaries when present, null when the paper shows marks only.
 * `undefined` means invalid: callers reject the document.
 */
function parseBoundaries(value: unknown): GradeBoundary[] | null | undefined {
	if (value === null || value === undefined) return null;
	if (!Array.isArray(value)) return undefined;
	const boundaries = parseAll(value, parseGradeBoundary);
	return boundaries ?? undefined;
}

function parseTopicNames(value: unknown): Record<string, string> | null {
	if (!isRecord(value)) return null;
	const topicNames: Record<string, string> = {};
	for (const [code, name] of Object.entries(value)) {
		if (typeof name !== 'string') return null;
		topicNames[code] = name;
	}
	return topicNames;
}

function isAssessmentObjectiveOrNull(value: unknown): value is AssessmentObjective | null {
	return value === null || isAssessmentObjective(value);
}

function parseReportEntry(value: unknown): ReportEntryInput | null {
	if (!isRecord(value)) return null;
	const { label, summary, commandWord, ao, topics, gained, available } = value;
	if (typeof label !== 'string' || typeof summary !== 'string') return null;
	if (!isStringOrNull(commandWord) || !isAssessmentObjectiveOrNull(ao)) return null;
	const parsedTopics = parseStringArray(topics);
	if (!parsedTopics) return null;
	if (typeof gained !== 'number' || !Number.isFinite(gained)) return null;
	if (typeof available !== 'number' || !Number.isFinite(available)) return null;
	return { label, summary, commandWord, ao, topics: parsedTopics, gained, available };
}

function parseReportInput(value: unknown): ReportGenerationInput | null {
	if (!isRecord(value)) return null;
	const { paperLabel, entries } = value;
	if (typeof paperLabel !== 'string') return null;
	if (!Array.isArray(entries)) return null;
	const parsed = parseAll(entries, parseReportEntry);
	if (!parsed) return null;
	return { paperLabel, entries: parsed };
}

function parseStringArray(value: unknown): string[] | null {
	if (!Array.isArray(value)) return null;
	if (!value.every((item) => typeof item === 'string')) return null;
	return [...value];
}

function parseReportProse(value: unknown): ReportProse | null {
	if (!isRecord(value)) return null;
	const strengths = parseStringArray(value['strengths']);
	const areasForImprovement = parseStringArray(value['areasForImprovement']);
	if (!strengths || !areasForImprovement) return null;
	return { strengths, areasForImprovement };
}

/**
 * The teacher's edit beside the generated prose: null when unedited.
 * `undefined` means invalid: callers reject the document.
 */
function parseReportEdit(value: unknown): ReportProse | null | undefined {
	if (value === null || value === undefined) return null;
	return parseReportProse(value) ?? undefined;
}

function parseReport(value: unknown): StoredReport | null {
	if (!isRecord(value)) return null;
	const prose = parseReportProse(value);
	const edit = parseReportEdit(value['edit']);
	const input = parseReportInput(value['input']);
	const { model, generatedAt } = value;
	if (!prose || edit === undefined) return null;
	if (!input) return null;
	if (typeof model !== 'string' || typeof generatedAt !== 'string') return null;
	return { ...prose, edit, input, model, generatedAt };
}

function parseReports(value: unknown): Record<string, StoredReport> | null {
	if (!isRecord(value)) return null;
	const reports: Record<string, StoredReport> = {};
	for (const [studentId, report] of Object.entries(value)) {
		const parsed = parseReport(report);
		if (!parsed) return null;
		reports[studentId] = parsed;
	}
	return reports;
}

/**
 * The oldest change not yet in a backup. A v2 document kept none: it is
 * unbacked exactly while its last write is later than its last backup, and the
 * last write is the one moment it can name for that change.
 */
function parseFirstUnbackedChangeAt(
	value: unknown,
	schemaVersion: unknown,
	updatedAt: string,
	lastExportedAt: string | null
): string | null | undefined {
	if (schemaVersion === EARLIER_SCHEMA_VERSION) {
		if (lastExportedAt === null) return null;
		return Date.parse(updatedAt) > Date.parse(lastExportedAt) ? updatedAt : null;
	}
	return isStringOrNull(value) ? value : undefined;
}

/**
 * The one "is this a valid document" check, shared by boot-time load and
 * restore. Returns a fresh document with only known fields, or null when the
 * value is not a document we can read (wrong version included).
 */
function parseDocumentValue(value: unknown): MarksheetDocument | null {
	if (!isRecord(value)) return null;
	const schemaVersion = value['schemaVersion'];
	if (schemaVersion !== EARLIER_SCHEMA_VERSION && schemaVersion !== DOCUMENT_SCHEMA_VERSION) {
		return null;
	}

	const createdAt = value['createdAt'];
	const updatedAt = value['updatedAt'];
	const breakdownConfirmedAt = value['breakdownConfirmedAt'];
	const lastExportedAt = value['lastExportedAt'];
	if (typeof createdAt !== 'string' || typeof updatedAt !== 'string') return null;
	if (!isStringOrNull(breakdownConfirmedAt) || !isStringOrNull(lastExportedAt)) return null;
	const firstUnbackedChangeAt = parseFirstUnbackedChangeAt(
		value['firstUnbackedChangeAt'],
		schemaVersion,
		updatedAt,
		lastExportedAt
	);
	if (firstUnbackedChangeAt === undefined) return null;

	const paper = value['paper'];
	if (!isRecord(paper)) return null;
	const { label, className, sourceFilenames, parsedAt } = paper;
	if (!isStringOrNull(label) || !isStringOrNull(className)) return null;
	if (!Array.isArray(sourceFilenames) || !sourceFilenames.every((n) => typeof n === 'string')) {
		return null;
	}
	if (typeof parsedAt !== 'string') return null;
	const boundaries = parseBoundaries(paper['boundaries']);
	if (boundaries === undefined) return null;
	const rawBelowLowest = paper['belowLowestLabel'];
	// Absent in a document written before the field existed: the default. An
	// empty label is unreadable rather than silently corrected, so a stored
	// document always reads back unchanged.
	if (
		rawBelowLowest !== undefined &&
		(typeof rawBelowLowest !== 'string' || rawBelowLowest === '')
	) {
		return null;
	}
	const belowLowestLabel = rawBelowLowest ?? DEFAULT_BELOW_LOWEST_LABEL;

	const breakdown = value['breakdown'];
	if (!isRecord(breakdown)) return null;
	const rawEntries = breakdown['entries'];
	const rawWarnings = breakdown['warnings'];
	if (!Array.isArray(rawEntries) || !Array.isArray(rawWarnings)) return null;
	const entries = parseAll(rawEntries, parseEntry);
	const warnings = parseAll(rawWarnings, parseWarning);
	if (!entries || !warnings) return null;
	const aoDescriptions = parseAoDescriptions(breakdown['aoDescriptions']);
	if (!aoDescriptions) return null;

	const rawStudents = value['students'];
	if (!Array.isArray(rawStudents)) return null;
	const students = parseAll(rawStudents, parseStudent);
	if (!students) return null;

	const marks = parseMarks(value['marks']);
	if (!marks) return null;

	const topicNames = parseTopicNames(value['topicNames'] ?? {});
	if (!topicNames) return null;

	const reports = parseReports(value['reports'] ?? {});
	if (!reports) return null;

	return {
		schemaVersion: DOCUMENT_SCHEMA_VERSION,
		createdAt,
		updatedAt,
		breakdownConfirmedAt,
		lastExportedAt,
		firstUnbackedChangeAt,
		paper: {
			label,
			className,
			sourceFilenames: [...sourceFilenames],
			parsedAt,
			boundaries,
			belowLowestLabel
		},
		breakdown: { entries, warnings, aoDescriptions },
		students,
		marks,
		topicNames,
		reports
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

/**
 * Drop reports for students who no longer exist, like unreachable marks.
 * Reports for students who are present but ineligible are kept: fixing the
 * student brings the report back.
 */
export function dropUnreachableReports(document: MarksheetDocument): MarksheetDocument['reports'] {
	const studentIds = new Set(document.students.map((student) => student.id));
	const reports: MarksheetDocument['reports'] = {};
	for (const [studentId, report] of Object.entries(document.reports)) {
		if (studentIds.has(studentId)) reports[studentId] = report;
	}
	return reports;
}

/**
 * One entry's specification-point codes, normalised by trimming and splitting
 * on commas and slashes only (ADR-0002): no other canonicalising.
 */
export function specPointCodes(specPoint: string | null): string[] {
	if (specPoint === null) return [];
	return specPoint
		.split(/[,/]/)
		.map((code) => code.trim())
		.filter((code) => code !== '');
}

/** Every normalised specification-point code on the breakdown, in first-seen order. */
export function topicCodesOf(document: MarksheetDocument): string[] {
	const seen = new Set<string>();
	for (const entry of document.breakdown.entries) {
		for (const code of specPointCodes(entry.specPoint)) seen.add(code);
	}
	return [...seen];
}

/** Drop topic names whose code appears on no entry, even inside a comma or slash list. */
export function dropOrphanedTopicNames(
	document: MarksheetDocument
): MarksheetDocument['topicNames'] {
	const live = new Set(topicCodesOf(document));
	const topicNames: MarksheetDocument['topicNames'] = {};
	for (const [code, name] of Object.entries(document.topicNames)) {
		if (live.has(code)) topicNames[code] = name;
	}
	return topicNames;
}

/**
 * Everything load and restore throw away: unreachable marks, reports for
 * removed students, and names for codes no entry carries. Reports for
 * ineligible students stay: fixing the student brings them back.
 */
export function dropUnreachable(document: MarksheetDocument): MarksheetDocument {
	const dropped = dropUnreachableMarks(document);
	return {
		...dropped,
		reports: dropUnreachableReports(dropped),
		topicNames: dropOrphanedTopicNames(dropped)
	};
}

/**
 * The document as it is now, in a copy no later change reaches. A document is
 * plain JSON by construction (it is stored as such), so this holds under a
 * reactive proxy and in plain code alike; `$state.snapshot` does not copy in
 * the server build the specs run in.
 */
export function copyOfDocument(document: MarksheetDocument): MarksheetDocument {
	return JSON.parse(JSON.stringify(document)) as MarksheetDocument;
}

/** What the breakdown adds up to: the marks a marksheet's columns carry. */
export function totalMarks(entries: readonly BreakdownEntry[]): number {
	return entries.reduce((sum, entry) => sum + (entry.marks ?? 0), 0);
}

/** Marks one student gained across the breakdown: unmarked entries count 0. */
export function studentTotal(document: MarksheetDocument, studentId: string): number {
	const marks = document.marks[studentId] ?? {};
	return document.breakdown.entries.reduce((sum, entry) => sum + (marks[entry.id] ?? 0), 0);
}

/** Same wording, item for item, in both sections. */
export function sameProse(a: ReportProse, b: ReportProse): boolean {
	return (
		a.strengths.join('\n') === b.strengths.join('\n') &&
		a.areasForImprovement.join('\n') === b.areasForImprovement.join('\n')
	);
}

/** How many marks the document holds: one per student per entry answered. */
export function markCount(document: MarksheetDocument): number {
	return Object.values(document.marks).reduce(
		(sum, byEntry) => sum + Object.keys(byEntry).length,
		0
	);
}

/**
 * How many marks the document holds on one entry: what deleting that entry takes
 * with it. Every one of them goes, whether or not it counts towards a figure —
 * an absent student's marks are kept, and are removed with the entry they were
 * entered on.
 */
export function marksOnEntry(document: MarksheetDocument, entryId: string): number {
	let recorded = 0;
	for (const byEntry of Object.values(document.marks)) {
		if (byEntry[entryId] !== undefined) recorded += 1;
	}
	return recorded;
}

/**
 * How many of an entry's marks sit above the available marks it offers. Marks
 * are never clamped, so these are the ones no figure can count until the entry's
 * available marks are raised or the mark is corrected. An entry with no
 * available marks has nothing for a mark to be above.
 */
export function marksOverMax(document: MarksheetDocument, entryId: string): number {
	const entry = document.breakdown.entries.find((candidate) => candidate.id === entryId);
	if (!entry) return 0;

	let over = 0;
	for (const byEntry of Object.values(document.marks)) {
		const mark = byEntry[entryId];
		if (mark !== undefined && isOverMax(mark, entry)) over += 1;
	}
	return over;
}

/**
 * Whether a mark is above what the entry offers. An entry with no available
 * marks has nothing for a mark to be above.
 */
export function isOverMax(mark: number, entry: Pick<BreakdownEntry, 'marks'>): boolean {
	return entry.marks !== null && mark > entry.marks;
}

/**
 * Whether typed text is a whole number — the only shape a mark or a printed
 * total is allowed to take.
 */
export function isWholeNumber(typed: string): boolean {
	return /^\d+$/.test(typed.trim());
}

/** Typed or pasted cell text, read as a mark. */
export type MarkText = { kind: 'clear' } | { kind: 'mark'; mark: number } | { kind: 'refused' };

/** Typed or pasted cell text as a mark: empty clears, a whole number is a mark, anything else is refused. */
export function readMarkText(text: string): MarkText {
	const typed = text.trim();
	if (typed === '') return { kind: 'clear' };
	if (!isWholeNumber(typed)) return { kind: 'refused' };
	return { kind: 'mark', mark: Number(typed) };
}

/**
 * A stable id generated on this device, for an entry or a student. Marks are
 * filed under it, so renaming, inserting or sorting never reassigns them — and
 * being local, it is not the Phase 3 pseudonymization UUID.
 */
export function localId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Put a mark on a cell, and say whether the cell changed: the mark already
 * there is not a change, so re-entering it spends no undo and bumps nothing.
 */
export function putMark(
	marks: MarksheetDocument['marks'],
	studentId: string,
	entryId: string,
	mark: number
): boolean {
	if (marks[studentId]?.[entryId] === mark) return false;
	marks[studentId] ??= {};
	marks[studentId][entryId] = mark;
	return true;
}

/**
 * Clear a cell back to unmarked, and say whether it held a mark. A student with
 * nothing left on the sheet leaves nothing behind: marks are sparse, so an
 * empty record is not kept for them.
 */
export function removeMark(
	marks: MarksheetDocument['marks'],
	studentId: string,
	entryId: string
): boolean {
	const studentMarks = marks[studentId];
	if (!studentMarks || studentMarks[entryId] === undefined) return false;
	delete studentMarks[entryId];
	if (Object.keys(studentMarks).length === 0) delete marks[studentId];
	return true;
}

/** Seed the paper label from an uploaded filename: `10X Ph1.pdf` → `10X Ph1`. */
export function labelFromFilename(filename: string | undefined): string | null {
	if (filename === undefined) return null;
	const withoutExtension = filename.replace(/\.[^./\\]+$/, '').trim();
	return withoutExtension === '' ? null : withoutExtension;
}
