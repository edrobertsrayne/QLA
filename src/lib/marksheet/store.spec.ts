import { describe, expect, it, vi } from 'vitest';
import { CORRUPT_KEY_PREFIX, DOCUMENT_SCHEMA_VERSION, STORAGE_KEY } from './document.js';
import type {
	BreakdownEntry,
	EntryValues,
	MarksheetDocument,
	StoredBreakdown
} from './document.js';
import { MarksheetStore } from './store.svelte.js';
import type { DocumentStorage, LoadResult } from './store.svelte.js';

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

/** The id a structure command returned, asserting there is one. */
function idOf(id: string | null): string {
	if (id === null) throw new Error('expected a new entry id');
	return id;
}

/** The key an unreadable document was preserved under, asserting the load found one. */
function preservedKeyOf(result: LoadResult): string {
	expect(result.kind).toBe('corrupt');
	if (result.kind !== 'corrupt') throw new Error('expected an unreadable document');
	return result.preservedKey;
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

		expect(store.load()).toEqual({ kind: 'empty' });
		expect(store.document).toBeNull();
		expect(store.route()).toBe('/');
	});

	it('opens on the breakdown for an unconfirmed document', () => {
		const document = storedDocument({ breakdownConfirmedAt: null });
		const store = storeWith(fakeStorage({ [STORAGE_KEY]: JSON.stringify(document) }));

		const result = store.load();

		expect(result).toEqual({ kind: 'ready', document });
		expect(store.route()).toBe('/breakdown');
	});

	it('opens on the marksheet for a confirmed document', () => {
		const document = storedDocument({ breakdownConfirmedAt: NOW.toISOString() });
		const store = storeWith(fakeStorage({ [STORAGE_KEY]: JSON.stringify(document) }));

		expect(store.load()).toEqual({ kind: 'ready', document });
		expect(store.route()).toBe('/marksheet');
	});

	it('keeps an unreadable document under its own key and boots to upload', () => {
		const raw = '{"schemaVersion":99}';
		const storage = fakeStorage({ [STORAGE_KEY]: raw });
		const store = storeWith(storage);

		const result = store.load();

		expect(result).toEqual({
			kind: 'corrupt',
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

		expect(storeWith(storage).load().kind).toBe('corrupt');
		expect(storage.getItem(STORAGE_KEY)).toBe(raw);
	});

	it('runs on upload when browser storage is unavailable', () => {
		const store = storeWith(unwritableStorage());

		expect(store.load()).toEqual({ kind: 'unavailable' });
		expect(store.route()).toBe('/');
	});

	it('keeps one copy of an unreadable document however often the gate runs', () => {
		const raw = '{"schemaVersion":99}';
		const storage = fakeStorage({ [STORAGE_KEY]: raw });
		let nowMs = Date.parse('2026-01-01T10:00:00.000Z');
		const clock = () => new Date(nowMs);
		const store = storeWith(storage, clock);

		const first = store.load();
		nowMs += 60_000;
		const second = store.load();
		nowMs += 60_000;
		// A second page load starts a fresh store over the same storage.
		const afterReload = storeWith(storage, clock).load();

		const preservedKey = preservedKeyOf(first);
		expect(preservedKeyOf(second)).toBe(preservedKey);
		expect(preservedKeyOf(afterReload)).toBe(preservedKey);
		expect(
			[...storage.map.keys()].filter((key) => key.startsWith(CORRUPT_KEY_PREFIX))
		).toHaveLength(1);
		expect(storage.getItem(STORAGE_KEY)).toBe(raw);
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

		expect(store.load()).toEqual({ kind: 'ready', document });
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

		expect(store.load().kind).toBe('ready');
		expect(entryOf(store, 'entry-1')?.label).toBe('2bii');
		expect(store.document?.breakdown.entries[0]).not.toHaveProperty('original');
	});

	it('treats an entry reciting nonsense as its parse values as unreadable', () => {
		const raw = JSON.stringify(storedDocument()).replace(
			'"ao":"AO1"',
			'"ao":"AO1","original":{"label":7}'
		);
		const storage = fakeStorage({ [STORAGE_KEY]: raw });

		expect(storeWith(storage).load().kind).toBe('corrupt');
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

	it('stamps updatedAt when it writes, not when the change was made', () => {
		vi.useFakeTimers();
		try {
			const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(storedDocument()) });
			let nowMs = Date.parse('2026-01-01T10:00:00.000Z');
			const store = storeWith(storage, () => new Date(nowMs));
			store.load();

			store.setPaperLabel('10X/Ph1');
			nowMs += 60_000;
			vi.advanceTimersByTime(500);

			const stored = JSON.parse(storage.getItem(STORAGE_KEY) ?? '') as MarksheetDocument;
			expect(stored.paper.label).toBe('10X/Ph1');
			expect(stored.createdAt).toBe('2026-01-01T10:00:00.000Z');
			expect(stored.updatedAt).toBe('2026-01-01T10:01:00.000Z');
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
		expect(store.undoable).toMatchObject({ index: 1 });

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
