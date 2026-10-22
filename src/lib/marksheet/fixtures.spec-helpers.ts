// The documents the route-level browser specs seed into localStorage and read
// back. Test-only: nothing in the app imports this. A spec whose scenario
// wants other defaults wraps these with overrides rather than redefining them.

import { DOCUMENT_SCHEMA_VERSION, STORAGE_KEY, entryValuesOf } from './document.js';
import type { BreakdownEntry, MarksheetDocument, StoredStudent } from './document.js';
import type { CreateFromParseInput } from './store.svelte.js';

export const NOW = '2026-01-01T10:00:00.000Z';

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

export function student(
	id: string,
	firstName: string,
	surname: string,
	absent = false
): StoredStudent {
	return { id, firstName, surname, absent };
}

/** A confirmed document with no class, students or marks: the state a marksheet exists in. */
export function confirmed(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
	return {
		schemaVersion: DOCUMENT_SCHEMA_VERSION,
		createdAt: NOW,
		updatedAt: NOW,
		breakdownConfirmedAt: NOW,
		lastExportedAt: null,
		paper: {
			label: '10X Ph1',
			className: null,
			sourceFilenames: ['10X Ph1.pdf'],
			parsedAt: NOW,
			boundaries: null,
			belowLowestLabel: 'U'
		},
		breakdown: { entries: [entry('entry-1', '2bii', '2')], warnings: [], aoDescriptions: {} },
		students: [],
		marks: {},
		topicNames: {},
		reports: {},
		...overrides
	};
}

/** A parse nobody has confirmed: the state the breakdown page exists for. */
export function parsed(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
	return confirmed({ breakdownConfirmedAt: null, ...overrides });
}

export function seed(stored: MarksheetDocument): void {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

export function readSeeded(): MarksheetDocument {
	return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as MarksheetDocument;
}

type ParsedQuestion = CreateFromParseInput['breakdown']['questions'][number];

/** One question as the parse returns it: the one-entry paper `confirmed()` is built from. */
export function question(overrides: Partial<ParsedQuestion> = {}): ParsedQuestion {
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

/** A finished parse run, as the upload page hands it to the store. */
export function parseRun(overrides: Partial<CreateFromParseInput> = {}): CreateFromParseInput {
	return {
		breakdown: { questions: [question()], aoDescriptions: [] },
		warnings: [],
		usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estCost: 0 },
		filenames: ['10X Ph1.pdf'],
		...overrides
	};
}
