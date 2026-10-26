import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	CORRUPT_KEY_PREFIX,
	DOCUMENT_SCHEMA_VERSION,
	STORAGE_KEY,
	parseStoredDocument
} from './document.js';
import type { MarksheetDocument, StoredReport } from './document.js';
import {
	entry,
	parseRun,
	parsed,
	question,
	student,
	tier,
	tierParse
} from './fixtures.spec-helpers.js';
import { AUTOSAVE_DEBOUNCE_MS, type Unreadable } from './persistence.svelte.js';
import {
	NOW,
	documentWrites,
	fakeStorage,
	openStore,
	refusingWrites,
	stored,
	storeWith
} from './store.spec-helpers.js';

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

/** The key an unreadable document was preserved under, asserting the load found one. */
function preservedKeyOf(unreadable: Unreadable | null): string {
	if (unreadable === null) throw new Error('expected an unreadable document');
	if (unreadable.preservedKey === null) throw new Error('expected a preserved copy');
	return unreadable.preservedKey;
}

/** One student's generated report, as the stored shape holds it. */
function reportFixture(overrides: Partial<StoredReport> = {}): StoredReport {
	return {
		strengths: ['You explain processes clearly.'],
		areasForImprovement: [],
		edit: null,
		input: { paperLabel: '10X Ph1', entries: [] },
		model: 'openai/gpt-6-luna',
		generatedAt: NOW.toISOString(),
		...overrides
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
		const document = parsed({ breakdownConfirmedAt: null });
		const store = storeWith(fakeStorage({ [STORAGE_KEY]: JSON.stringify(document) }));

		store.load();

		expect(store.document).toEqual(document);
		expect(store.route()).toBe('/breakdown');
	});

	it('opens on the marksheet for a confirmed document', () => {
		const document = parsed({ breakdownConfirmedAt: NOW.toISOString() });
		const store = storeWith(fakeStorage({ [STORAGE_KEY]: JSON.stringify(document) }));

		store.load();
		expect(store.document).toEqual(document);
		expect(store.route()).toBe('/marksheet');
	});

	it('opens a version 2 document as a single-tier assessment', () => {
		const version2 = {
			schemaVersion: 2,
			createdAt: NOW,
			updatedAt: NOW,
			breakdownConfirmedAt: NOW,
			lastExportedAt: null,
			paper: {
				label: '10X Ph1',
				className: '10C1',
				sourceFilenames: ['10X Ph1.pdf'],
				parsedAt: '2026-01-01T09:00:00.000Z',
				boundaries: [{ label: 'A', minimum: 52 }],
				belowLowestLabel: 'U'
			},
			breakdown: {
				entries: [entry('entry-1', '2bii', '2')],
				warnings: [{ questionId: 'entry-1', code: 'SUMMARY_LENGTH', message: 'Two words.' }],
				aoDescriptions: { AO2: 'Apply knowledge' }
			},
			students: [{ id: 'student-1', firstName: 'Ada', surname: 'Lovelace', absent: false }],
			marks: { 'student-1': { 'entry-1': 3 } },
			topicNames: { '3.2.1.4': 'Rates of reaction' },
			reports: { 'student-1': reportFixture() }
		};
		const store = storeWith(fakeStorage({ [STORAGE_KEY]: JSON.stringify(version2) }));

		store.load();

		const document = store.document;
		if (document === null) throw new Error('expected a document');
		expect(document.schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);
		expect(document.tiers).toEqual([
			{
				tierName: null,
				sourceFilenames: ['10X Ph1.pdf'],
				parsedAt: '2026-01-01T09:00:00.000Z',
				breakdown: {
					entries: [entry('entry-1', '2bii', '2')],
					warnings: [{ questionId: 'entry-1', code: 'SUMMARY_LENGTH', message: 'Two words.' }]
				},
				boundaries: [{ label: 'A', minimum: 52 }],
				belowLowestLabel: 'U'
			}
		]);
		expect(document.label).toBe('10X Ph1');
		expect(document.className).toBe('10C1');
		expect(document.aoDescriptions).toEqual({ AO2: 'Apply knowledge' });
		expect(document.commonQuestions).toEqual([]);
		expect(document.students).toEqual([
			{ id: 'student-1', firstName: 'Ada', surname: 'Lovelace', absent: false, tier: 0 }
		]);
		// Marks, topic names and reports carry over verbatim, so no converted
		// report goes out of date.
		expect(document.marks).toEqual({ 'student-1': { 'entry-1': 3 } });
		expect(document.topicNames).toEqual({ '3.2.1.4': 'Rates of reaction' });
		expect(document.reports).toEqual({ 'student-1': reportFixture() });
		expect(store.route()).toBe('/marksheet');
	});

	it('drops orphaned reports and topic names on boot', () => {
		const report = reportFixture();
		const storage = fakeStorage({
			[STORAGE_KEY]: JSON.stringify(
				parsed({
					students: [student('student-1', 'Ada', 'Lovelace')],
					topicNames: { '9.9.9': 'Gone' },
					reports: { 'student-1': report, 'student-gone': report }
				})
			)
		});
		const store = storeWith(storage);

		store.load();

		expect(store.document?.reports).toEqual({ 'student-1': report });
		expect(store.document?.topicNames).toEqual({});
	});

	describe('report edits', () => {
		const prose: { strengths: string[]; areasForImprovement: string[] } = {
			strengths: ['You explain processes clearly.'],
			areasForImprovement: []
		};
		const input = { paperLabel: '10X Ph1', entries: [] };

		/** A store holding one student's generated report with no edit beside it. */
		function storeWithReport() {
			const report = reportFixture({ ...prose, input });
			const { store, storage } = openStore({
				breakdownConfirmedAt: NOW.toISOString(),
				students: [student('student-1', 'Ada', 'Lovelace')],
				reports: { 'student-1': report }
			});
			return { store, storage };
		}

		it('stores the edit beside the generated prose, and persists it', () => {
			const { store, storage } = storeWithReport();

			store.editReport('student-1', {
				strengths: ['Teacher wording.'],
				areasForImprovement: ['Do more.']
			});
			store.flush();

			expect(store.document?.reports['student-1'].strengths).toEqual([
				'You explain processes clearly.'
			]);
			expect(store.document?.reports['student-1'].edit).toEqual({
				strengths: ['Teacher wording.'],
				areasForImprovement: ['Do more.']
			});
			expect(stored(storage).reports['student-1'].edit).toEqual({
				strengths: ['Teacher wording.'],
				areasForImprovement: ['Do more.']
			});
		});

		it('reverts to the generated wording, and undo takes the edit back', () => {
			const { store } = storeWithReport();

			store.editReport('student-1', { strengths: ['Teacher wording.'], areasForImprovement: [] });
			expect(store.undoable).toMatchObject({ kind: 'report-edit' });

			expect(store.undo()).toBe(true);
			expect(store.document?.reports['student-1'].edit).toBeNull();

			store.editReport('student-1', { strengths: ['Teacher wording.'], areasForImprovement: [] });
			store.revertReport('student-1');
			expect(store.document?.reports['student-1'].edit).toBeNull();
			expect(store.document?.reports['student-1'].strengths).toEqual([
				'You explain processes clearly.'
			]);
		});

		it('leaves a report with no edit alone, spending no undo', () => {
			const { store } = storeWithReport();

			store.revertReport('student-1');
			expect(store.undoable).toBeNull();
			expect(store.undo()).toBe(false);
		});

		it('takes a twice-typed edit back in one undo', () => {
			const { store } = storeWithReport();

			store.editReport('student-1', { strengths: ['Teach.'], areasForImprovement: [] });
			store.editReport('student-1', { strengths: ['Teacher wording.'], areasForImprovement: [] });

			expect(store.undo()).toBe(true);
			expect(store.document?.reports['student-1'].edit).toBeNull();
			expect(store.undo()).toBe(false);
		});

		it('leaves no edit when the wording matches the generated prose', () => {
			const { store } = storeWithReport();

			store.editReport('student-1', {
				strengths: ['You explain processes clearly.'],
				areasForImprovement: []
			});

			expect(store.document?.reports['student-1'].edit).toBeNull();
			expect(store.undoable).toBeNull();
		});
	});

	// Kept whole, under its own key: a version this app cannot read is still the
	// teacher's only copy of their marks.
	it.each([
		['a version this app cannot read', '{"schemaVersion":99}'],
		[
			'a document written by a newer version',
			JSON.stringify({
				...parsed({ breakdownConfirmedAt: NOW.toISOString() }),
				schemaVersion: DOCUMENT_SCHEMA_VERSION + 1
			})
		]
	])('keeps %s under its own key, byte for byte, and boots to upload', (_, raw) => {
		const storage = fakeStorage({ [STORAGE_KEY]: raw });
		const store = storeWith(storage);

		store.load();

		const preservedKey = `${CORRUPT_KEY_PREFIX}${NOW.toISOString()}`;
		expect(store.unreadable).toEqual({ preservedKey, raw });
		expect(storage.getItem(preservedKey)).toBe(raw);
		expect(storage.getItem(STORAGE_KEY)).toBe(raw);
		expect(store.document).toBeNull();
		expect(store.route()).toBe('/');
	});

	it('treats a v1 document as unreadable, like any other version', () => {
		const raw = JSON.stringify({
			...parsed({ breakdownConfirmedAt: NOW.toISOString() }),
			schemaVersion: 1
		});
		const storage = fakeStorage({ [STORAGE_KEY]: raw });
		const store = storeWith(storage);

		store.load();

		expect(store.document).toBeNull();
		expect(store.unreadable).toEqual({
			preservedKey: `${CORRUPT_KEY_PREFIX}${NOW.toISOString()}`,
			raw
		});
		expect(storage.getItem(STORAGE_KEY)).toBe(raw);
	});

	it('treats unparseable JSON as unreadable too', () => {
		const raw = 'not json at all';
		const storage = fakeStorage({ [STORAGE_KEY]: raw });

		const unreadable = storeWith(storage);
		unreadable.load();
		expect(unreadable.unreadable).not.toBeNull();
		expect(storage.getItem(STORAGE_KEY)).toBe(raw);
	});

	it('runs on upload when browser storage is unavailable', () => {
		const store = storeWith(refusingWrites(fakeStorage(), () => true, new Error('SecurityError')));

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
		const document = parsed({ breakdownConfirmedAt: NOW.toISOString() });
		const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(document) });
		const store = storeWith(refusingWrites(storage, () => true));

		store.load();
		expect(store.document).toEqual(document);
		expect(store.route()).toBe('/marksheet');
	});

	it('says no copy was kept when the preserved copy cannot be written', () => {
		const raw = '{"schemaVersion":99}';
		const storage = fakeStorage({ [STORAGE_KEY]: raw });
		const store = storeWith(
			refusingWrites(
				storage,
				(key) => key.startsWith(CORRUPT_KEY_PREFIX),
				new Error('QuotaExceededError')
			)
		);

		store.load();
		expect(store.document).toBeNull();
		expect(store.unreadable).toEqual({ preservedKey: null, raw });
	});
});

describe('load', () => {
	it('leaves the stored document untouched when it re-reads a clean store', () => {
		const document = parsed();
		const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(document) });
		const store = storeWith(storage);
		store.load();

		store.load();
		expect(store.document).toEqual(document);
		expect(storage.getItem(STORAGE_KEY)).toBe(JSON.stringify(document));
	});
});

describe('autosave', () => {
	it('debounces a mutation by 500 ms and writes once', () => {
		const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(parsed()) });
		const store = storeWith(storage);
		store.load();

		store.setPaperLabel('10X/Ph1');
		expect(documentWrites(storage)).toEqual([]);
		expect(store.saveState).toEqual({ kind: 'saving' });

		vi.advanceTimersByTime(499);
		expect(documentWrites(storage)).toEqual([]);

		vi.advanceTimersByTime(1);
		expect(documentWrites(storage)).toEqual([STORAGE_KEY]);
		const written = stored(storage);
		expect(written.label).toBe('10X/Ph1');
		expect(store.saveState).toEqual({ kind: 'saved', at: NOW });
	});

	it('collapses rapid mutations into one write of the last value', () => {
		const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(parsed()) });
		const store = storeWith(storage);
		store.load();

		store.setPaperLabel('10X');
		vi.advanceTimersByTime(200);
		store.setPaperLabel('10X/Ph1');
		vi.advanceTimersByTime(500);

		expect(documentWrites(storage)).toEqual([STORAGE_KEY]);
		const written = stored(storage);
		expect(written.label).toBe('10X/Ph1');
	});

	it('flushes a pending change immediately', () => {
		const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(parsed()) });
		const store = storeWith(storage);
		store.load();

		store.setPaperLabel('10X/Ph1');
		store.flush();

		const written = stored(storage);
		expect(written.label).toBe('10X/Ph1');
		expect(store.saveState).toEqual({ kind: 'saved', at: NOW });

		vi.advanceTimersByTime(500);
		expect(documentWrites(storage)).toEqual([STORAGE_KEY]);
	});

	it('stamps updatedAt when the change is made, not when it is written', () => {
		const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(parsed()) });
		let nowMs = Date.parse('2026-01-01T10:00:00.000Z');
		const store = storeWith(storage, () => new Date(nowMs));
		store.load();

		nowMs += 30_000;
		store.setPaperLabel('10X/Ph1');
		nowMs += 30_000;
		vi.advanceTimersByTime(500);

		const written = stored(storage);
		expect(written.label).toBe('10X/Ph1');
		expect(written.createdAt).toBe('2026-01-01T10:00:00.000Z');
		expect(written.updatedAt).toBe('2026-01-01T10:00:30.000Z');
	});

	it('does nothing when there is nothing pending', () => {
		const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(parsed()) });
		const store = storeWith(storage);
		store.load();

		store.flush();

		expect(documentWrites(storage)).toEqual([]);
	});

	it('stops autosaving once a write fails, without retrying', () => {
		const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(parsed()) });
		const store = storeWith(
			refusingWrites(storage, (key) => key === STORAGE_KEY, new Error('QuotaExceededError'))
		);
		store.load();

		store.setPaperLabel('10X');
		vi.advanceTimersByTime(500);
		expect(store.saveState.kind).toBe('failed');

		store.setPaperLabel('10X/Ph1');
		vi.advanceTimersByTime(500);
		expect(store.saveState.kind).toBe('failed');
		expect(storage.getItem(STORAGE_KEY)).toBe(JSON.stringify(parsed()));
	});

	it('saves again when the teacher retries a refused write, then resumes autosave', () => {
		const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(parsed()) });
		let refuse = true;
		const store = storeWith(
			refusingWrites(
				storage,
				(key) => refuse && key === STORAGE_KEY,
				new Error('QuotaExceededError')
			)
		);
		store.load();

		store.setPaperLabel('10X');
		vi.advanceTimersByTime(500);
		expect(store.saveState.kind).toBe('failed');

		// Typing while saving has stopped is still not written behind the teacher's back.
		store.setPaperLabel('10X/Ph1');
		vi.advanceTimersByTime(500);
		expect(storage.getItem(STORAGE_KEY)).toBe(JSON.stringify(parsed()));

		refuse = false;
		store.retrySave();

		expect(store.saveState.kind).toBe('saved');
		expect(stored(storage).label).toBe('10X/Ph1');

		// The autosave is running again, so the next change needs no retry.
		store.setPaperLabel('10X/Ph2');
		vi.advanceTimersByTime(500);
		expect(stored(storage).label).toBe('10X/Ph2');
	});

	it('leaves the save state alone when there was no refused write to retry', () => {
		const { store } = openStore();

		store.retrySave();

		expect(store.saveState.kind).toBe('saved');
	});

	it('names the moment the unsaved changes began when a write is refused', () => {
		const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(parsed()) });
		let nowMs = NOW.getTime();
		const store = storeWith(
			refusingWrites(storage, (key) => key === STORAGE_KEY, new Error('QuotaExceededError')),
			() => new Date(nowMs)
		);
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
	});

	it('goes stale when another tab writes the marksheet, dropping a pending save and every later one', () => {
		const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(parsed()) });
		const store = storeWith(storage);
		store.load();
		store.setPaperLabel('10X');
		expect(store.saveState).toEqual({ kind: 'saving' });

		store.storageChangedElsewhere(STORAGE_KEY);
		vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
		store.setPaperLabel('10X/Ph1');
		vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
		store.flush();

		expect(store.saveState).toEqual({ kind: 'stale' });
		expect(documentWrites(storage)).toEqual([]);
	});

	it.each([[STORAGE_KEY], [null]])(
		'goes stale when the marksheet key is removed elsewhere (event key %s)',
		(key) => {
			const store = storeWith(fakeStorage({ [STORAGE_KEY]: JSON.stringify(parsed()) }));
			store.load();

			store.storageChangedElsewhere(key);

			expect(store.saveState).toEqual({ kind: 'stale' });
		}
	);

	it('ignores another tab changing an unrelated key', () => {
		const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(parsed()) });
		const store = storeWith(storage);
		store.load();
		store.setPaperLabel('10X');

		store.storageChangedElsewhere('mode-watcher-mode');
		vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);

		expect(store.saveState).toEqual({ kind: 'saved', at: NOW });
		expect(documentWrites(storage)).toEqual([STORAGE_KEY]);
	});

	it('moves that moment on once a write lands, so a later refusal names the last one', () => {
		const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(parsed()) });
		let refuse = false;
		const flaky = refusingWrites(
			storage,
			(key) => refuse && key === STORAGE_KEY,
			new Error('QuotaExceededError')
		);
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
	});

	it('does not re-read storage over changes the tab has not saved', () => {
		const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(parsed()) });
		const store = storeWith(storage);
		store.load();

		store.setPaperLabel('10X/Ph1');
		store.load();

		expect(store.label).toBe('10X/Ph1');
	});

	it('keeps the document in hand, and its undo, when the gate reads again after a save', () => {
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
	});
});

describe('wipe', () => {
	it('removes only the marksheet document', () => {
		const corruptKey = `${CORRUPT_KEY_PREFIX}2026-01-01T09:00:00.000Z`;
		const storage = fakeStorage({
			[STORAGE_KEY]: JSON.stringify(parsed()),
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
		const storage = fakeStorage();
		const store = storeWith(storage);
		store.createFromAssessment(parseRun());
		store.setPaperLabel('10X');
		store.wipe();

		vi.advanceTimersByTime(500);

		expect(storage.getItem(STORAGE_KEY)).toBeNull();
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
		expect(file?.filename).toBe('qla-backup-10x-ph1-2026-01-01.json');
	});

	it('stamps the moment it was taken, in the file and in storage alike', () => {
		const { store, storage } = openAnsweredMarksheet();

		const file = store.takeBackup();

		expect(JSON.parse(file?.text ?? '{}').lastExportedAt).toBe(NOW.toISOString());
		expect(stored(storage).lastExportedAt).toBe(NOW.toISOString());
	});

	it('hands out nothing when there is no marksheet', () => {
		const store = storeWith(fakeStorage());

		expect(store.takeBackup()).toBeNull();
	});

	it('hands the work out of a browser that will not keep it', () => {
		const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(parsed()) });
		const store = storeWith(
			refusingWrites(storage, (key) => key === STORAGE_KEY, new Error('QuotaExceededError'))
		);
		store.load();
		store.createFromAssessment(
			parseRun({
				tiers: [
					tierParse({
						breakdown: {
							tierName: null,
							questions: [question({ id: '3a' })],
							aoDescriptions: []
						},
						filenames: ['new paper.pdf']
					})
				]
			})
		);

		const file = store.takeBackup();

		// The write was refused, so the file is the only copy of it there is: the
		// new parse, not the document storage still holds.
		const written = parseStoredDocument(file?.text ?? '');
		if (written === null) throw new Error('expected a document');
		expect(written.schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);
		expect(written.label).toBe('new paper');
		expect(written.tiers[0].breakdown.entries.map((entry) => entry.label)).toEqual(['3a']);
		expect(store.saveState.kind).toBe('failed');
	});
});

/** A document as a restore is handed it: read from its file, not built in memory. */
function readable(document: MarksheetDocument): MarksheetDocument {
	const read = parseStoredDocument(JSON.stringify(document));
	if (!read) throw new Error('not a document');
	return read;
}

describe('restoring a backup', () => {
	it('brings a marksheet back, marks and all, from the file it handed out', () => {
		const { store } = openStore({
			breakdownConfirmedAt: NOW.toISOString(),
			label: 'Ph1',
			className: '10C1',
			tiers: [
				tier({
					sourceFilenames: ['paper.pdf']
				})
			],
			students: [student('student-1', 'Ada', 'Lovelace')],
			marks: { 'student-1': { 'entry-1': 3 } }
		});
		const file = store.takeBackup();

		const storage = fakeStorage();
		const fresh = storeWith(storage);

		expect(fresh.restoreBackup(readable(JSON.parse(file?.text ?? '')))).toBe(true);
		expect(fresh.route()).toBe('/marksheet');
		expect(fresh.label).toBe('Ph1');
		expect(fresh.className).toBe('10C1');
		expect(fresh.document?.students).toEqual([student('student-1', 'Ada', 'Lovelace')]);
		expect(fresh.document?.marks).toEqual({ 'student-1': { 'entry-1': 3 } });
		expect(fresh.document?.lastExportedAt).toBe(NOW.toISOString());
		// What a restore gives back is the file, byte for byte: the round trip
		// loses nothing at all.
		expect(JSON.stringify(fresh.document)).toBe(file?.text);
		// A restore is a document the teacher now holds; storage keeps it at once.
		expect(stored(storage).marks).toEqual({ 'student-1': { 'entry-1': 3 } });
	});

	it('brings boundaries, topic names and reports back from the file it handed out, byte for byte', () => {
		const report: StoredReport = reportFixture({
			areasForImprovement: ['Practise multi-step calculations weekly.'],
			edit: {
				strengths: ['You explain processes clearly, Ada.'],
				areasForImprovement: ['Practise multi-step calculations weekly.']
			},
			input: {
				paperLabel: 'Ph1',
				entries: [
					{
						label: '2bii',
						summary: 'Describe the rate change',
						commandWord: 'Describe',
						ao: 'AO2',
						topics: ['Rates of reaction'],
						gained: 3,
						available: 4
					}
				]
			}
		});
		const { store } = openStore({
			breakdownConfirmedAt: NOW.toISOString(),
			label: 'Ph1',
			className: '10C1',
			tiers: [
				tier({
					sourceFilenames: ['paper.pdf'],
					boundaries: [{ label: 'A', minimum: 52 }]
				})
			],
			students: [student('student-1', 'Ada', 'Lovelace')],
			marks: { 'student-1': { 'entry-1': 3 } },
			topicNames: { '3.2.1.4': 'Rates of reaction' },
			reports: { 'student-1': report }
		});
		const file = store.takeBackup();

		const fresh = storeWith(fakeStorage());

		expect(fresh.restoreBackup(readable(JSON.parse(file?.text ?? '')))).toBe(true);
		expect(JSON.stringify(fresh.document)).toBe(file?.text);
	});

	it('keeps the report of a student who is present but ineligible', () => {
		const report = reportFixture();
		const store = storeWith(fakeStorage());
		const absent = readable(
			parsed({
				students: [student('student-1', 'Ada', 'Lovelace', true)],
				reports: { 'student-1': report }
			})
		);

		store.restoreBackup(absent);

		expect(store.document?.reports).toEqual({ 'student-1': report });
	});

	it('lands the restored document on the surface its state allows', () => {
		const unconfirmed = readable(parsed({ breakdownConfirmedAt: null }));
		const confirmed = readable(parsed({ breakdownConfirmedAt: NOW.toISOString() }));

		const toReview = storeWith(fakeStorage());
		expect(toReview.restoreBackup(unconfirmed)).toBe(true);
		expect(toReview.route()).toBe('/breakdown');
		const toMarksheet = storeWith(fakeStorage());
		expect(toMarksheet.restoreBackup(confirmed)).toBe(true);
		expect(toMarksheet.route()).toBe('/marksheet');
	});

	it('drops marks whose student or entry the file no longer holds', () => {
		const store = storeWith(fakeStorage());
		const orphaned = readable(
			parsed({
				breakdownConfirmedAt: NOW.toISOString(),
				students: [student('student-1', 'Ada', 'Lovelace')],
				marks: { 'student-1': { 'entry-1': 3, 'entry-gone': 2 }, 'student-gone': { 'entry-1': 1 } }
			})
		);

		store.restoreBackup(orphaned);

		expect(store.document?.marks).toEqual({ 'student-1': { 'entry-1': 3 } });
	});

	it('drops reports for removed students and names for orphaned codes on the way in', () => {
		const store = storeWith(fakeStorage());
		const report = reportFixture();
		const orphaned = readable(
			parsed({
				breakdownConfirmedAt: NOW.toISOString(),
				students: [student('student-1', 'Ada', 'Lovelace')],
				topicNames: { '9.9.9': 'Gone' },
				reports: { 'student-1': report, 'student-gone': report }
			})
		);

		store.restoreBackup(orphaned);

		expect(store.document?.reports).toEqual({ 'student-1': report });
		expect(store.document?.topicNames).toEqual({});
	});

	it('refuses to replace a document the browser already holds', () => {
		const { store, storage } = openStore();
		const other = readable(parsed({ label: 'Other paper' }));

		expect(store.restoreBackup(other)).toBe(false);

		expect(store.label).toBe('10X Ph1');
		expect(stored(storage).label).toBe('10X Ph1');
	});

	it('clears the unbacked-change marker of the file it restores', () => {
		const store = storeWith(fakeStorage());
		const file = readable(
			parsed({
				lastExportedAt: NOW.toISOString(),
				firstUnbackedChangeAt: new Date(NOW.getTime() + 60_000).toISOString()
			})
		);

		expect(store.restoreBackup(file)).toBe(true);

		expect(store.document?.firstUnbackedChangeAt).toBeNull();
	});
});

describe('changes since the last backup', () => {
	/** A document with an undoable change in it, backed up, and a clock under the test's hand. */
	function backedUpStore() {
		let nowMs = NOW.getTime();
		const storage = fakeStorage({
			[STORAGE_KEY]: JSON.stringify(
				parsed({
					breakdownConfirmedAt: NOW.toISOString(),
					students: [student('student-1', 'Ada', 'Lovelace')]
				})
			)
		});
		const store = storeWith(storage, () => new Date(nowMs));
		store.load();
		store.takeBackup();
		return {
			store,
			storage,
			/** Move the clock on, and let the debounced save catch up with it. */
			at(ms: number) {
				nowMs += ms;
				vi.advanceTimersByTime(ms);
			}
		};
	}

	it('records the first change after a backup and leaves it alone for later changes', () => {
		const { store, at } = backedUpStore();
		expect(store.document?.firstUnbackedChangeAt).toBeNull();

		at(60_000);
		store.setMark('student-1', 'entry-1', 3);
		const firstChange = new Date(NOW.getTime() + 60_000).toISOString();
		expect(store.document?.firstUnbackedChangeAt).toBe(firstChange);

		at(60_000);
		store.setMark('student-1', 'entry-1', 2);
		expect(store.document?.firstUnbackedChangeAt).toBe(firstChange);
	});

	it('writes the moment and reads it back after a reload', () => {
		const { store, storage, at } = backedUpStore();
		at(60_000);
		store.setMark('student-1', 'entry-1', 3);
		store.flush();

		const reloaded = storeWith(storage, () => new Date(NOW.getTime() + 120_000));
		reloaded.load();

		expect(reloaded.document?.firstUnbackedChangeAt).toBe(
			new Date(NOW.getTime() + 60_000).toISOString()
		);
	});

	it('clears the moment when a backup is taken', () => {
		const { store, at } = backedUpStore();
		at(60_000);
		store.setMark('student-1', 'entry-1', 3);

		store.takeBackup();

		expect(store.document?.firstUnbackedChangeAt).toBeNull();
	});

	it('leaves a document that has never been backed up unmarked', () => {
		const store = storeWith(fakeStorage());
		store.createFromAssessment(parseRun());

		store.setPaperLabel('10X');

		expect(store.document?.firstUnbackedChangeAt).toBeNull();
	});

	it('starts the clock at the undo when nothing older is unbacked', () => {
		const { store, at } = backedUpStore();
		at(60_000);
		store.removeStudent('student-1');
		at(60_000);

		expect(store.undo()).toBe(true);

		expect(store.document?.firstUnbackedChangeAt).toBe(
			new Date(NOW.getTime() + 120_000).toISOString()
		);
	});

	it('keeps the older unbacked moment when an undo follows another change', () => {
		const { store, at } = backedUpStore();
		at(60_000);
		store.setMark('student-1', 'entry-1', 3);
		const firstChange = new Date(NOW.getTime() + 60_000).toISOString();
		at(60_000);
		store.removeStudent('student-1');

		expect(store.undo()).toBe(true);

		expect(store.document?.firstUnbackedChangeAt).toBe(firstChange);
	});

	it('compares the unbacked moment with the backup as dates, not text', () => {
		// 10:00Z, though it sorts after the 10:30Z backup as text.
		const marker = '2026-01-01T12:00:00+02:00';
		const storage = fakeStorage({
			[STORAGE_KEY]: JSON.stringify(
				parsed({
					breakdownConfirmedAt: NOW.toISOString(),
					students: [student('student-1', 'Ada', 'Lovelace')],
					lastExportedAt: '2026-01-01T10:30:00Z',
					firstUnbackedChangeAt: marker
				})
			)
		});
		const store = storeWith(storage);
		store.load();

		store.removeStudent('student-1');
		expect(store.undo()).toBe(true);

		expect(store.document?.firstUnbackedChangeAt).toBe(NOW.toISOString());
	});
});
