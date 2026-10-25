// Reading documents written before assessments had tiers: version 2's shape,
// and the flat version 3 that replaced it for a while. One validator and one
// conversion into a version 3 single-tier assessment serve both.
//
// This is the frozen old reader (ADR-0004). It shares value parsing with the
// current validator but keeps the old document shape, so a change to today's
// tiers cannot quietly change how an old document is read.

import { isRecord } from '$lib/parse/is-breakdown.js';
import { boundariesAreValid } from './boundary-rules.js';
import type {
	AoDescriptions,
	GradeBoundary,
	MarksheetDocument,
	StoredBreakdown,
	StoredReport,
	StoredStudent
} from './document.js';
import {
	DEFAULT_BELOW_LOWEST_LABEL,
	isStringOrNull,
	parseAll,
	parseAoDescriptions,
	parseBoundaries,
	parseMarks,
	parseReports,
	parseStoredBreakdown,
	parseTopicNames
} from './document-values.js';

/** The one paper a version 2 document stored, before assessments had tiers. */
export interface Version2Paper {
	label: string | null;
	className: string | null;
	sourceFilenames: string[];
	parsedAt: string;
	boundaries: GradeBoundary[] | null;
	belowLowestLabel: string;
}

/** A student as version 2 stored them: a tier was not yet a thing they had. */
export interface Version2Student {
	id: string;
	firstName: string;
	surname: string;
	absent: boolean;
}

/** A version 2 breakdown: its entries and warnings, plus the AO descriptions it carried. */
export interface Version2Breakdown extends StoredBreakdown {
	aoDescriptions: AoDescriptions;
}

/** A document as the pre-tier shapes wrote it: one paper and one breakdown, no tiers. */
export interface Version2Document {
	createdAt: string;
	updatedAt: string;
	breakdownConfirmedAt: string | null;
	lastExportedAt: string | null;
	firstUnbackedChangeAt: string | null;
	paper: Version2Paper;
	breakdown: Version2Breakdown;
	students: Version2Student[];
	marks: Record<string, Record<string, number>>;
	topicNames: Record<string, string>;
	reports: Record<string, StoredReport>;
}

function parseVersion2Student(value: unknown): Version2Student | null {
	if (!isRecord(value)) return null;
	const { id, firstName, surname, absent } = value;
	if (typeof id !== 'string' || id === '') return null;
	if (typeof firstName !== 'string' || typeof surname !== 'string') return null;
	if (typeof absent !== 'boolean') return null;
	return { id, firstName, surname, absent };
}

/** The pre-tier validator, unchanged in behaviour; the dispatcher has checked the version. */
export function parseVersion2Document(
	value: Record<string, unknown>,
	schemaVersion: 2 | 3
): Version2Document | null {
	const createdAt = value['createdAt'];
	const updatedAt = value['updatedAt'];
	const breakdownConfirmedAt = value['breakdownConfirmedAt'];
	const lastExportedAt = value['lastExportedAt'];
	if (typeof createdAt !== 'string' || typeof updatedAt !== 'string') return null;
	if (!isStringOrNull(breakdownConfirmedAt) || !isStringOrNull(lastExportedAt)) return null;

	// A flat version 3 recorded this itself, and a value of the wrong shape is
	// unreadable. A flat version 3 missing it was written before the field
	// existed, like version 2. Version 2 kept no such field: it was unbacked
	// exactly while its last write was later than its last backup, and the last
	// write is the one moment it can name for that change.
	let firstUnbackedChangeAt: string | null;
	const storedFirstUnbacked = value['firstUnbackedChangeAt'];
	if (schemaVersion === 3 && storedFirstUnbacked !== undefined) {
		if (!isStringOrNull(storedFirstUnbacked)) return null;
		firstUnbackedChangeAt = storedFirstUnbacked;
	} else if (lastExportedAt === null) {
		firstUnbackedChangeAt = null;
	} else {
		firstUnbackedChangeAt = Date.parse(updatedAt) > Date.parse(lastExportedAt) ? updatedAt : null;
	}

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
	if (
		rawBelowLowest !== undefined &&
		(typeof rawBelowLowest !== 'string' || rawBelowLowest === '')
	) {
		return null;
	}
	const belowLowestLabel = rawBelowLowest ?? DEFAULT_BELOW_LOWEST_LABEL;
	if (boundaries !== null && !boundariesAreValid(boundaries, belowLowestLabel)) return null;

	const rawBreakdown = value['breakdown'];
	if (!isRecord(rawBreakdown)) return null;
	const breakdown = parseStoredBreakdown(rawBreakdown);
	if (!breakdown) return null;
	const aoDescriptions = parseAoDescriptions(rawBreakdown['aoDescriptions']);
	if (!aoDescriptions) return null;

	const rawStudents = value['students'];
	if (!Array.isArray(rawStudents)) return null;
	const students = parseAll(rawStudents, parseVersion2Student);
	if (!students) return null;

	const marks = parseMarks(value['marks']);
	if (!marks) return null;

	const topicNames = parseTopicNames(value['topicNames'] ?? {});
	if (!topicNames) return null;

	const reports = parseReports(value['reports'] ?? {});
	if (!reports) return null;

	return {
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
		breakdown: { ...breakdown, aoDescriptions },
		students,
		marks,
		topicNames,
		reports
	};
}

/**
 * A pre-tier document as version 3: its one paper becomes tier 0 and cannot
 * name itself, every student sits that tier and no pair exists yet. Marks,
 * topic names and reports carry over verbatim, so no report goes out of date.
 */
export function fromVersion2(document: Version2Document): MarksheetDocument {
	const { paper, breakdown } = document;
	return {
		// Checked against `MarksheetDocument`, so bumping the schema version
		// cannot leave this adapter writing the old one.
		schemaVersion: 3,
		createdAt: document.createdAt,
		updatedAt: document.updatedAt,
		breakdownConfirmedAt: document.breakdownConfirmedAt,
		lastExportedAt: document.lastExportedAt,
		firstUnbackedChangeAt: document.firstUnbackedChangeAt,
		label: paper.label,
		className: paper.className,
		aoDescriptions: breakdown.aoDescriptions,
		tiers: [
			{
				tierName: null,
				sourceFilenames: paper.sourceFilenames,
				parsedAt: paper.parsedAt,
				breakdown: { entries: breakdown.entries, warnings: breakdown.warnings },
				boundaries: paper.boundaries,
				belowLowestLabel: paper.belowLowestLabel
			}
		],
		students: document.students.map((student): StoredStudent => ({ ...student, tier: 0 })),
		marks: document.marks,
		commonQuestions: [],
		topicNames: document.topicNames,
		reports: document.reports
	};
}
