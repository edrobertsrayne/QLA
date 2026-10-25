// Version-neutral value parsing for the stored document.
//
// The version 3 validator and the frozen version 2 reader both check stored
// values here, so a field means the same thing whichever version wrote it.
// Types come from `document.ts`: this module owns parsing, not the shape.

import {
	assessmentObjectiveOf,
	type AssessmentObjective
} from '$lib/parse/assessment-objectives.js';
import { isRecord } from '$lib/parse/is-breakdown.js';
import type {
	AoDescriptions,
	BreakdownEntry,
	EntryValues,
	GradeBoundary,
	ReportEntryInput,
	ReportGenerationInput,
	ReportProse,
	StoredBreakdown,
	StoredReport,
	StoredWarning
} from './document.js';

/** The label for a total below every grade boundary, when the paper has grades. */
export const DEFAULT_BELOW_LOWEST_LABEL = 'U';

export function isStringOrNull(value: unknown): value is string | null {
	return value === null || typeof value === 'string';
}

function isAssessmentObjective(value: unknown): value is AssessmentObjective {
	return typeof value === 'string' && assessmentObjectiveOf(value) !== null;
}

/** Whether a value is a set of editable values: an entry, or an entry's remembered parse values. */
function isEntryValues(value: unknown): value is EntryValues {
	if (!isRecord(value)) return false;
	const { label, questionNumber, marks, summary, specPoint, commandWord, ao } = value;
	if (typeof label !== 'string' || typeof questionNumber !== 'string') return false;
	if (marks !== null && !(typeof marks === 'number' && Number.isInteger(marks) && marks >= 1)) {
		return false;
	}
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
export function parseAll<T>(values: unknown[], parse: (value: unknown) => T | null): T[] | null {
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
export function parseAoDescriptions(value: unknown): AoDescriptions | null {
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
	return { questionId, code, message };
}

export function parseMarks(value: unknown): Record<string, Record<string, number>> | null {
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
export function parseBoundaries(value: unknown): GradeBoundary[] | null | undefined {
	if (value === null || value === undefined) return null;
	if (!Array.isArray(value)) return undefined;
	const boundaries = parseAll(value, parseGradeBoundary);
	return boundaries ?? undefined;
}

export function parseTopicNames(value: unknown): Record<string, string> | null {
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

export function parseReports(value: unknown): Record<string, StoredReport> | null {
	if (!isRecord(value)) return null;
	const reports: Record<string, StoredReport> = {};
	for (const [studentId, report] of Object.entries(value)) {
		const parsed = parseReport(report);
		if (!parsed) return null;
		reports[studentId] = parsed;
	}
	return reports;
}

/** The breakdown both versions store: entries and warnings. */
export function parseStoredBreakdown(value: unknown): StoredBreakdown | null {
	if (!isRecord(value)) return null;
	const rawEntries = value['entries'];
	const rawWarnings = value['warnings'];
	if (!Array.isArray(rawEntries) || !Array.isArray(rawWarnings)) return null;
	const entries = parseAll(rawEntries, parseEntry);
	const warnings = parseAll(rawWarnings, parseWarning);
	if (!entries || !warnings) return null;
	return { entries, warnings };
}
