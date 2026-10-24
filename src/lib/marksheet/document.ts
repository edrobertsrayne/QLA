// The stored marksheet document: one versioned JSON blob in browser storage.
//
// This module owns the document's shape and the single validator used both by
// boot-time load and (later) backup restore, so a file we accept from disk is
// the same thing we accept from storage. It has no I/O and no reactive state.
//
// Version 2 documents, and the flat version 3 written before tiers existed, are
// read as version 3 single-tier assessments; see `document-v2.ts`.

import type { AssessmentObjective } from '$lib/parse/assessment-objectives.js';
import { isRecord } from '$lib/parse/is-breakdown.js';
import { fromVersion2, parseVersion2Document } from './document-v2.js';
import {
	DEFAULT_BELOW_LOWEST_LABEL,
	entryValuesOf,
	isStringOrNull,
	parseAll,
	parseAoDescriptions,
	parseBoundaries,
	parseMarks,
	parseReports,
	parseStoredBreakdown,
	parseTopicNames
} from './document-values.js';

/** localStorage key holding the marksheet document. */
export const STORAGE_KEY = 'qla:marksheet:v1';

/** Keys unreadable documents are preserved under, suffixed with an ISO timestamp. */
export const CORRUPT_KEY_PREFIX = 'qla:marksheet:corrupt:';

/**
 * The version this app writes. v2 documents, written before changes were
 * tracked, are still read; so are v3 documents written before tiers existed.
 * Anything else is treated as unreadable.
 */
export const DOCUMENT_SCHEMA_VERSION = 3;

/** The version written before `firstUnbackedChangeAt` existed. */
const EARLIER_SCHEMA_VERSION = 2;

// Parsed by the version-neutral value module; re-exported so importers keep
// the document module as their entry point.
export { DEFAULT_BELOW_LOWEST_LABEL, entryValuesOf };

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

/** A tier's position in the assessment: its stable handle, never its name. */
export type TierIndex = 0 | 1;

/** One tier of an assessment: one paper's breakdown, boundaries and printed name. */
export interface StoredTier {
	/** The tier as printed on the paper, verbatim; null when none is printed. */
	tierName: string | null;
	sourceFilenames: string[];
	parsedAt: string;
	breakdown: StoredBreakdown;
	/**
	 * Grade boundaries, top grade first, or null when the tier's paper shows
	 * marks only. A blank row is never stored: it reads as "not used".
	 */
	boundaries: GradeBoundary[] | null;
	/** The label for a total below every boundary. */
	belowLowestLabel: string;
}

/** A question printed in both tiers' papers: its entry id on each tier. */
export interface CommonQuestion {
	tier1EntryId: string;
	tier2EntryId: string;
}

/** The minimum total mark on one tier's paper for a grade, in raw marks. */
export interface GradeBoundary {
	label: string;
	minimum: number;
}

export interface StoredStudent {
	id: string;
	firstName: string;
	surname: string;
	absent: boolean;
	/** The tier this student sits; always 0 on a single-tier assessment. */
	tier: TierIndex | null;
}

/** A short, student-readable description per assessment objective that has one. */
export type AoDescriptions = Partial<Record<AssessmentObjective, string>>;

/**
 * The breakdown as stored: its entries and the findings the parse left beside
 * them. One per tier; the AO descriptions are shared by the assessment.
 */
export interface StoredBreakdown {
	entries: BreakdownEntry[];
	warnings: StoredWarning[];
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
	schemaVersion: typeof DOCUMENT_SCHEMA_VERSION;
	createdAt: string;
	updatedAt: string;
	/** Null while any tier's breakdown or the pairs are still under review. */
	breakdownConfirmedAt: string | null;
	/** Last backup download. Marks export never touches it. */
	lastExportedAt: string | null;
	/**
	 * The oldest change the last backup does not hold, or null when it holds
	 * every change. A document that has never been backed up is changed from
	 * `createdAt`, whatever this records.
	 */
	firstUnbackedChangeAt: string | null;
	/** The assessment's paper label, defaulted from the first tier's filename. */
	label: string | null;
	className: string | null;
	/** One shared set of AO descriptions for the whole assessment. */
	aoDescriptions: AoDescriptions;
	/** One or two tiers; array position is the tier's handle. */
	tiers: StoredTier[];
	/** Array order is display order. */
	students: StoredStudent[];
	/** Sparse: `marks[studentId][entryId]`, absent key = unmarked. */
	marks: Record<string, Record<string, number>>;
	/** Questions printed in both tiers' papers. Empty on one tier. */
	commonQuestions: CommonQuestion[];
	/** Student-readable name per normalised specification-point code. */
	topicNames: Record<string, string>;
	/** One report per student, keyed by student id. */
	reports: Record<string, StoredReport>;
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

function parseStudent(value: unknown, tierCount: number): StoredStudent | null {
	if (!isRecord(value)) return null;
	const { id, firstName, surname, absent, tier } = value;
	if (typeof id !== 'string' || id === '') return null;
	if (typeof firstName !== 'string' || typeof surname !== 'string') return null;
	if (typeof absent !== 'boolean') return null;
	// A single-tier assessment has no other tier for a student to sit.
	if (tierCount === 1) {
		if (tier !== 0) return null;
		return { id, firstName, surname, absent, tier: 0 };
	}
	if (tier === 0 || tier === 1 || tier === null) {
		return { id, firstName, surname, absent, tier };
	}
	return null;
}

function parseStudents(values: unknown[], tierCount: number): StoredStudent[] | null {
	const students: StoredStudent[] = [];
	for (const value of values) {
		const student = parseStudent(value, tierCount);
		if (!student) return null;
		students.push(student);
	}
	return students;
}

/** One tier, or null when any part of it is unreadable. */
function parseTier(value: unknown): StoredTier | null {
	if (!isRecord(value)) return null;
	const { tierName, sourceFilenames, parsedAt } = value;
	// A blank name is allowed here: only the commands trim it to null.
	if (!isStringOrNull(tierName)) return null;
	if (!Array.isArray(sourceFilenames) || !sourceFilenames.every((n) => typeof n === 'string')) {
		return null;
	}
	if (typeof parsedAt !== 'string') return null;
	const breakdown = parseStoredBreakdown(value['breakdown']);
	if (!breakdown) return null;
	const boundaries = parseBoundaries(value['boundaries']);
	if (boundaries === undefined) return null;
	const rawBelowLowest = value['belowLowestLabel'];
	// Absent in a document written before the field existed: the default. An
	// empty label is unreadable rather than silently corrected, so a stored
	// document always reads back unchanged.
	if (
		rawBelowLowest !== undefined &&
		(typeof rawBelowLowest !== 'string' || rawBelowLowest === '')
	) {
		return null;
	}
	return {
		tierName,
		sourceFilenames: [...sourceFilenames],
		parsedAt,
		breakdown,
		boundaries,
		belowLowestLabel: rawBelowLowest ?? DEFAULT_BELOW_LOWEST_LABEL
	};
}

/** An assessment has one tier or two: no tier is added, removed or reordered later. */
function parseTiers(value: unknown): StoredTier[] | null {
	if (!Array.isArray(value)) return null;
	if (value.length !== 1 && value.length !== 2) return null;
	return parseAll(value, parseTier);
}

function parseCommonQuestion(value: unknown): CommonQuestion | null {
	if (!isRecord(value)) return null;
	const { tier1EntryId, tier2EntryId } = value;
	if (typeof tier1EntryId !== 'string' || tier1EntryId === '') return null;
	if (typeof tier2EntryId !== 'string' || tier2EntryId === '') return null;
	return { tier1EntryId, tier2EntryId };
}

/**
 * Every pair, or nothing: an entry can pair with at most one entry on the other
 * tier, so an id repeated on either side makes the document unreadable.
 */
function parseCommonQuestions(value: unknown): CommonQuestion[] | null {
	if (!Array.isArray(value)) return null;
	const pairs = parseAll(value, parseCommonQuestion);
	if (!pairs) return null;
	const used = new Set<string>();
	for (const pair of pairs) {
		if (used.has(pair.tier1EntryId) || used.has(pair.tier2EntryId)) return null;
		used.add(pair.tier1EntryId);
		used.add(pair.tier2EntryId);
	}
	return pairs;
}

/** The current document version, with only known fields kept. */
function parseVersion3Document(value: Record<string, unknown>): MarksheetDocument | null {
	const createdAt = value['createdAt'];
	const updatedAt = value['updatedAt'];
	const breakdownConfirmedAt = value['breakdownConfirmedAt'];
	const lastExportedAt = value['lastExportedAt'];
	if (typeof createdAt !== 'string' || typeof updatedAt !== 'string') return null;
	if (!isStringOrNull(breakdownConfirmedAt) || !isStringOrNull(lastExportedAt)) return null;

	const firstUnbackedChangeAt = value['firstUnbackedChangeAt'];
	if (!isStringOrNull(firstUnbackedChangeAt)) return null;

	const label = value['label'];
	const className = value['className'];
	if (!isStringOrNull(label) || !isStringOrNull(className)) return null;

	const aoDescriptions = parseAoDescriptions(value['aoDescriptions']);
	if (!aoDescriptions) return null;

	const tiers = parseTiers(value['tiers']);
	if (!tiers) return null;

	const rawStudents = value['students'];
	if (!Array.isArray(rawStudents)) return null;
	const students = parseStudents(rawStudents, tiers.length);
	if (!students) return null;

	const marks = parseMarks(value['marks']);
	if (!marks) return null;

	const commonQuestions = parseCommonQuestions(value['commonQuestions']);
	if (!commonQuestions) return null;

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
		label,
		className,
		aoDescriptions,
		tiers,
		students,
		marks,
		commonQuestions,
		topicNames,
		reports
	};
}

/**
 * The one "is this a valid document" check, shared by boot-time load and
 * restore. A value with `tiers` is the current document; a flat one with
 * `paper` is either version 2 or a version 3 written before tiers existed,
 * and is read as a single tier; any other version is unreadable. Returns a
 * fresh document with only known fields.
 */
function parseDocumentValue(value: unknown): MarksheetDocument | null {
	if (!isRecord(value)) return null;
	if (Array.isArray(value['tiers'])) {
		if (value['schemaVersion'] !== DOCUMENT_SCHEMA_VERSION) return null;
		return parseVersion3Document(value);
	}
	const schemaVersion = value['schemaVersion'];
	if (schemaVersion !== EARLIER_SCHEMA_VERSION && schemaVersion !== DOCUMENT_SCHEMA_VERSION) {
		return null;
	}
	const document = parseVersion2Document(value, schemaVersion);
	return document === null ? null : fromVersion2(document);
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
 * Drop marks pointing at a student or entry that no longer exists. Marks on a
 * tier the student is not set to are kept: they count again if the student
 * moves back, and they are removed with the entry they were entered on.
 */
export function dropUnreachableMarks(document: MarksheetDocument): MarksheetDocument {
	const studentIds = new Set(document.students.map((student) => student.id));
	const entryIds = new Set(allEntries(document).map((entry) => entry.id));
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
 * Drop pairs whose id is missing from its own tier: the first id must be on
 * tier 0, the second on tier 1. A pair with unequal marks stays: it blocks
 * confirmation rather than disappearing silently.
 */
function dropUnreachableCommonQuestions(
	document: MarksheetDocument
): MarksheetDocument['commonQuestions'] {
	const tier1 = new Set(tierEntries(document, 0).map((entry) => entry.id));
	const tier2 = new Set(tierEntries(document, 1).map((entry) => entry.id));
	return document.commonQuestions.filter(
		(pair) => tier1.has(pair.tier1EntryId) && tier2.has(pair.tier2EntryId)
	);
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

/** Every normalised specification-point code on either tier, in first-seen order. */
export function topicCodesOf(document: MarksheetDocument): string[] {
	const seen = new Set<string>();
	for (const entry of allEntries(document)) {
		for (const code of specPointCodes(entry.specPoint)) seen.add(code);
	}
	return [...seen];
}

/** Drop topic names whose code appears on no entry on either tier, even inside a comma or slash list. */
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
 * removed students, names for codes no entry carries and pairs pointing at a
 * question no longer on their tier. Reports for ineligible students stay:
 * fixing the student brings them back.
 */
export function dropUnreachable(document: MarksheetDocument): MarksheetDocument {
	const dropped = dropUnreachableMarks(document);
	return {
		...dropped,
		reports: dropUnreachableReports(dropped),
		topicNames: dropOrphanedTopicNames(dropped),
		commonQuestions: dropUnreachableCommonQuestions(dropped)
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

/** The other tier of a two-tier assessment: 0 ↔ 1. */
export function otherTier(tier: TierIndex): TierIndex {
	return tier === 0 ? 1 : 0;
}

/** Whether this assessment has two papers. An assessment holds at most two. */
export function hasTwoTiers(document: MarksheetDocument): boolean {
	return document.tiers.length === 2;
}

/** Where a new student rests: tier 0 on a single tier, no tier on two. */
export function restingTier(document: MarksheetDocument): TierIndex | null {
	return hasTwoTiers(document) ? null : 0;
}

/** Why a tier name cannot be saved on this document, or null when it can. */
export function tierNameProblem(
	document: MarksheetDocument,
	tier: TierIndex,
	name: string | null
): 'blank' | 'shared' | null {
	if (!hasTwoTiers(document)) return null;
	const trimmed = (name ?? '').trim();
	if (trimmed === '') return 'blank';
	const other = (document.tiers[otherTier(tier)]?.tierName ?? '').trim();
	return other.toLowerCase() === trimmed.toLowerCase() ? 'shared' : null;
}

/** Whether both tiers carry the same non-blank name, trimmed and ignoring case. */
export function tierNamesCollide(document: MarksheetDocument): boolean {
	return tierNameProblem(document, 0, document.tiers[0]?.tierName ?? null) === 'shared';
}

/** One tier's entries in paper order: a tier the assessment does not have holds none. */
export function tierEntries(document: MarksheetDocument, tier: TierIndex): BreakdownEntry[] {
	const stored = document.tiers[tier];
	return stored === undefined ? [] : stored.breakdown.entries;
}

/** Every tier's entries, tier 0 first, each tier in paper order. */
export function allEntries(document: MarksheetDocument): BreakdownEntry[] {
	return document.tiers.flatMap((stored) => stored.breakdown.entries);
}

/** The tier an entry is on, or null when no tier holds it. */
export function entryTierOf(document: MarksheetDocument, entryId: string): TierIndex | null {
	for (const [position, stored] of document.tiers.entries()) {
		if (stored.breakdown.entries.some((entry) => entry.id === entryId)) {
			return position === 0 ? 0 : 1;
		}
	}
	return null;
}

/** The pair an entry belongs to, or null when it is not a common question. */
export function pairOfEntry(
	document: MarksheetDocument,
	tier: TierIndex,
	entryId: string
): CommonQuestion | null {
	const pair = document.commonQuestions.find((candidate) =>
		tier === 0 ? candidate.tier1EntryId === entryId : candidate.tier2EntryId === entryId
	);
	return pair === undefined ? null : pair;
}

/** The other tier's entry id in an entry's pair, or null when it has no partner. */
export function partnerIdOf(
	document: MarksheetDocument,
	tier: TierIndex,
	entryId: string
): string | null {
	const pair = pairOfEntry(document, tier, entryId);
	if (pair === null) return null;
	return tier === 0 ? pair.tier2EntryId : pair.tier1EntryId;
}

/** The entries a student answers: their own tier's, and none without a tier. */
export function entriesOfStudent(
	document: MarksheetDocument,
	student: StoredStudent
): BreakdownEntry[] {
	return student.tier === null ? [] : tierEntries(document, student.tier);
}

/** The tier name a student's report shows, or null when they have no tier or it has no name. */
export function studentTierName(
	document: MarksheetDocument,
	student: StoredStudent
): string | null {
	if (student.tier === null) return null;
	const name = document.tiers[student.tier].tierName?.trim() ?? '';
	return name === '' ? null : name;
}

/** Marks one student gained across their own tier's entries: unmarked entries count 0. */
export function studentTotal(document: MarksheetDocument, studentId: string): number {
	const student = document.students.find((candidate) => candidate.id === studentId);
	if (student === undefined || student.tier === null) return 0;
	const marks = document.marks[studentId] ?? {};
	return entriesOfStudent(document, student).reduce(
		(sum, entry) => sum + (marks[entry.id] ?? 0),
		0
	);
}

/** Same wording, item for item, in both sections. */
export function sameProse(a: ReportProse, b: ReportProse): boolean {
	return (
		a.strengths.join('\n') === b.strengths.join('\n') &&
		a.areasForImprovement.join('\n') === b.areasForImprovement.join('\n')
	);
}

/**
 * How many marks the document holds: every stored mark whose entry is on a
 * tier, whether or not its student sits that tier. What a wipe discards and a
 * backup file carries. A mark whose entry no tier holds is not counted: it can
 * no longer be reached or shown.
 */
export function storedMarkCount(document: MarksheetDocument): number {
	const entryIds = new Set(allEntries(document).map((entry) => entry.id));
	let stored = 0;
	for (const byEntry of Object.values(document.marks)) {
		for (const entryId of Object.keys(byEntry)) {
			if (entryIds.has(entryId)) stored += 1;
		}
	}
	return stored;
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
	const entry = allEntries(document).find((candidate) => candidate.id === entryId);
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
