// The documents the route-level browser specs seed into localStorage and read
// back. Test-only: nothing in the app imports this. A spec whose scenario
// wants other defaults wraps these with overrides rather than redefining them.

import type { ParseQuestion } from '$lib/server/parse/schema.js';
import { DOCUMENT_SCHEMA_VERSION, STORAGE_KEY, entryValuesOf } from './document.js';
import type { BreakdownEntry, MarksheetDocument, StoredStudent, StoredTier } from './document.js';
import type { CreateFromAssessmentInput, TierParse } from './create-assessment.js';

export const NOW = '2026-01-01T10:00:00.000Z';

/** The fixture moment as a Date, for specs that age one. */
export const NOW_DATE = new Date(NOW);

const DAY_MS = 24 * 60 * 60 * 1000;

/** A moment `days` before the fixture moment, to the second, so an age edge is testable. */
export function ago(days: number, seconds = 0): string {
	return new Date(NOW_DATE.getTime() - days * DAY_MS - seconds * 1000).toISOString();
}

export function entry(
	id: string,
	label: string,
	questionNumber: string,
	overrides: Partial<BreakdownEntry> = {}
): BreakdownEntry {
	const built: BreakdownEntry = {
		id,
		label,
		questionNumber,
		marks: 4,
		summary: 'Describe the rate change',
		specPoint: '3.2.1.4',
		commandWord: 'Describe',
		ao: 'AO2',
		original: null,
		...overrides
	};
	// As the parse leaves it: the entry's own values, until a test says otherwise.
	return overrides.original === undefined ? { ...built, original: entryValuesOf(built) } : built;
}

/** One tier as an untiered parse leaves it: no printed name, one entry, no boundaries. */
export function tier(overrides: Partial<StoredTier> = {}): StoredTier {
	return {
		tierName: null,
		sourceFilenames: ['10X Ph1.pdf'],
		parsedAt: NOW,
		breakdown: { entries: [entry('entry-1', '2bii', '2')], warnings: [] },
		boundaries: null,
		belowLowestLabel: 'U',
		...overrides
	};
}

export function student(
	id: string,
	firstName: string,
	surname: string,
	absent = false,
	tier: 0 | 1 | null = 0
): StoredStudent {
	return { id, firstName, surname, absent, tier };
}

/** A confirmed document with no class, students or marks: the state a marksheet exists in. */
export function confirmed(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
	return {
		schemaVersion: DOCUMENT_SCHEMA_VERSION,
		createdAt: NOW,
		updatedAt: NOW,
		breakdownConfirmedAt: NOW,
		lastExportedAt: null,
		firstUnbackedChangeAt: null,
		label: '10X Ph1',
		className: null,
		aoDescriptions: {},
		tiers: [tier()],
		students: [],
		marks: {},
		commonQuestions: [],
		topicNames: {},
		reports: {},
		...overrides
	};
}

/** A parse nobody has confirmed: the state the breakdown page exists for. */
export function parsed(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
	return confirmed({ breakdownConfirmedAt: null, ...overrides });
}

/** A document as version 2 stored it: one flat paper, and no unbacked-change field. */
export function writtenAsV2(document: MarksheetDocument): Record<string, unknown> {
	if (document.tiers.length !== 1) {
		throw new Error('A version 2 document has exactly one paper.');
	}
	const written = JSON.parse(JSON.stringify(document)) as Record<string, unknown> & {
		students: Record<string, unknown>[];
	};
	const first = document.tiers[0];
	written.schemaVersion = 2;
	delete written.firstUnbackedChangeAt;
	delete written.label;
	delete written.className;
	delete written.aoDescriptions;
	delete written.tiers;
	delete written.commonQuestions;
	// Version 2 students had no tier: the one paper was the only paper.
	for (const student of written.students) delete student['tier'];
	written.paper = {
		label: document.label,
		className: document.className,
		sourceFilenames: [...first.sourceFilenames],
		parsedAt: first.parsedAt,
		boundaries: first.boundaries,
		belowLowestLabel: first.belowLowestLabel
	};
	written.breakdown = { ...first.breakdown, aoDescriptions: document.aoDescriptions };
	return written;
}

export function seed(stored: MarksheetDocument): void {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

export function readSeeded(): MarksheetDocument {
	return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as MarksheetDocument;
}

/** One question as the parse returns it: the one-entry paper `confirmed()` is built from. */
export function question(overrides: Partial<ParseQuestion> = {}): ParseQuestion {
	return {
		id: '2bii',
		questionNumber: '2',
		marks: 4,
		summary: 'Describe the rate change',
		specPoint: '3.2.1.4',
		commandWord: 'Describe',
		ao: 'AO2',
		...overrides
	};
}

/** One tier as a parse leaves it, with the tier name the parse would read from the paper. */
export function tierParse(overrides: Partial<TierParse> = {}): TierParse {
	const tierName = overrides.tierName ?? overrides.breakdown?.tierName ?? null;
	return {
		tierName,
		breakdown: { tierName, questions: [question()], aoDescriptions: [] },
		warnings: [],
		filenames: ['10X Ph1.pdf'],
		...overrides
	};
}

/** A finished upload run, as the upload page hands it to the store. */
export function parseRun(
	overrides: Partial<CreateFromAssessmentInput> = {}
): CreateFromAssessmentInput {
	return {
		tiers: [tierParse()],
		pairs: [],
		usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estCost: 0 },
		...overrides
	};
}
