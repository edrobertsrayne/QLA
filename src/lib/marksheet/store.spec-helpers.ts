// What the store specs share: an in-memory storage, stores over it, and the
// readers that let a test assert on the store's state. Test-only: nothing in
// the app imports this. The documents come from `fixtures.spec-helpers.ts`.

import { STORAGE_KEY } from './document.js';
import type { BreakdownEntry, MarksheetDocument, StoredStudent } from './document.js';
import { NOW as NOW_ISO, parsed } from './fixtures.spec-helpers.js';
import type { DocumentStorage } from './persistence.svelte.js';
import { MarksheetStore } from './store.svelte.js';

/** The store's clock in these specs: the moment the shared fixtures are stamped with. */
export const NOW = new Date(NOW_ISO);

export interface FakeStorage extends DocumentStorage {
	readonly map: Map<string, string>;
	/** Keys written, in order — the probe key included. */
	readonly writes: string[];
}

export function fakeStorage(initial: Record<string, string> = {}): FakeStorage {
	const map = new Map(Object.entries(initial));
	const writes: string[] = [];
	return {
		map,
		writes,
		get length() {
			return map.size;
		},
		key: (index) => [...map.keys()][index] ?? null,
		getItem: (key) => map.get(key) ?? null,
		setItem: (key, value) => {
			writes.push(key);
			map.set(key, value);
		},
		removeItem: (key) => {
			map.delete(key);
		}
	};
}

/** The writes of the marksheet document itself, however many other keys were touched. */
export function documentWrites(storage: FakeStorage): string[] {
	return storage.writes.filter((key) => key === STORAGE_KEY);
}

/**
 * Storage that refuses the writes `refuse` names and passes everything else
 * through: a full quota, or private browsing, as the error says.
 */
export function refusingWrites(
	storage: FakeStorage,
	refuse: (key: string) => boolean,
	error: Error = new DOMException('full', 'QuotaExceededError')
): DocumentStorage {
	return {
		get length() {
			return storage.length;
		},
		key: (index) => storage.key(index),
		getItem: (key) => storage.getItem(key),
		removeItem: (key) => storage.removeItem(key),
		setItem: (key, value) => {
			if (refuse(key)) throw error;
			storage.setItem(key, value);
		}
	};
}

export function storeWith(storage: DocumentStorage, now: () => Date = () => NOW): MarksheetStore {
	return new MarksheetStore({ storage, now });
}

/** A loaded store over a seeded, unconfirmed document, with its storage alongside. */
export function openStore(overrides: Partial<MarksheetDocument> = {}) {
	const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(parsed(overrides)) });
	const store = storeWith(storage);
	store.load();
	return { store, storage };
}

/** The document as it last reached storage. */
export function stored(storage: FakeStorage): MarksheetDocument {
	return JSON.parse(storage.getItem(STORAGE_KEY) ?? '') as MarksheetDocument;
}

/** An entry the document keyed by id, so a test can assert the store's state. */
export function entryOf(store: MarksheetStore, id: string): BreakdownEntry | undefined {
	return store.document?.breakdown.entries.find((candidate) => candidate.id === id);
}

/** A student the document keyed by id, so a test can assert the store's state. */
export function studentOf(store: MarksheetStore, id: string): StoredStudent | undefined {
	return store.document?.students.find((candidate) => candidate.id === id);
}

/** The id a structure command returned, asserting there is one. */
export function idOf(id: string | null): string {
	if (id === null) throw new Error('expected a new entry id');
	return id;
}
