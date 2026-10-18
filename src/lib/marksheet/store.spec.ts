import { describe, expect, it, vi } from 'vitest';
import { CORRUPT_KEY_PREFIX, DOCUMENT_SCHEMA_VERSION, STORAGE_KEY, markCount } from './document.js';
import type {
	BreakdownEntry,
	EntryValues,
	MarksheetDocument,
	StoredBreakdown,
	StoredStudent
} from './document.js';
import {
	AUTOSAVE_DEBOUNCE_MS,
	type DocumentStorage,
	type Unreadable
} from './persistence.svelte.js';
import { MarksheetStore } from './store.svelte.js';
import { progressOf } from './students.js';

const NOW = new Date('2026-01-01T10:00:00.000Z');

interface FakeStorage extends DocumentStorage {
	readonly map: Map<string, string>;
	/** Keys written, in order — the probe key included. */
	readonly writes: string[];
}

function fakeStorage(initial: Record<string, string> = {}): FakeStorage {
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

function storedDocument(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
	return {
		schemaVersion: DOCUMENT_SCHEMA_VERSION,
		createdAt: NOW.toISOString(),
		updatedAt: NOW.toISOString(),
		breakdownConfirmedAt: null,
		lastExportedAt: null,
		paper: {
			label: 'Ph1',
			className: null,
			sourceFilenames: ['paper.pdf'],
			parsedAt: NOW.toISOString()
		},
		breakdown: {
			entries: [
				{
					id: 'entry-1',
					label: '2bii',
					questionNumber: '2',
					marks: 4,
					summary: 'Explain the process shown',
					specPoint: '3.2.1.4',
					commandWord: 'Explain',
					ao: 'AO1'
				}
			],
			warnings: []
		},
		students: [],
		marks: {},
		...overrides
	};
}

function storeWith(storage: DocumentStorage, now: () => Date = () => NOW) {
	return new MarksheetStore({ storage, now });
}

/** One breakdown entry, for documents whose entries matter to the test. */
function entry(
	id: string,
	label: string,
	questionNumber: string,
	overrides: Partial<BreakdownEntry> = {}
): BreakdownEntry {
	return {
		id,
		label,
		questionNumber,
		marks: 4,
		summary: 'Explain the process shown',
		specPoint: '3.2.1.4',
		commandWord: 'Explain',
		ao: 'AO1',
		...overrides
	};
}

/** The values the parse produced for `entry()` after a label edit. */
function originValues(): EntryValues {
	return {
		label: '2bii',
		questionNumber: '2',
		marks: 4,
		summary: 'Explain the process shown',
		specPoint: '3.2.1.4',
		commandWord: 'Explain',
		ao: 'AO1'
	};
}

/** A loaded store over a seeded document, with its storage alongside. */
function openStore(overrides: Partial<MarksheetDocument> = {}) {
	const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(storedDocument(overrides)) });
	const store = storeWith(storage);
	store.load();
	return { store, storage };
}

/** The document as it last reached storage. */
function stored(storage: FakeStorage): MarksheetDocument {
	return JSON.parse(storage.getItem(STORAGE_KEY) ?? '') as MarksheetDocument;
}

/** Entries the document keyed by id, so a test can assert the store's state. */
function entryOf(store: MarksheetStore, id: string): BreakdownEntry | undefined {
	return store.document?.breakdown.entries.find((candidate) => candidate.id === id);
}

/** One student, for documents whose class the test is about. */
function student(id: string, firstName: string, surname: string): StoredStudent {
	return { id, firstName, surname, absent: false };
}

/** A student the document keyed by id, so a test can assert the store's state. */
function studentOf(store: MarksheetStore, id: string): StoredStudent | undefined {
	return store.document?.students.find((candidate) => candidate.id === id);
}

/** The id a structure command returned, asserting there is one. */
function idOf(id: string | null): string {
	if (id === null) throw new Error('expected a new entry id');
	return id;
}

/** The key an unreadable document was preserved under, asserting the load found one. */
function preservedKeyOf(unreadable: Unreadable | null): string {
	if (unreadable === null) throw new Error('expected an unreadable document');
	if (unreadable.preservedKey === null) throw new Error('expected a preserved copy');
	return unreadable.preservedKey;
}

/** Storage that only refuses writes of the marksheet document itself (a full quota). */
function unwritableDocument(storage: FakeStorage): DocumentStorage {
	return {
		get length() {
			return storage.length;
		},
		key: (index) => storage.key(index),
		getItem: storage.getItem,
		removeItem: storage.removeItem,
		setItem: (key, value) => {
			if (key === STORAGE_KEY) throw new Error('QuotaExceededError');
			storage.setItem(key, value);
		}
	};
}

/** Private browsing exposes storage that refuses every write. */
function unwritableStorage(): DocumentStorage {
	return {
		length: 0,
		key: () => null,
		getItem: () => null,
		setItem: () => {
			throw new Error('SecurityError');
		},
		removeItem: () => undefined
	};
}

describe('boot gate', () => {
	it('opens on upload when nothing is stored', () => {
		const storage = fakeStorage();
		const store = storeWith(storage);

		store.load();
		expect(store.document).toBeNull();
		expect(store.route()).toBe('/');
	});

	it('opens on the breakdown for an unconfirmed document', () => {
		const document = storedDocument({ breakdownConfirmedAt: null });
		const store = storeWith(fakeStorage({ [STORAGE_KEY]: JSON.stringify(document) }));

		store.load();

		expect(store.document).toEqual(document);
		expect(store.route()).toBe('/breakdown');
	});

	it('opens on the marksheet for a confirmed document', () => {
		const document = storedDocument({ breakdownConfirmedAt: NOW.toISOString() });
		const store = storeWith(fakeStorage({ [STORAGE_KEY]: JSON.stringify(document) }));

		store.load();
		expect(store.document).toEqual(document);
		expect(store.route()).toBe('/marksheet');
	});

	it('keeps an unreadable document under its own key and boots to upload', () => {
		const raw = '{"schemaVersion":99}';
		const storage = fakeStorage({ [STORAGE_KEY]: raw });
		const store = storeWith(storage);

		store.load();

		expect(store.unreadable).toEqual({
			preservedKey: `${CORRUPT_KEY_PREFIX}${NOW.toISOString()}`,
			raw
		});
		expect(storage.getItem(`${CORRUPT_KEY_PREFIX}${NOW.toISOString()}`)).toBe(raw);
		expect(storage.getItem(STORAGE_KEY)).toBe(raw);
		expect(store.document).toBeNull();
		expect(store.route()).toBe('/');
	});

	it('treats unparseable JSON as unreadable too', () => {
		const raw = 'not json at all';
		const storage = fakeStorage({ [STORAGE_KEY]: raw });

		const unreadable = storeWith(storage);
		unreadable.load();
		expect(unreadable.unreadable).not.toBeNull();
		expect(storage.getItem(STORAGE_KEY)).toBe(raw);
	});

	it('preserves a document written by a newer version, byte for byte', () => {
		const raw = JSON.stringify({
			...storedDocument({ breakdownConfirmedAt: NOW.toISOString() }),
			schemaVersion: DOCUMENT_SCHEMA_VERSION + 1
		});
		const storage = fakeStorage({ [STORAGE_KEY]: raw });
		const store = storeWith(storage);

		store.load();

		// Kept whole, under its own key: a version this app cannot read is still
		// the teacher's only copy of their marks.
		expect(storage.getItem(`${CORRUPT_KEY_PREFIX}${NOW.toISOString()}`)).toBe(raw);
		expect(storage.getItem(STORAGE_KEY)).toBe(raw);
		expect(store.document).toBeNull();
		expect(store.unreadable).toEqual({
			preservedKey: `${CORRUPT_KEY_PREFIX}${NOW.toISOString()}`,
			raw
		});
	});

	it('runs on upload when browser storage is unavailable', () => {
		const store = storeWith(unwritableStorage());

		store.load();
		expect(store.document).toBeNull();
		expect(store.saveState).toEqual({ kind: 'unavailable' });
		expect(store.route()).toBe('/');
	});

	it('keeps one copy of an unreadable document however often the gate runs', () => {
		const raw = '{"schemaVersion":99}';
		const storage = fakeStorage({ [STORAGE_KEY]: raw });
		let nowMs = Date.parse('2026-01-01T10:00:00.000Z');
		const clock = () => new Date(nowMs);
		const store = storeWith(storage, clock);

		store.load();
		const first = store.unreadable;
		nowMs += 60_000;
		store.load();
		const second = store.unreadable;
		nowMs += 60_000;
		// A second page load starts a fresh store over the same storage.
		const reloaded = storeWith(storage, clock);
		reloaded.load();
		const afterReload = reloaded.unreadable;

		const preservedKey = preservedKeyOf(first);
		expect(preservedKeyOf(second)).toBe(preservedKey);
		expect(preservedKeyOf(afterReload)).toBe(preservedKey);
		expect(
			[...storage.map.keys()].filter((key) => key.startsWith(CORRUPT_KEY_PREFIX))
		).toHaveLength(1);
		expect(storage.getItem(STORAGE_KEY)).toBe(raw);
	});

	it('still reads the stored document when the browser is full', () => {
		const document = storedDocument({ breakdownConfirmedAt: NOW.toISOString() });
		const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(document) });
		const full: DocumentStorage = {
			get length() {
				return storage.length;
			},
			key: (index) => storage.key(index),
			getItem: storage.getItem,
			removeItem: storage.removeItem,
			setItem: () => {
				throw new DOMException('full', 'QuotaExceededError');
			}
		};
		const store = storeWith(full);

		store.load();
		expect(store.document).toEqual(document);
		expect(store.route()).toBe('/marksheet');
	});

	it('says no copy was kept when the preserved copy cannot be written', () => {
		const raw = '{"schemaVersion":99}';
		const storage = fakeStorage({ [STORAGE_KEY]: raw });
		const store = storeWith({
			get length() {
				return storage.length;
			},
			key: (index) => storage.key(index),
			getItem: storage.getItem,
			removeItem: storage.removeItem,
			setItem: (key, value) => {
				if (key.startsWith(CORRUPT_KEY_PREFIX)) throw new Error('QuotaExceededError');
				storage.setItem(key, value);
			}
		});

		store.load();
		expect(store.document).toBeNull();
		expect(store.unreadable).toEqual({ preservedKey: null, raw });
	});
});

describe('load', () => {
	it('silently drops marks whose student or entry no longer exists', () => {
		const document = storedDocument({
			students: [{ id: 'student-1', firstName: 'Ada', surname: 'Lovelace', absent: false }],
			marks: {
				'student-1': { 'entry-1': 3, 'entry-gone': 2 },
				'student-gone': { 'entry-1': 1 }
			}
		});
		const store = storeWith(fakeStorage({ [STORAGE_KEY]: JSON.stringify(document) }));

		store.load();

		expect(store.document?.marks).toEqual({ 'student-1': { 'entry-1': 3 } });
	});

	it('leaves the stored document untouched when it re-reads a clean store', () => {
		const document = storedDocument();
		const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(document) });
		const store = storeWith(storage);
		store.load();

		store.load();
		expect(store.document).toEqual(document);
		expect(storage.getItem(STORAGE_KEY)).toBe(JSON.stringify(document));
	});

	it("reads the parse's own values back with an entry that records them", () => {
		const origin = originValues();
		const storage = fakeStorage({
			[STORAGE_KEY]: JSON.stringify(
				storedDocument({
					breakdown: { entries: [entry('e', '2b', '2', { original: origin })], warnings: [] }
				})
			)
		});
		const store = storeWith(storage);

		store.load();

		expect(store.document?.breakdown.entries[0].original).toEqual(origin);
	});

	it('reads an entry that records no parse values as added by the teacher', () => {
		const storage = fakeStorage({
			[STORAGE_KEY]: JSON.stringify(
				storedDocument({
					breakdown: { entries: [entry('e', '', '', { original: null })], warnings: [] }
				})
			)
		});
		const store = storeWith(storage);

		store.load();

		expect(store.document?.breakdown.entries[0].original).toBeNull();
	});

	it('reads a document written before entries recorded the parse’s values', () => {
		// #35 wrote entries as they are in `storedDocument()`: no recorded values.
		const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(storedDocument()) });
		const store = storeWith(storage);

		store.load();
		expect(store.document).not.toBeNull();
		expect(entryOf(store, 'entry-1')?.label).toBe('2bii');
		expect(store.document?.breakdown.entries[0]).not.toHaveProperty('original');
	});

	it('treats an entry reciting nonsense as its parse values as unreadable', () => {
		const raw = JSON.stringify(storedDocument()).replace(
			'"ao":"AO1"',
			'"ao":"AO1","original":{"label":7}'
		);
		const storage = fakeStorage({ [STORAGE_KEY]: raw });

		const unreadable = storeWith(storage);
		unreadable.load();
		expect(unreadable.unreadable).not.toBeNull();
		expect(storage.getItem(STORAGE_KEY)).toBe(raw);
	});
});

describe('createFromParse', () => {
	const input = {
		breakdown: {
			questions: [
				{
					id: '1a',
					questionNumber: '1',
					marks: 2,
					summary: 'Explain the process shown',
					specPoint: null,
					commandWord: 'Explain',
					ao: 'AO1' as const
				},
				{
					id: '2bii',
					questionNumber: '2',
					marks: 4,
					summary: 'Describe the rate change',
					specPoint: '3.2.1.4',
					commandWord: 'Describe',
					ao: null
				}
			]
		},
		warnings: [
			{ questionId: '2bii', code: 'SUMMARY_LENGTH', message: '2 words; expected 3–8 words.' },
			{ questionId: null, code: 'SPEC_UNREADABLE', message: 'Specification could not be read.' }
		],
		usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, estCost: 0.001 },
		filenames: ['paper.pdf', 'markscheme.pdf']
	};

	it('writes an unconfirmed document with generated entry ids and re-keyed warnings', () => {
		const storage = fakeStorage();
		const store = storeWith(storage);

		store.createFromParse(input);

		const stored = JSON.parse(storage.getItem(STORAGE_KEY) ?? '') as MarksheetDocument;
		expect(stored.schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);
		expect(stored.breakdownConfirmedAt).toBeNull();
		expect(stored.lastExportedAt).toBeNull();
		expect(stored.createdAt).toBe(NOW.toISOString());
		expect(stored.updatedAt).toBe(NOW.toISOString());
		expect(stored.paper).toEqual({
			label: 'paper',
			className: null,
			sourceFilenames: ['paper.pdf', 'markscheme.pdf'],
			parsedAt: NOW.toISOString()
		});
		expect(stored.students).toEqual([]);
		expect(stored.marks).toEqual({});

		const entries = stored.breakdown.entries;
		expect(entries.map((entry) => entry.label)).toEqual(['1a', '2bii']);
		expect(entries.map((entry) => entry.questionNumber)).toEqual(['1', '2']);
		expect(entries.map((entry) => entry.marks)).toEqual([2, 4]);
		expect(entries.map((entry) => entry.ao)).toEqual(['AO1', null]);
		const ids = entries.map((entry) => entry.id);
		expect(new Set(ids).size).toBe(2);
		for (const [index, id] of ids.entries()) {
			expect(id).not.toBe('');
			expect(id).not.toBe(entries[index].label);
		}

		expect(stored.breakdown.warnings).toEqual([
			{ questionId: ids[1], code: 'SUMMARY_LENGTH', message: '2 words; expected 3–8 words.' },
			{ questionId: null, code: 'SPEC_UNREADABLE', message: 'Specification could not be read.' }
		]);

		expect(storage.getItem(STORAGE_KEY)).not.toContain('promptTokens');
	});

	it("records the parse's own values with each entry, so an edit shows as a difference", () => {
		const storage = fakeStorage();
		const store = storeWith(storage);

		store.createFromParse(input);

		expect(stored(storage).breakdown.entries.map((entry) => entry.original)).toEqual([
			{
				label: '1a',
				questionNumber: '1',
				marks: 2,
				summary: 'Explain the process shown',
				specPoint: null,
				commandWord: 'Explain',
				ao: 'AO1'
			},
			{
				label: '2bii',
				questionNumber: '2',
				marks: 4,
				summary: 'Describe the rate change',
				specPoint: '3.2.1.4',
				commandWord: 'Describe',
				ao: null
			}
		]);
	});

	it('keeps this run usage in memory only, and routes to the breakdown', () => {
		const store = storeWith(fakeStorage());

		store.createFromParse(input);

		expect(store.runUsage).toEqual(input.usage);
		expect(store.route()).toBe('/breakdown');
	});

	it('is the first paint on reload: the same entries and ids come back', () => {
		const storage = fakeStorage();
		const first = storeWith(storage);
		first.createFromParse(input);

		const reloaded = storeWith(storage);
		reloaded.load();

		expect(reloaded.document?.breakdown.entries).toEqual(first.document?.breakdown.entries);
		const ids = reloaded.document?.breakdown.entries.map((entry) => entry.id) ?? [];
		expect(ids).toHaveLength(2);
		expect(new Set(ids).size).toBe(2);
	});

	it('labels the paper after the first source filename', () => {
		const storage = fakeStorage();
		storeWith(storage).createFromParse({ ...input, filenames: ['10X Ph1 2026.pdf'] });

		const stored = JSON.parse(storage.getItem(STORAGE_KEY) ?? '') as MarksheetDocument;
		expect(stored.paper.label).toBe('10X Ph1 2026');
	});

	it('keeps a warning beside the table when its parse label is ambiguous', () => {
		const storage = fakeStorage();
		const store = storeWith(storage);
		const duplicate = {
			...input.breakdown.questions[1],
			id: '2bii',
			summary: 'Describe the rate change'
		};
		store.createFromParse({
			...input,
			breakdown: { questions: [input.breakdown.questions[1], duplicate] },
			warnings: [
				{ questionId: '2bii', code: 'DUPLICATE_ID', message: "Duplicate question id '2bii'." },
				{ questionId: 'q[0]', code: 'EMPTY_ID', message: 'Entry q[0] has an empty question id.' }
			],
			filenames: ['paper.pdf']
		});

		const stored = JSON.parse(storage.getItem(STORAGE_KEY) ?? '') as MarksheetDocument;
		expect(stored.breakdown.entries).toHaveLength(2);
		expect(stored.breakdown.warnings).toEqual([
			{ questionId: null, code: 'DUPLICATE_ID', message: "Duplicate question id '2bii'." },
			{ questionId: null, code: 'EMPTY_ID', message: 'Entry q[0] has an empty question id.' }
		]);
	});

	it('leaves the label null when the run had no filename', () => {
		const storage = fakeStorage();
		storeWith(storage).createFromParse({ ...input, filenames: [] });

		const stored = JSON.parse(storage.getItem(STORAGE_KEY) ?? '') as MarksheetDocument;
		expect(stored.paper.label).toBeNull();
	});

	it('keeps working, and reporting unavailable, when the browser refuses writes', () => {
		const store = storeWith(unwritableStorage());
		store.load();

		store.createFromParse(input);

		expect(store.document?.breakdown.entries).toHaveLength(2);
		expect(store.route()).toBe('/breakdown');
		expect(store.saveState).toEqual({ kind: 'unavailable' });

		// The next route's gate must not re-read storage over an unsaved parse.
		store.load();

		expect(store.document?.breakdown.entries).toHaveLength(2);
		expect(store.route()).toBe('/breakdown');
	});

	it('keeps an unsaved parse in the tab when the write is refused', () => {
		const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(storedDocument()) });
		const store = storeWith(unwritableDocument(storage));
		store.load();

		store.createFromParse(input);
		expect(store.saveState.kind).toBe('failed');

		store.load();

		expect(store.document?.breakdown.entries.map((entry) => entry.label)).toEqual(['1a', '2bii']);
		expect(store.route()).toBe('/breakdown');
	});
});

describe('autosave', () => {
	it('debounces a mutation by 500 ms and writes once', () => {
		vi.useFakeTimers();
		try {
			const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(storedDocument()) });
			const store = storeWith(storage);
			store.load();

			store.setPaperLabel('10X/Ph1');
			expect(storage.writes.filter((key) => key === STORAGE_KEY)).toEqual([]);
			expect(store.saveState).toEqual({ kind: 'saving' });

			vi.advanceTimersByTime(499);
			expect(storage.writes.filter((key) => key === STORAGE_KEY)).toEqual([]);

			vi.advanceTimersByTime(1);
			expect(storage.writes.filter((key) => key === STORAGE_KEY)).toEqual([STORAGE_KEY]);
			const stored = JSON.parse(storage.getItem(STORAGE_KEY) ?? '') as MarksheetDocument;
			expect(stored.paper.label).toBe('10X/Ph1');
			expect(store.saveState).toEqual({ kind: 'saved', at: NOW });
		} finally {
			vi.useRealTimers();
		}
	});

	it('collapses rapid mutations into one write of the last value', () => {
		vi.useFakeTimers();
		try {
			const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(storedDocument()) });
			const store = storeWith(storage);
			store.load();

			store.setPaperLabel('10X');
			vi.advanceTimersByTime(200);
			store.setPaperLabel('10X/Ph1');
			vi.advanceTimersByTime(500);

			expect(storage.writes.filter((key) => key === STORAGE_KEY)).toEqual([STORAGE_KEY]);
			const stored = JSON.parse(storage.getItem(STORAGE_KEY) ?? '') as MarksheetDocument;
			expect(stored.paper.label).toBe('10X/Ph1');
		} finally {
			vi.useRealTimers();
		}
	});

	it('flushes a pending change immediately', () => {
		vi.useFakeTimers();
		try {
			const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(storedDocument()) });
			const store = storeWith(storage);
			store.load();

			store.setPaperLabel('10X/Ph1');
			store.flush();

			const stored = JSON.parse(storage.getItem(STORAGE_KEY) ?? '') as MarksheetDocument;
			expect(stored.paper.label).toBe('10X/Ph1');
			expect(store.saveState).toEqual({ kind: 'saved', at: NOW });

			vi.advanceTimersByTime(500);
			expect(storage.writes.filter((key) => key === STORAGE_KEY)).toEqual([STORAGE_KEY]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('stamps updatedAt when the change is made, not when it is written', () => {
		vi.useFakeTimers();
		try {
			const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(storedDocument()) });
			let nowMs = Date.parse('2026-01-01T10:00:00.000Z');
			const store = storeWith(storage, () => new Date(nowMs));
			store.load();

			nowMs += 30_000;
			store.setPaperLabel('10X/Ph1');
			nowMs += 30_000;
			vi.advanceTimersByTime(500);

			const stored = JSON.parse(storage.getItem(STORAGE_KEY) ?? '') as MarksheetDocument;
			expect(stored.paper.label).toBe('10X/Ph1');
			expect(stored.createdAt).toBe('2026-01-01T10:00:00.000Z');
			expect(stored.updatedAt).toBe('2026-01-01T10:00:30.000Z');
		} finally {
			vi.useRealTimers();
		}
	});

	it('does nothing when there is nothing pending', () => {
		const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(storedDocument()) });
		const store = storeWith(storage);
		store.load();

		store.flush();

		expect(storage.writes.filter((key) => key === STORAGE_KEY)).toEqual([]);
	});

	it('stops autosaving once a write fails, without retrying', () => {
		vi.useFakeTimers();
		try {
			const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(storedDocument()) });
			const store = storeWith(unwritableDocument(storage));
			store.load();

			store.setPaperLabel('10X');
			vi.advanceTimersByTime(500);
			expect(store.saveState.kind).toBe('failed');

			store.setPaperLabel('10X/Ph1');
			vi.advanceTimersByTime(500);
			expect(store.saveState.kind).toBe('failed');
			expect(storage.getItem(STORAGE_KEY)).toBe(JSON.stringify(storedDocument()));
		} finally {
			vi.useRealTimers();
		}
	});

	it('names the moment the unsaved changes began when a write is refused', () => {
		vi.useFakeTimers();
		try {
			const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(storedDocument()) });
			let nowMs = NOW.getTime();
			const store = storeWith(unwritableDocument(storage), () => new Date(nowMs));
			// The document as stored reached storage at 10:00.
			store.load();

			nowMs += 60_000;
			store.setPaperLabel('10X');
			vi.advanceTimersByTime(500);

			expect(store.saveState).toEqual({ kind: 'failed', since: NOW });

			// No retry, so the moment does not move however long the tab carries
			// the changes: everything after 10:00 is only in this tab.
			nowMs += 300_000;
			store.setPaperLabel('10X/Ph1');
			vi.advanceTimersByTime(500);

			expect(store.saveState).toEqual({ kind: 'failed', since: NOW });
		} finally {
			vi.useRealTimers();
		}
	});

	it('moves that moment on once a write lands, so a later refusal names the last one', () => {
		vi.useFakeTimers();
		try {
			const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(storedDocument()) });
			let refuse = false;
			const flaky: DocumentStorage = {
				get length() {
					return storage.length;
				},
				key: (index) => storage.key(index),
				getItem: (key) => storage.getItem(key),
				removeItem: (key) => storage.removeItem(key),
				setItem: (key, value) => {
					if (refuse && key === STORAGE_KEY) throw new Error('QuotaExceededError');
					storage.setItem(key, value);
				}
			};
			let nowMs = NOW.getTime();
			const store = storeWith(flaky, () => new Date(nowMs));
			store.load();

			nowMs += 60_000;
			store.setPaperLabel('10X');
			vi.advanceTimersByTime(500);
			expect(store.saveState).toEqual({ kind: 'saved', at: new Date(nowMs) });

			refuse = true;
			nowMs += 60_000;
			store.setPaperLabel('10X/Ph1');
			vi.advanceTimersByTime(500);

			expect(store.saveState).toEqual({ kind: 'failed', since: new Date(nowMs - 60_000) });
		} finally {
			vi.useRealTimers();
		}
	});

	it('does not re-read storage over changes the tab has not saved', () => {
		vi.useFakeTimers();
		try {
			const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(storedDocument()) });
			const store = storeWith(storage);
			store.load();

			store.setPaperLabel('10X/Ph1');
			store.load();

			expect(store.document?.paper.label).toBe('10X/Ph1');
		} finally {
			vi.useRealTimers();
		}
	});

	it('keeps the document in hand, and its undo, when the gate reads again after a save', () => {
		vi.useFakeTimers();
		try {
			const { store } = openStore({
				breakdownConfirmedAt: NOW.toISOString(),
				students: [student('student-1', 'Ada', 'Lovelace')]
			});
			store.removeStudent('student-1');
			vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
			const inHand = store.document;

			store.load();

			expect(store.document).toBe(inHand);
			expect(store.undoable).toMatchObject({ kind: 'student-removal' });
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('wipe', () => {
	it('removes only the marksheet document', () => {
		const corruptKey = `${CORRUPT_KEY_PREFIX}2026-01-01T09:00:00.000Z`;
		const storage = fakeStorage({
			[STORAGE_KEY]: JSON.stringify(storedDocument()),
			'qla:theme': 'dark',
			[corruptKey]: 'not json'
		});
		const store = storeWith(storage);
		store.load();

		store.wipe();

		expect(storage.getItem(STORAGE_KEY)).toBeNull();
		expect(storage.getItem('qla:theme')).toBe('dark');
		expect(storage.getItem(corruptKey)).toBe('not json');
		expect(store.document).toBeNull();
		expect(store.runUsage).toBeNull();
		expect(store.route()).toBe('/');
	});

	it('cancels a pending write so it cannot resurrect the document', () => {
		vi.useFakeTimers();
		try {
			const storage = fakeStorage();
			const store = storeWith(storage);
			store.createFromParse({
				breakdown: { questions: [] },
				warnings: [],
				usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estCost: 0 },
				filenames: ['paper.pdf']
			});
			store.setPaperLabel('10X');
			store.wipe();

			vi.advanceTimersByTime(500);

			expect(storage.getItem(STORAGE_KEY)).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('breakdown edits', () => {
	it('edits every field in place, writing once', () => {
		vi.useFakeTimers();
		try {
			const { store, storage } = openStore();

			// A label is stored trimmed: it becomes a marksheet column heading.
			store.setEntryLabel('entry-1', ' 2b ');
			store.setBandQuestionNumber(['entry-1'], '3');
			store.setEntryMarks('entry-1', 6);
			store.setEntrySummary('entry-1', 'Explain the rate change');
			store.setEntrySpecPoint('entry-1', '3.2.2.1');
			store.setEntryCommandWord('entry-1', 'State');
			store.setEntryAo('entry-1', 'AO3');
			vi.advanceTimersByTime(500);

			expect(stored(storage).breakdown.entries).toEqual([
				{
					id: 'entry-1',
					label: '2b',
					questionNumber: '3',
					marks: 6,
					summary: 'Explain the rate change',
					specPoint: '3.2.2.1',
					commandWord: 'State',
					ao: 'AO3',
					// The values the entry carried when it was first edited: #35's
					// stored document recorded none.
					original: originValues()
				}
			]);
			expect(storage.writes.filter((key) => key === STORAGE_KEY)).toEqual([STORAGE_KEY]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('leaves an entry the teacher never touched without recorded parse values', () => {
		const { store } = openStore({
			breakdown: {
				entries: [entry('entry-1', '1a', '1'), entry('entry-2', '1b', '1')],
				warnings: []
			}
		});

		store.setEntrySummary('entry-2', 'Something else');

		expect(entryOf(store, 'entry-1')).not.toHaveProperty('original');
		expect(entryOf(store, 'entry-2')?.original).toEqual({
			...originValues(),
			label: '1b',
			questionNumber: '1'
		});
	});

	it('refuses marks that are not positive whole numbers', () => {
		const { store } = openStore();

		for (const refused of [2.5, 0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
			store.setEntryMarks('entry-1', refused);
			expect(entryOf(store, 'entry-1')?.marks).toBe(4);
		}
	});

	it('takes a positive whole number, and empties the cell back to no available marks', () => {
		const { store } = openStore();

		store.setEntryMarks('entry-1', 7);
		expect(entryOf(store, 'entry-1')?.marks).toBe(7);

		store.setEntryMarks('entry-1', null);
		expect(entryOf(store, 'entry-1')?.marks).toBeNull();
	});

	it('reads a blank spec point or command word as none, trimming what it keeps', () => {
		const { store } = openStore();

		store.setEntrySpecPoint('entry-1', '  ');
		store.setEntryCommandWord('entry-1', '');
		store.setEntryAo('entry-1', null);

		expect(entryOf(store, 'entry-1')).toMatchObject({
			specPoint: null,
			commandWord: null,
			ao: null
		});

		store.setEntrySpecPoint('entry-1', ' 3.2.1.4 ');
		store.setEntryCommandWord('entry-1', ' Describe ');

		expect(entryOf(store, 'entry-1')).toMatchObject({
			specPoint: '3.2.1.4',
			commandWord: 'Describe'
		});
	});

	it('gives a band its new question number, re-banding its rows', () => {
		const { store } = openStore({
			breakdown: {
				entries: [
					entry('entry-1', '1a', '1'),
					entry('entry-2', '1b', '1'),
					entry('entry-3', '2a', '2')
				],
				warnings: []
			}
		});

		store.setBandQuestionNumber(['entry-1', 'entry-2'], '5');

		expect(store.document?.breakdown.entries.map((one) => one.questionNumber)).toEqual([
			'5',
			'5',
			'2'
		]);
		expect(store.questionBands.map((band) => band.entries.length)).toEqual([2, 1]);
	});

	it('ignores an edit aimed at an entry that is not there', () => {
		vi.useFakeTimers();
		try {
			const { store, storage } = openStore();

			store.setEntryLabel('entry-gone', '2b');
			store.setEntryMarks('entry-gone', 3);
			vi.advanceTimersByTime(500);

			expect(entryOf(store, 'entry-1')?.label).toBe('2bii');
			expect(storage.writes.filter((key) => key === STORAGE_KEY)).toEqual([]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('leaves a confirmed breakdown alone', () => {
		const { store } = openStore({ breakdownConfirmedAt: NOW.toISOString() });

		store.setEntryLabel('entry-1', '2b');
		store.setBandQuestionNumber(['entry-1'], '9');
		store.setEntryMarks('entry-1', 9);
		store.setEntrySummary('entry-1', 'Something else');
		store.setEntrySpecPoint('entry-1', '9.9.9.9');
		store.setEntryCommandWord('entry-1', 'State');
		store.setEntryAo('entry-1', 'AO3');

		expect(entryOf(store, 'entry-1')).toEqual(storedDocument().breakdown.entries[0]);
	});
});

describe('breakdown structure', () => {
	const threeEntries: Partial<MarksheetDocument> = {
		breakdown: {
			entries: [
				entry('entry-1', '1a', '1'),
				entry('entry-2', '1b', '1'),
				entry('entry-3', '2a', '2')
			],
			warnings: []
		}
	};

	it('inserts a teacher-added entry below the entry named', () => {
		vi.useFakeTimers();
		try {
			const { store, storage } = openStore(threeEntries);

			const id = idOf(store.insertEntryAfter('entry-1'));

			const inserted = entryOf(store, id);
			expect(inserted).toEqual({
				id,
				label: '',
				// It joins the question it was added under: the number is one edit away
				// when it belongs to a new one.
				questionNumber: '1',
				marks: null,
				summary: '',
				specPoint: null,
				commandWord: null,
				ao: null,
				// The teacher's own row, so the table can mark it as added.
				original: null
			});
			expect(store.document?.breakdown.entries.map((one) => one.id)).toEqual([
				'entry-1',
				id,
				'entry-2',
				'entry-3'
			]);

			vi.advanceTimersByTime(500);
			expect(stored(storage).breakdown.entries.map((one) => one.id)).toEqual([
				'entry-1',
				id,
				'entry-2',
				'entry-3'
			]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('adds a row at the end as a question of its own', () => {
		const { store } = openStore(threeEntries);

		const id = idOf(store.appendEntry());

		expect(store.document?.breakdown.entries.map((one) => one.id)).toEqual([
			'entry-1',
			'entry-2',
			'entry-3',
			id
		]);
		// A question of its own, for the paper's last question — the one a parse
		// most often misses. Numbering it re-numbers nothing else.
		expect(entryOf(store, id)?.questionNumber).toBe('');
		expect(store.questionBands.map((band) => band.questionNumber)).toEqual(['1', '2', '']);
	});

	it('adds a row at the end of a breakdown with no entries', () => {
		const { store } = openStore({ breakdown: { entries: [], warnings: [] } });

		const id = idOf(store.appendEntry());

		expect(store.document?.breakdown.entries).toHaveLength(1);
		expect(entryOf(store, id)?.questionNumber).toBe('');
	});

	it('refuses to insert below an entry that is not there', () => {
		vi.useFakeTimers();
		try {
			const { store, storage } = openStore(threeEntries);

			expect(store.insertEntryAfter('entry-gone')).toBeNull();

			expect(store.document?.breakdown.entries).toHaveLength(3);
			vi.advanceTimersByTime(500);
			expect(storage.writes.filter((key) => key === STORAGE_KEY)).toEqual([]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('deletes an entry and takes its marks and findings with it', () => {
		const { store } = openStore({
			...threeEntries,
			students: [{ id: 'student-1', firstName: 'Ada', surname: 'Lovelace', absent: false }],
			marks: { 'student-1': { 'entry-2': 3, 'entry-3': 1 } },
			breakdown: {
				entries: (threeEntries.breakdown as StoredBreakdown).entries,
				warnings: [
					{ questionId: 'entry-2', code: 'SUMMARY_LENGTH', message: 'Two words.' },
					{ questionId: 'entry-3', code: 'MARKS_UNKNOWN', message: 'No marks read.' },
					{ questionId: null, code: 'SPEC_UNREADABLE', message: 'No specification.' }
				]
			}
		});

		expect(store.deleteEntry('entry-2')).toBe(true);

		expect(store.document?.breakdown.entries.map((one) => one.id)).toEqual(['entry-1', 'entry-3']);
		expect(store.document?.marks).toEqual({ 'student-1': { 'entry-3': 1 } });
		// The finding was about an entry that is gone: nothing could show it again.
		expect(store.document?.breakdown.warnings).toEqual([
			{ questionId: 'entry-3', code: 'MARKS_UNKNOWN', message: 'No marks read.' },
			{ questionId: null, code: 'SPEC_UNREADABLE', message: 'No specification.' }
		]);
	});

	it('offers one deletion to undo, back where it was with its marks and findings', () => {
		const { store } = openStore({
			...threeEntries,
			students: [{ id: 'student-1', firstName: 'Ada', surname: 'Lovelace', absent: false }],
			marks: { 'student-1': { 'entry-2': 3 } },
			breakdown: {
				entries: (threeEntries.breakdown as StoredBreakdown).entries,
				warnings: [
					{ questionId: 'entry-2', code: 'SUMMARY_LENGTH', message: 'Two words.' },
					{ questionId: null, code: 'SPEC_UNREADABLE', message: 'No specification.' }
				]
			}
		});

		store.deleteEntry('entry-2');
		expect(store.undoable).toMatchObject({ kind: 'entry-removal' });

		expect(store.undo()).toBe(true);

		expect(store.document?.breakdown.entries.map((one) => one.id)).toEqual([
			'entry-1',
			'entry-2',
			'entry-3'
		]);
		expect(entryOf(store, 'entry-2')?.label).toBe('1b');
		expect(store.document?.marks).toEqual({ 'student-1': { 'entry-2': 3 } });
		expect(store.document?.breakdown.warnings.map((warning) => warning.questionId)).toEqual([
			'entry-2',
			null
		]);
		expect(store.undoable).toBeNull();
	});

	it('takes nothing back twice', () => {
		const { store } = openStore(threeEntries);

		store.deleteEntry('entry-2');
		store.undo();
		store.undo();

		expect(store.document?.breakdown.entries).toHaveLength(3);
	});

	it('clears the undo at the next change', () => {
		const { store } = openStore(threeEntries);

		store.deleteEntry('entry-2');
		store.setPaperLabel('10X/Ph1');
		expect(store.undoable).toBeNull();

		expect(store.undo()).toBe(false);
		expect(store.document?.breakdown.entries.map((one) => one.id)).toEqual(['entry-1', 'entry-3']);
	});

	it('keeps the undo when a change is refused', () => {
		const { store } = openStore(threeEntries);

		store.deleteEntry('entry-2');
		// Refused: a mark that is not a whole number, and an entry that is not there.
		store.setEntryMarks('entry-1', 2.5);
		store.setEntryLabel('entry-gone', '9z');

		expect(store.undoable).not.toBeNull();
		expect(store.undo()).toBe(true);
		expect(store.document?.breakdown.entries.map((one) => one.id)).toEqual([
			'entry-1',
			'entry-2',
			'entry-3'
		]);
	});

	it('drops the undo with the document it belongs to', () => {
		const { store } = openStore(threeEntries);

		store.deleteEntry('entry-2');
		store.wipe();

		expect(store.undoable).toBeNull();
		expect(store.undo()).toBe(false);
	});

	it('moves an entry up and down', () => {
		const { store } = openStore(threeEntries);

		expect(store.moveEntry('entry-2', 1)).toBe(true);
		expect(store.document?.breakdown.entries.map((one) => one.id)).toEqual([
			'entry-1',
			'entry-3',
			'entry-2'
		]);

		expect(store.moveEntry('entry-2', -1)).toBe(true);
		expect(store.document?.breakdown.entries.map((one) => one.id)).toEqual([
			'entry-1',
			'entry-2',
			'entry-3'
		]);
	});

	it('refuses to move an entry past either end, or one that is not there', () => {
		vi.useFakeTimers();
		try {
			const { store, storage } = openStore(threeEntries);

			expect(store.moveEntry('entry-1', -1)).toBe(false);
			expect(store.moveEntry('entry-3', 1)).toBe(false);
			expect(store.moveEntry('entry-gone', -1)).toBe(false);

			expect(store.document?.breakdown.entries.map((one) => one.id)).toEqual([
				'entry-1',
				'entry-2',
				'entry-3'
			]);
			vi.advanceTimersByTime(500);
			expect(storage.writes.filter((key) => key === STORAGE_KEY)).toEqual([]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('leaves a confirmed breakdown alone', () => {
		const { store } = openStore({ ...threeEntries, breakdownConfirmedAt: NOW.toISOString() });

		expect(store.insertEntryAfter('entry-1')).toBeNull();
		expect(store.appendEntry()).toBeNull();
		expect(store.deleteEntry('entry-1')).toBe(false);
		expect(store.moveEntry('entry-1', 1)).toBe(false);
		expect(store.undo()).toBe(false);

		expect(store.document?.breakdown.entries).toHaveLength(3);
		expect(store.undoable).toBeNull();
	});
});

describe('confirm breakdown', () => {
	it('confirms a complete breakdown, saving it so a reload lands on the marksheet', () => {
		vi.useFakeTimers();
		try {
			const { store, storage } = openStore();
			expect(store.blockers.blocked).toBe(false);

			expect(store.confirmBreakdown()).toBe(true);
			vi.advanceTimersByTime(500);

			expect(entryOf(store, 'entry-1')).toEqual(storedDocument().breakdown.entries[0]);
			expect(store.route()).toBe('/marksheet');
			expect(stored(storage).breakdownConfirmedAt).toBe(NOW.toISOString());

			const reloaded = storeWith(storage);
			reloaded.load();
			expect(reloaded.route()).toBe('/marksheet');
		} finally {
			vi.useRealTimers();
		}
	});

	it('is already done when the breakdown was confirmed before', () => {
		const confirmedAt = '2025-12-01T09:00:00.000Z';
		const { store } = openStore({ breakdownConfirmedAt: confirmedAt });

		expect(store.confirmBreakdown()).toBe(true);

		expect(store.document?.breakdownConfirmedAt).toBe(confirmedAt);
	});

	it('refuses while an entry has no available marks, naming it', () => {
		const { store } = openStore({
			breakdown: {
				entries: [
					entry('entry-1', '1a', '1', { marks: 3 }),
					entry('entry-2', '2bii', '2', { marks: null })
				],
				warnings: []
			}
		});

		expect(store.confirmBreakdown()).toBe(false);

		expect(store.document?.breakdownConfirmedAt).toBeNull();
		expect(store.route()).toBe('/breakdown');
		expect(store.blockers).toMatchObject({
			blocked: true,
			noAvailableMarks: [expect.objectContaining({ label: '2bii' })],
			emptyLabels: [],
			duplicateLabels: []
		});
	});

	it('refuses while a label is empty or repeated, naming the offenders', () => {
		const { store } = openStore({
			breakdown: {
				entries: [
					entry('entry-1', '2bii', '2'),
					entry('entry-2', '2bii', '2'),
					entry('entry-3', '   ', '3')
				],
				warnings: []
			}
		});

		expect(store.confirmBreakdown()).toBe(false);

		expect(store.document?.breakdownConfirmedAt).toBeNull();
		expect(store.blockers.emptyLabels.map((offender) => offender.id)).toEqual(['entry-3']);
		expect(store.blockers.duplicateLabels.map((offender) => offender.id)).toEqual([
			'entry-1',
			'entry-2'
		]);
	});

	it('confirms once the blockers are fixed', () => {
		const { store } = openStore({
			breakdown: { entries: [entry('entry-1', '', '1', { marks: null })], warnings: [] }
		});
		expect(store.confirmBreakdown()).toBe(false);

		store.setEntryLabel('entry-1', '1a');
		store.setEntryMarks('entry-1', 2);

		expect(store.confirmBreakdown()).toBe(true);
		expect(store.route()).toBe('/marksheet');
	});
});

describe('unlocking the breakdown', () => {
	/** A confirmed marksheet with one student and one mark: what an unlock must not disturb. */
	function openConfirmed(overrides: Partial<MarksheetDocument> = {}) {
		return openStore({
			breakdownConfirmedAt: NOW.toISOString(),
			students: [student('student-1', 'Ada', 'Lovelace')],
			marks: { 'student-1': { 'entry-1': 3 } },
			...overrides
		});
	}

	it('makes a confirmed breakdown editable again, leaving the marks exactly as they were', () => {
		vi.useFakeTimers();
		try {
			const { store, storage } = openConfirmed();

			// Answered before the unlock: a confirmed breakdown is what marks are keyed
			// against, so an edit is refused until the teacher says so.
			store.setEntryLabel('entry-1', 'nope');
			expect(entryOf(store, 'entry-1')?.label).toBe('2bii');

			expect(store.unlockBreakdown()).toBe(true);
			vi.advanceTimersByTime(500);

			expect(entryOf(store, 'entry-1')?.label).toBe('2bii');
			expect(store.route()).toBe('/breakdown');
			expect(stored(storage).breakdownConfirmedAt).toBeNull();

			// Editable now, and the edits take: a wrong entry is fixable mid-marking.
			store.setEntryLabel('entry-1', '2b');
			store.setEntryMarks('entry-1', 6);
			expect(entryOf(store, 'entry-1')?.label).toBe('2b');
			expect(entryOf(store, 'entry-1')?.marks).toBe(6);
			expect(store.document?.marks).toEqual({ 'student-1': { 'entry-1': 3 } });
		} finally {
			vi.useRealTimers();
		}
	});

	it('is already done when the breakdown was never confirmed', () => {
		vi.useFakeTimers();
		try {
			const { store, storage } = openStore();

			expect(store.unlockBreakdown()).toBe(false);

			expect(store.document?.breakdownConfirmedAt).toBeNull();
			expect(store.route()).toBe('/breakdown');
			vi.advanceTimersByTime(500);
			expect(storage.writes.filter((key) => key === STORAGE_KEY)).toEqual([]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('does nothing when no marksheet is stored', () => {
		const store = storeWith(fakeStorage());

		expect(store.unlockBreakdown()).toBe(false);

		expect(store.document).toBeNull();
	});
});

describe('what changing the breakdown costs the marks', () => {
	/**
	 * An unlocked breakdown over two students — one absent — with marks on the
	 * four-mark first entry, one of them above it: the state the unlock exists to
	 * leave teachers in.
	 */
	function openUnlocked() {
		return openStore({
			students: [
				student('student-1', 'Ada', 'Lovelace'),
				{ id: 'student-2', firstName: 'Grace', surname: 'Hopper', absent: true }
			],
			marks: { 'student-1': { 'entry-1': 5 }, 'student-2': { 'entry-1': 2 } }
		});
	}

	it('says how many marks deleting an entry would take with it, absent students included', () => {
		const { store } = openUnlocked();

		// Every mark filed against the entry goes with it, whether or not it counts
		// towards a figure: an absent student's marks are kept, and removed with it.
		const loss = store.marksOnEntry('entry-1');
		expect(loss).toBe(2);
		expect(store.marksOnEntry('entry-gone')).toBe(0);

		store.deleteEntry('entry-1');

		// The count was the loss: the entry's marks are gone, and only its marks.
		expect(store.document).not.toBeNull();
		expect(markCount(store.document as MarksheetDocument)).toBe(0);
	});

	it('says how many marks are left above an entry’s available marks', () => {
		const { store } = openUnlocked();

		// Five and two are entered against an entry offering four: one is above it.
		expect(store.marksOverMax('entry-1')).toBe(1);

		// Raising the available marks is the common, harmless fix, and leaves
		// nothing above them.
		store.setEntryMarks('entry-1', 6);
		expect(store.marksOverMax('entry-1')).toBe(0);

		// Lowering it under the marks entered leaves them all above it.
		store.setEntryMarks('entry-1', 1);
		expect(store.marksOverMax('entry-1')).toBe(2);

		// Correcting the mark clears the one it was: nothing is left above.
		store.setMark('student-1', 'entry-1', 1);
		expect(store.marksOverMax('entry-1')).toBe(1);

		// An entry with no available marks has nothing for a mark to be above —
		// that is the missing marks confirmation blocks on — and an entry that is
		// not there has no marks at all.
		store.setEntryMarks('entry-1', null);
		expect(store.marksOverMax('entry-1')).toBe(0);
		expect(store.marksOverMax('entry-gone')).toBe(0);
		expect(store.marksOnEntry('entry-1')).toBe(2);
	});

	it('leaves the marks entered where they are when the available marks are lowered', () => {
		const { store } = openUnlocked();

		store.setEntryMarks('entry-1', 2);

		// Never clamped: the marks stay exactly as the teacher entered them, and the
		// entry is flagged as one no figure can count.
		expect(entryOf(store, 'entry-1')?.marks).toBe(2);
		expect(store.document?.marks).toEqual({
			'student-1': { 'entry-1': 5 },
			'student-2': { 'entry-1': 2 }
		});
		const row = store.analysis.entries.find((one) => one.entry.id === 'entry-1');
		expect(row?.overMax).toBe(1);
	});
});

describe('class', () => {
	/** A confirmed document: the class belongs to the marksheet a confirmation builds. */
	function openMarksheet(overrides: Partial<MarksheetDocument> = {}) {
		return openStore({ breakdownConfirmedAt: NOW.toISOString(), ...overrides });
	}

	it('adds a student and hands back the id their marks will be filed under', () => {
		const { store } = openMarksheet();

		const id = idOf(store.addStudent({ firstName: 'Ada', surname: 'Lovelace' }));

		expect(studentOf(store, id)).toEqual({
			id,
			firstName: 'Ada',
			surname: 'Lovelace',
			absent: false
		});
	});

	it('renames a student in place, so their marks stay with them', () => {
		const { store } = openMarksheet({
			students: [student('student-1', 'Ada', 'Lovelace')],
			marks: { 'student-1': { 'entry-1': 3 } }
		});

		store.renameStudent('student-1', { firstName: 'Ada', surname: 'Byron' });

		expect(studentOf(store, 'student-1')).toMatchObject({ firstName: 'Ada', surname: 'Byron' });
		expect(store.document?.marks).toEqual({ 'student-1': { 'entry-1': 3 } });
	});

	it('ignores a rename aimed at a student who is not there', () => {
		const { store } = openMarksheet({ students: [student('student-1', 'Ada', 'Lovelace')] });

		store.renameStudent('student-gone', { firstName: 'Grace', surname: 'Hopper' });

		expect(store.document?.students).toHaveLength(1);
	});

	it('maps a pasted column of names to first names and surnames', () => {
		const { store } = openMarksheet();

		store.pasteNames('Lovelace, Ada\nGrace Brewster Hopper\nCher\n\n   \nHopper, Grace\r\n');

		expect(store.document?.students).toEqual([
			{ id: expect.any(String), firstName: 'Ada', surname: 'Lovelace', absent: false },
			{ id: expect.any(String), firstName: 'Grace Brewster', surname: 'Hopper', absent: false },
			{ id: expect.any(String), firstName: 'Cher', surname: '', absent: false },
			{ id: expect.any(String), firstName: 'Grace', surname: 'Hopper', absent: false }
		]);
	});

	it('says how many students a paste made', () => {
		const { store } = openMarksheet();

		expect(store.pasteNames('Lovelace, Ada\n\n')).toBe(1);
		expect(store.pasteNames('')).toBe(0);
	});

	it('builds the class and its marks from names with marks beside them', () => {
		const { store } = openMarksheet();
		const entryId = store.document?.breakdown.entries[0].id ?? '';

		expect(store.pasteNames('Ada Lovelace\t3\r\nHopper, Grace\t4\r\n')).toBe(2);

		const [ada, grace] = store.document?.students ?? [];
		expect(ada).toMatchObject({ firstName: 'Ada', surname: 'Lovelace' });
		expect(grace).toMatchObject({ firstName: 'Grace', surname: 'Hopper' });
		expect(store.document?.marks).toEqual({
			[ada.id]: { [entryId]: 3 },
			[grace.id]: { [entryId]: 4 }
		});
	});

	it('removes a student with their marks, and offers it back with undo', () => {
		const { store } = openMarksheet({
			students: [student('student-1', 'Ada', 'Lovelace'), student('student-2', 'Grace', 'Hopper')],
			marks: { 'student-1': { 'entry-1': 3 }, 'student-2': { 'entry-1': 4 } }
		});

		expect(store.removeStudent('student-1')).toBe(true);
		expect(store.document?.students.map(({ id }) => id)).toEqual(['student-2']);
		expect(store.document?.marks).toEqual({ 'student-2': { 'entry-1': 4 } });

		expect(store.undo()).toBe(true);
		expect(store.document?.students.map(({ id }) => id)).toEqual(['student-1', 'student-2']);
		expect(store.document?.marks).toEqual({
			'student-1': { 'entry-1': 3 },
			'student-2': { 'entry-1': 4 }
		});
	});

	it('refuses to remove a student who is not there', () => {
		const { store } = openMarksheet({ students: [student('student-1', 'Ada', 'Lovelace')] });

		expect(store.removeStudent('student-gone')).toBe(false);
		expect(store.undoable).toBeNull();
	});

	it('keeps one removal on offer: the next change takes its place', () => {
		const { store } = openMarksheet({
			students: [student('student-1', 'Ada', 'Lovelace'), student('student-2', 'Grace', 'Hopper')]
		});

		store.removeStudent('student-1');
		store.setStudentAbsent('student-2', true);

		expect(store.undoable).toBeNull();
		expect(store.document?.students.map(({ id }) => id)).toEqual(['student-2']);
	});

	it('sorts the class by either name part without touching ids or marks', () => {
		const { store } = openMarksheet({
			students: [
				student('student-1', 'Grace', 'Hopper'),
				student('student-2', 'Ada', 'Lovelace'),
				student('student-3', 'Cher', '')
			],
			marks: { 'student-1': { 'entry-1': 4 } }
		});

		store.sortStudents('surname');

		expect(store.document?.students.map(({ surname }) => surname)).toEqual([
			'',
			'Hopper',
			'Lovelace'
		]);

		store.sortStudents('firstName');

		expect(store.document?.students.map(({ firstName }) => firstName)).toEqual([
			'Ada',
			'Cher',
			'Grace'
		]);
		expect(store.document?.students.map(({ id }) => id)).toEqual([
			'student-2',
			'student-3',
			'student-1'
		]);
		expect(store.document?.marks).toEqual({ 'student-1': { 'entry-1': 4 } });
	});

	it('flags a student absent and back, leaving their marks where they are', () => {
		const { store } = openMarksheet({
			students: [student('student-1', 'Ada', 'Lovelace')],
			marks: { 'student-1': { 'entry-1': 3 } }
		});

		store.setStudentAbsent('student-1', true);

		expect(studentOf(store, 'student-1')?.absent).toBe(true);
		expect(store.document?.marks).toEqual({ 'student-1': { 'entry-1': 3 } });

		store.setStudentAbsent('student-1', false);

		expect(studentOf(store, 'student-1')?.absent).toBe(false);
		expect(store.document?.marks).toEqual({ 'student-1': { 'entry-1': 3 } });
	});

	it('names the class, reading a blank name as none', () => {
		const { store } = openMarksheet();

		store.setClassName('  10C1 ');
		expect(store.document?.paper.className).toBe('10C1');

		store.setClassName('   ');
		expect(store.document?.paper.className).toBeNull();
	});

	it('does nothing when no marksheet is stored', () => {
		const store = storeWith(fakeStorage());

		expect(store.addStudent({ firstName: 'Ada', surname: 'Lovelace' })).toBeNull();
		expect(store.pasteNames('Ada Lovelace')).toBe(0);
		expect(store.removeStudent('student-1')).toBe(false);
		expect(store.document).toBeNull();
	});
});

describe('marks', () => {
	/** A confirmed marksheet with one student and one four-mark entry. */
	function openMarksheet(overrides: Partial<MarksheetDocument> = {}) {
		return openStore({
			breakdownConfirmedAt: NOW.toISOString(),
			students: [student('student-1', 'Ada', 'Lovelace')],
			...overrides
		});
	}

	it('files a mark under the student and the entry it belongs to', () => {
		vi.useFakeTimers();
		try {
			const { store, storage } = openMarksheet();

			store.setMark('student-1', 'entry-1', 3);
			vi.advanceTimersByTime(500);

			expect(stored(storage).marks).toEqual({ 'student-1': { 'entry-1': 3 } });
		} finally {
			vi.useRealTimers();
		}
	});

	it('replaces a mark already entered rather than adding to it', () => {
		const { store } = openMarksheet({ marks: { 'student-1': { 'entry-1': 3 } } });

		store.setMark('student-1', 'entry-1', 4);

		expect(store.document?.marks).toEqual({ 'student-1': { 'entry-1': 4 } });
	});

	it('keeps a mark of zero apart from a cell nobody has marked', () => {
		const { store } = openMarksheet();
		const marksFor = () => store.document?.marks['student-1'];
		const entries = () => store.document?.breakdown.entries ?? [];

		store.setMark('student-1', 'entry-1', 0);

		expect(marksFor()).toEqual({ 'entry-1': 0 });
		// Zero is a mark the student gained: their row counts it as filled in.
		expect(progressOf(marksFor(), entries())).toEqual({ marked: 1, total: 1 });

		store.clearMark('student-1', 'entry-1');

		// Cleared is no entry at all, so nothing says the cell was ever marked.
		expect(store.document?.marks).toEqual({});
		expect(progressOf(marksFor(), entries())).toEqual({ marked: 0, total: 1 });
	});

	it('stores a mark above the entry’s available marks, never clamping it', () => {
		const { store } = openMarksheet();

		store.setMark('student-1', 'entry-1', 40);

		expect(store.document?.marks).toEqual({ 'student-1': { 'entry-1': 40 } });
		// What the entry offers is the teacher's: the mark does not change it back.
		expect(entryOf(store, 'entry-1')?.marks).toBe(4);
	});

	it('refuses a mark that is not a whole number', () => {
		const { store } = openMarksheet({ marks: { 'student-1': { 'entry-1': 2 } } });

		for (const refused of [2.5, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
			store.setMark('student-1', 'entry-1', refused);
			expect(store.document?.marks).toEqual({ 'student-1': { 'entry-1': 2 } });
		}
	});

	it('ignores a mark aimed at a student or an entry that is not there', () => {
		const { store } = openMarksheet({ marks: { 'student-1': { 'entry-1': 3 } } });

		store.setMark('student-gone', 'entry-1', 3);
		store.setMark('student-1', 'entry-gone', 3);
		store.clearMark('student-gone', 'entry-1');
		store.clearMark('student-1', 'entry-gone');

		expect(store.document?.marks).toEqual({ 'student-1': { 'entry-1': 3 } });
	});

	it('leaves the undo alone when the mark entered is the one already there', () => {
		const { store } = openMarksheet({
			students: [student('student-1', 'Ada', 'Lovelace'), student('student-2', 'Grace', 'Hopper')],
			marks: { 'student-1': { 'entry-1': 3 } }
		});

		store.removeStudent('student-2');
		store.setMark('student-1', 'entry-1', 3);

		// Nothing changed, so nothing the teacher could take back was spent.
		expect(store.undoable).not.toBeNull();
		expect(store.undo()).toBe(true);
		expect(store.document?.students.map(({ id }) => id)).toEqual(['student-1', 'student-2']);
	});

	it('takes the change undo was covering, since entering a mark takes its place', () => {
		const { store } = openMarksheet({
			students: [student('student-1', 'Ada', 'Lovelace'), student('student-2', 'Grace', 'Hopper')]
		});

		store.removeStudent('student-2');
		expect(store.undoable).not.toBeNull();

		store.setMark('student-1', 'entry-1', 3);

		expect(store.undoable).toBeNull();
	});

	it('does nothing when no marksheet is stored', () => {
		const store = storeWith(fakeStorage());

		store.setMark('student-1', 'entry-1', 3);
		store.clearMark('student-1', 'entry-1');

		expect(store.document).toBeNull();
	});
});

describe('pasting a block', () => {
	/** A marksheet with two entries and two students: a paste has room to miss both. */
	function openPasteSheet(overrides: Partial<MarksheetDocument> = {}) {
		return openStore({
			breakdownConfirmedAt: NOW.toISOString(),
			breakdown: {
				entries: [entry('entry-1', '1a', '1'), entry('entry-2', '1b', '1')],
				warnings: []
			},
			students: [student('student-1', 'Ada', 'Lovelace'), student('student-2', 'Grace', 'Hopper')],
			...overrides
		});
	}

	it('takes one block back, restoring the marks and the class it added to', () => {
		vi.useFakeTimers();
		try {
			const { store, storage } = openPasteSheet({ marks: { 'student-1': { 'entry-1': 2 } } });

			store.pasteMarks(
				[
					['Lovelace, Ada', '3', '2'],
					['Hopper, Grace', '4', '1'],
					['Cher', '0', '0']
				],
				{ kind: 'names', studentId: 'student-1' }
			);
			vi.advanceTimersByTime(500);

			expect(store.undoable).toMatchObject({ kind: 'mark-paste' });
			expect(stored(storage).students).toHaveLength(3);

			expect(store.undo()).toBe(true);

			expect(store.document?.students).toEqual([
				student('student-1', 'Ada', 'Lovelace'),
				student('student-2', 'Grace', 'Hopper')
			]);
			expect(store.document?.marks).toEqual({ 'student-1': { 'entry-1': 2 } });
			expect(store.undoable).toBeNull();
			expect(store.undo()).toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});

	it('offers the paste to undo until the next change', () => {
		const { store } = openPasteSheet();

		store.pasteMarks([['3']], { kind: 'marks', studentId: 'student-1', entryId: 'entry-1' });
		expect(store.undoable).toMatchObject({ kind: 'mark-paste' });

		store.setMark('student-2', 'entry-1', 1);

		expect(store.undoable).toBeNull();
	});

	it('keeps the account of the last paste until the next change', () => {
		const { store } = openPasteSheet();

		const refused = store.pasteMarks([['2.5']], {
			kind: 'marks',
			studentId: 'student-1',
			entryId: 'entry-1'
		});

		// Nothing changed, so there is no undo — but the teacher still has to be
		// told why the cell they pasted into is as they left it.
		expect(store.undoable).toBeNull();
		expect(store.pasteNotice).toEqual(refused);

		store.setMark('student-1', 'entry-1', 2);

		expect(store.pasteNotice).toBeNull();
	});

	it('leaves no notice for a paste that put down exactly what was there', () => {
		const { store } = openPasteSheet({ marks: { 'student-1': { 'entry-1': 3 } } });

		const result = store.pasteMarks([['3']], {
			kind: 'marks',
			studentId: 'student-1',
			entryId: 'entry-1'
		});

		expect(result.changed).toBe(false);
		expect(store.pasteNotice).toBeNull();
	});

	it('does nothing when there is no marksheet or the anchor is gone', () => {
		const empty = storeWith(fakeStorage());
		expect(
			empty.pasteMarks([['3']], { kind: 'marks', studentId: 'student-1', entryId: 'entry-1' })
		).toMatchObject({ changed: false });

		const { store } = openPasteSheet();
		expect(
			store.pasteMarks([['3']], { kind: 'marks', studentId: 'student-gone', entryId: 'entry-1' })
		).toMatchObject({ changed: false });
		expect(
			store.pasteMarks([['3']], { kind: 'marks', studentId: 'student-1', entryId: 'entry-gone' })
		).toMatchObject({ changed: false });
	});
});

describe('analysis', () => {
	/** A confirmed marksheet: the figures are read off the sheet a confirmation builds. */
	function openMarksheet(overrides: Partial<MarksheetDocument> = {}) {
		return openStore({ breakdownConfirmedAt: NOW.toISOString(), ...overrides });
	}

	/** A class of one entry, for tests about a single figure. */
	function oneEntry(marks: number | null, overrides: Partial<MarksheetDocument> = {}) {
		return openMarksheet({
			breakdown: { entries: [entry('entry-1', '1', '1', { marks })], warnings: [] },
			students: [student('student-1', 'Ada', 'Lovelace')],
			...overrides
		});
	}

	it('reads facility as the mean counted mark over the available marks', () => {
		const { store } = openMarksheet({
			breakdown: { entries: [entry('entry-1', '1', '1', { marks: 4 })], warnings: [] },
			students: [
				student('student-1', 'Ada', 'Lovelace'),
				student('student-2', 'Grace', 'Hopper'),
				student('student-3', 'Cher', '')
			],
			marks: {
				'student-1': { 'entry-1': 3 },
				'student-2': { 'entry-1': 2 },
				'student-3': { 'entry-1': 1 }
			}
		});

		expect(store.analysis.entries[0]).toMatchObject({
			entry: { id: 'entry-1' },
			counted: 3,
			mean: 2,
			facility: 0.5,
			band: 'amber',
			notScored: null,
			overMax: 0,
			coverage: { marked: 3, of: 3, partMarked: false }
		});
		expect(store.analysis.summary).toEqual({
			studentsCounted: 3,
			absentExcluded: 0,
			marksCounted: 3,
			partMarked: 0,
			invalid: 0
		});
	});

	it('bands red below 40%, amber from 40% to below 70%, and green from 70%', () => {
		const { store } = openMarksheet({
			breakdown: {
				entries: [
					entry('entry-1', '1a', '1', { marks: 10 }),
					entry('entry-2', '1b', '1', { marks: 10 }),
					entry('entry-3', '1c', '1', { marks: 10 }),
					entry('entry-4', '1d', '1', { marks: 10 }),
					entry('entry-5', '1e', '1', { marks: 10 })
				],
				warnings: []
			},
			students: [student('student-1', 'Ada', 'Lovelace')],
			marks: {
				'student-1': {
					'entry-1': 3,
					'entry-2': 4,
					'entry-3': 6,
					'entry-4': 7,
					'entry-5': 9
				}
			}
		});

		expect(store.analysis.entries.map(({ facility }) => facility)).toEqual([
			0.3, 0.4, 0.6, 0.7, 0.9
		]);
		expect(store.analysis.entries.map(({ band }) => band)).toEqual([
			'red',
			'amber',
			'amber',
			'green',
			'green'
		]);
	});

	it('has no figures before a marksheet exists', () => {
		const store = storeWith(fakeStorage());

		expect(store.analysis).toEqual({
			entries: [],
			ordered: [],
			hardest: [],
			summary: {
				studentsCounted: 0,
				absentExcluded: 0,
				marksCounted: 0,
				partMarked: 0,
				invalid: 0
			}
		});
	});

	it('leaves absent students out of every figure, and counts them again when the flag is cleared', () => {
		const { store } = openMarksheet({
			breakdown: { entries: [entry('entry-1', '1', '1', { marks: 4 })], warnings: [] },
			students: [
				student('student-1', 'Ada', 'Lovelace'),
				{ ...student('student-2', 'Grace', 'Hopper'), absent: true }
			],
			marks: { 'student-1': { 'entry-1': 4 }, 'student-2': { 'entry-1': 0 } }
		});

		expect(store.analysis.entries[0]).toMatchObject({
			counted: 1,
			facility: 1,
			coverage: { marked: 1, of: 1, partMarked: false }
		});
		expect(store.analysis.summary).toMatchObject({ studentsCounted: 1, absentExcluded: 1 });

		store.setStudentAbsent('student-2', false);

		expect(store.analysis.entries[0]).toMatchObject({
			counted: 2,
			mean: 2,
			facility: 0.5,
			coverage: { marked: 2, of: 2, partMarked: false }
		});
		expect(store.analysis.summary).toMatchObject({ studentsCounted: 2, absentExcluded: 0 });
	});

	it('counts a mark of 0, and leaves a cell nobody has marked out', () => {
		const { store } = oneEntry(4, {
			students: [student('student-1', 'Ada', 'Lovelace'), student('student-2', 'Grace', 'Hopper')],
			marks: { 'student-1': { 'entry-1': 0 } }
		});

		expect(store.analysis.entries[0]).toMatchObject({
			counted: 1,
			mean: 0,
			facility: 0,
			band: 'red',
			coverage: { marked: 1, of: 2, partMarked: true }
		});
	});

	it('leaves a mark above the available marks out of the figure rather than capping it, and flags the entry', () => {
		const { store } = oneEntry(4, {
			students: [student('student-1', 'Ada', 'Lovelace'), student('student-2', 'Grace', 'Hopper')],
			marks: { 'student-1': { 'entry-1': 2 }, 'student-2': { 'entry-1': 40 } }
		});

		expect(store.analysis.entries[0]).toMatchObject({
			counted: 1,
			mean: 2,
			facility: 0.5,
			overMax: 1,
			coverage: { marked: 2, of: 2, partMarked: false }
		});
		expect(store.analysis.summary.invalid).toBe(1);

		store.setMark('student-2', 'entry-1', 4);

		expect(store.analysis.entries[0]).toMatchObject({
			counted: 2,
			mean: 3,
			facility: 0.75,
			band: 'green',
			overMax: 0
		});
		expect(store.analysis.summary.invalid).toBe(0);
	});

	it('leaves an entry nothing counts on unscored, saying it is marked rather than unmarked', () => {
		const { store } = oneEntry(4, {
			students: [student('student-1', 'Ada', 'Lovelace'), student('student-2', 'Grace', 'Hopper')],
			marks: { 'student-1': { 'entry-1': 40 }, 'student-2': { 'entry-1': 41 } }
		});

		// Every mark entered is a typo, so there is no figure — but the entry is
		// marked, and the reason has to say so rather than read as untouched.
		expect(store.analysis.entries[0]).toMatchObject({
			counted: 0,
			mean: null,
			facility: null,
			band: null,
			overMax: 2,
			notScored: 'no-counted-marks',
			coverage: { marked: 2, of: 2, partMarked: false }
		});
		expect(store.analysis.summary.invalid).toBe(1);
	});

	it('bands an entry resting on part of the class, and says how much of it is marked', () => {
		const { store } = oneEntry(4, {
			students: [
				student('student-1', 'Ada', 'Lovelace'),
				student('student-2', 'Grace', 'Hopper'),
				student('student-3', 'Cher', ''),
				student('student-4', 'Alan', 'Turing')
			],
			marks: { 'student-1': { 'entry-1': 4 }, 'student-2': { 'entry-1': 2 } }
		});

		expect(store.analysis.entries[0]).toMatchObject({
			facility: 0.75,
			band: 'green',
			coverage: { marked: 2, of: 4, partMarked: true }
		});
		expect(store.analysis.summary.partMarked).toBe(1);
	});

	it('says why an entry is not scored, apart from one nobody has marked yet', () => {
		const { store } = openMarksheet({
			breakdown: {
				entries: [
					entry('entry-1', '1a', '1', { marks: 4 }),
					entry('entry-2', '1b', '1', { marks: null })
				],
				warnings: []
			},
			students: [student('student-1', 'Ada', 'Lovelace')]
		});

		expect(store.analysis.entries[0]).toMatchObject({
			facility: null,
			band: null,
			notScored: 'no-counted-marks',
			coverage: { marked: 0, of: 1, partMarked: false }
		});
		expect(store.analysis.entries[1]).toMatchObject({
			facility: null,
			band: null,
			notScored: 'no-available-marks'
		});
		expect(store.analysis.summary).toMatchObject({ marksCounted: 0, partMarked: 0 });
	});

	it('orders red, then amber, then green worst first, with the entries it cannot score last', () => {
		const { store } = openMarksheet({
			breakdown: {
				entries: [
					entry('entry-green', '1a', '1', { marks: 10 }),
					entry('entry-unmarked', '1b', '1', { marks: 10 }),
					entry('entry-redder', '1c', '1', { marks: 10 }),
					entry('entry-worst', '1d', '1', { marks: 10 }),
					entry('entry-amber', '1e', '1', { marks: 10 }),
					entry('entry-red', '1f', '1', { marks: 10 })
				],
				warnings: []
			},
			students: [student('student-1', 'Ada', 'Lovelace')],
			marks: {
				'student-1': {
					'entry-green': 8,
					'entry-redder': 3,
					'entry-worst': 1,
					'entry-amber': 5,
					'entry-red': 2
				}
			}
		});

		expect(store.analysis.ordered.map(({ entry }) => entry.id)).toEqual([
			'entry-worst',
			'entry-red',
			'entry-redder',
			'entry-amber',
			'entry-green',
			'entry-unmarked'
		]);
	});

	it('names at most eight red entries in the Hardest strip, worst first', () => {
		const { store } = openMarksheet({
			breakdown: {
				entries: Array.from({ length: 10 }, (_, index) =>
					entry(`entry-${index + 1}`, `1${index}`, '1', { marks: 100 })
				),
				warnings: []
			},
			students: [student('student-1', 'Ada', 'Lovelace')],
			marks: {
				'student-1': Object.fromEntries(
					Array.from({ length: 10 }, (_, index) => [`entry-${index + 1}`, index + 1])
				)
			}
		});

		expect(store.analysis.hardest.map(({ entry }) => entry.id)).toEqual([
			'entry-1',
			'entry-2',
			'entry-3',
			'entry-4',
			'entry-5',
			'entry-6',
			'entry-7',
			'entry-8'
		]);
	});

	it('reads each breakdown entry on its own, never pooling a question’s subquestions', () => {
		const { store } = openMarksheet({
			breakdown: {
				entries: [
					entry('entry-2a', '2a', '2', { marks: 4 }),
					entry('entry-2b', '2b', '2', { marks: 4 })
				],
				warnings: []
			},
			students: [student('student-1', 'Ada', 'Lovelace')],
			marks: { 'student-1': { 'entry-2a': 4, 'entry-2b': 0 } }
		});

		expect(store.analysis.entries.map(({ facility }) => facility)).toEqual([1, 0]);
		expect(store.analysis.entries.map(({ band }) => band)).toEqual(['green', 'red']);
	});
});

describe('taking a backup', () => {
	/** A marksheet with a mark in it: the work a backup is for. */
	function openAnsweredMarksheet() {
		return openStore({
			breakdownConfirmedAt: NOW.toISOString(),
			students: [student('student-1', 'Ada', 'Lovelace')],
			marks: { 'student-1': { 'entry-1': 3 } }
		});
	}

	it('hands out the document exactly as storage holds it', () => {
		const { store, storage } = openAnsweredMarksheet();

		const file = store.takeBackup();

		// Byte for byte: this is the only thing that brings a marksheet back.
		expect(file?.text).toBe(storage.getItem(STORAGE_KEY));
		expect(file?.type).toBe('application/json');
		expect(file?.filename).toBe('qla-backup-ph1-2026-01-01.json');
	});

	it('stamps the moment it was taken, in the file and in storage alike', () => {
		const { store, storage } = openAnsweredMarksheet();

		store.takeBackup();

		expect(stored(storage).lastExportedAt).toBe(NOW.toISOString());
	});

	it('hands out nothing when there is no marksheet', () => {
		const store = storeWith(fakeStorage());

		expect(store.takeBackup()).toBeNull();
	});

	it('hands the work out of a browser that will not keep it', () => {
		const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(storedDocument()) });
		const store = storeWith(unwritableDocument(storage));
		store.load();
		store.createFromParse({
			breakdown: { questions: [] },
			warnings: [],
			usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estCost: 0 },
			filenames: ['paper.pdf']
		});

		const file = store.takeBackup();

		// The write was refused, so the file is the only copy of it there is.
		expect(JSON.parse(file?.text ?? '{}')).toMatchObject({
			schemaVersion: DOCUMENT_SCHEMA_VERSION
		});
		expect(store.saveState.kind).toBe('failed');
	});
});

describe('exporting the marks to a spreadsheet', () => {
	/** A marksheet someone has marked: two students, one of them absent. */
	function openAnsweredClass() {
		return openStore({
			breakdownConfirmedAt: NOW.toISOString(),
			paper: {
				label: 'Ph1',
				className: '10C1',
				sourceFilenames: ['paper.pdf'],
				parsedAt: NOW.toISOString()
			},
			students: [
				student('student-1', 'Ada', 'Lovelace'),
				{ ...student('student-2', 'Grace', 'Hopper'), absent: true }
			],
			marks: { 'student-1': { 'entry-1': 3 } }
		});
	}

	it('hands out this marksheet’s marks as the CSV a spreadsheet reads', () => {
		const { store } = openAnsweredClass();

		const file = store.exportMarksCsv();

		expect(file?.type).toBe('text/csv');
		expect(file?.filename).toBe('ph1-10c1-marks.csv');
		expect(file?.text.split('\r\n')[0]).toBe('Surname,First name,Absent,2bii,Total');
		expect(file?.text).toContain('Lovelace,Ada,,3,3');
		expect(file?.text).toContain('Hopper,Grace,Y,,0');
	});

	it('leaves the backup exactly as old as it was: a marks export is not one', () => {
		const { store, storage } = openAnsweredClass();
		const writes = storage.writes.length;

		store.exportMarksCsv();
		store.flush();

		expect(stored(storage).lastExportedAt).toBeNull();
		expect(storage.writes.length).toBe(writes);
	});

	it('hands out nothing when there is no marksheet', () => {
		const store = storeWith(fakeStorage());

		expect(store.exportMarksCsv()).toBeNull();
	});
});

describe('restoring a backup', () => {
	it('brings a marksheet back, marks and all, from the file it handed out', () => {
		const { store } = openStore({
			breakdownConfirmedAt: NOW.toISOString(),
			paper: { label: 'Ph1', className: '10C1', sourceFilenames: ['paper.pdf'], parsedAt: 'x' },
			students: [student('student-1', 'Ada', 'Lovelace')],
			marks: { 'student-1': { 'entry-1': 3 } }
		});
		const file = store.takeBackup();

		const storage = fakeStorage();
		const fresh = storeWith(storage);

		expect(fresh.restoreBackup(file?.text ?? '')).toBe('/marksheet');
		expect(fresh.document?.paper.label).toBe('Ph1');
		expect(fresh.document?.paper.className).toBe('10C1');
		expect(fresh.document?.students).toEqual([student('student-1', 'Ada', 'Lovelace')]);
		expect(fresh.document?.marks).toEqual({ 'student-1': { 'entry-1': 3 } });
		expect(fresh.document?.lastExportedAt).toBe(NOW.toISOString());
		// What a restore gives back is the file, byte for byte: the round trip
		// loses nothing at all.
		expect(JSON.stringify(fresh.document)).toBe(file?.text);
		// A restore is a document the teacher now holds; storage keeps it at once.
		expect(stored(storage).marks).toEqual({ 'student-1': { 'entry-1': 3 } });
	});

	it('lands the restored document on the surface its state allows', () => {
		const unconfirmed = JSON.stringify(storedDocument({ breakdownConfirmedAt: null }));
		const confirmed = JSON.stringify(storedDocument({ breakdownConfirmedAt: NOW.toISOString() }));

		expect(storeWith(fakeStorage()).restoreBackup(unconfirmed)).toBe('/breakdown');
		expect(storeWith(fakeStorage()).restoreBackup(confirmed)).toBe('/marksheet');
	});

	it('drops marks whose student or entry the file no longer holds', () => {
		const store = storeWith(fakeStorage());
		const orphaned = JSON.stringify(
			storedDocument({
				breakdownConfirmedAt: NOW.toISOString(),
				students: [student('student-1', 'Ada', 'Lovelace')],
				marks: { 'student-1': { 'entry-1': 3, 'entry-gone': 2 }, 'student-gone': { 'entry-1': 1 } }
			})
		);

		store.restoreBackup(orphaned);

		expect(store.document?.marks).toEqual({ 'student-1': { 'entry-1': 3 } });
	});

	it('refuses a file that is not one of our documents, changing nothing', () => {
		const { store, storage } = openStore();
		const before = store.document;

		expect(store.restoreBackup('not a backup at all')).toBeNull();
		expect(store.restoreBackup('{"schemaVersion":99,"paper":{}}')).toBeNull();

		expect(store.document).toBe(before);
		expect(stored(storage).paper.label).toBe('Ph1');
		expect(store.route()).toBe('/breakdown');
	});

	it('refuses to replace a document the browser already holds', () => {
		const { store, storage } = openStore();
		const other = JSON.stringify(
			storedDocument({ paper: { ...storedDocument().paper, label: 'Other paper' } })
		);

		expect(store.restoreBackup(other)).toBeNull();

		expect(store.document?.paper.label).toBe('Ph1');
		expect(stored(storage).paper.label).toBe('Ph1');
	});

	it('stands the reminder up again for a document restored after a dismissal', () => {
		const store = storeWith(fakeStorage());
		store.dismissBackupReminder();

		store.restoreBackup(JSON.stringify(storedDocument({ lastExportedAt: null })));

		expect(store.backupReminderDismissed).toBe(false);
	});

	it('stands the reminder up again for a document parsed after a dismissal', () => {
		const store = storeWith(fakeStorage());
		store.dismissBackupReminder();

		store.createFromParse({
			breakdown: { questions: [] },
			warnings: [],
			usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estCost: 0 },
			filenames: ['paper.pdf']
		});

		expect(store.backupReminderDismissed).toBe(false);
	});
});

describe('the backup reminder', () => {
	it('stands down for the session when the teacher says later', () => {
		const store = storeWith(fakeStorage());

		expect(store.backupReminderDismissed).toBe(false);

		store.dismissBackupReminder();

		expect(store.backupReminderDismissed).toBe(true);
	});
});
