// The documents the route-level browser specs seed into localStorage and read
// back. Test-only: nothing in the app imports this. A spec whose scenario
// wants other defaults wraps these with overrides rather than redefining them.

import { DOCUMENT_SCHEMA_VERSION, STORAGE_KEY, entryValuesOf } from './document.js';
import type { BreakdownEntry, MarksheetDocument, StoredStudent } from './document.js';

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
			parsedAt: NOW
		},
		breakdown: { entries: [entry('entry-1', '2bii', '2')], warnings: [] },
		students: [],
		marks: {},
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

export function storedDocument(): MarksheetDocument {
	return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as MarksheetDocument;
}
