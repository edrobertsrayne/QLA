import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	CORRUPT_KEY_PREFIX,
	DOCUMENT_SCHEMA_VERSION,
	STORAGE_KEY,
	parseStoredDocument
} from './document.js';
import type { MarksheetDocument } from './document.js';
import { parseRun, parsed, question, student } from './fixtures.spec-helpers.js';
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

	it('opens a v2 document with its boundaries, topic names and reports intact', () => {
		const report = {
			strengths: ['You explain processes clearly.'],
			areasForImprovement: [] as string[],
			edit: null,
			input: { paperLabel: '10X Ph1', entries: [] as never[] },
			model: 'openai/gpt-6-luna',
			generatedAt: NOW.toISOString()
		};
		const document = parsed({
			breakdownConfirmedAt: NOW.toISOString(),
			paper: {
				...parsed().paper,
				boundaries: [{ label: 'A', minimum: 52 }],
				belowLowestLabel: 'U'
			},
			students: [student('student-1', 'Ada', 'Lovelace')],
			topicNames: { '3.2.1.4': 'Rates of reaction' },
			reports: { 'student-1': report }
		});
		const store = storeWith(fakeStorage({ [STORAGE_KEY]: JSON.stringify(document) }));

		store.load();

		expect(store.document).toEqual(document);
		expect(store.route()).toBe('/marksheet');
	});

	it('drops orphaned reports and topic names on boot', () => {
		const report = {
			strengths: ['You explain processes clearly.'],
			areasForImprovement: [] as string[],
			edit: null,
			input: { paperLabel: '10X Ph1', entries: [] as never[] },
			model: 'openai/gpt-6-luna',
			generatedAt: NOW.toISOString()
		};
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
		const prose = {
			strengths: ['You explain processes clearly.'],
			areasForImprovement: [] as string[]
		};
		const input = { paperLabel: '10X Ph1', entries: [] as never[] };

		/** A store holding one student's generated report with no edit beside it. */
		function storeWithReport() {
			const report = {
				...prose,
				edit: null,
				input,
				model: 'openai/gpt-6-luna',
				generatedAt: NOW.toISOString()
			};
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

describe('createFromParse', () => {
	const input = parseRun({
		breakdown: {
			questions: [
				question({
					id: '1a',
					questionNumber: '1',
					marks: 2,
					summary: 'Explain the process shown',
					specPoint: null,
					commandWord: 'Explain',
					ao: 'AO1'
				}),
				question({ ao: null })
			],
			aoDescriptions: []
		},
		warnings: [
			{ questionId: '2bii', code: 'SUMMARY_LENGTH', message: '2 words; expected 3–8 words.' },
			{ questionId: null, code: 'SPEC_UNREADABLE', message: 'Specification could not be read.' }
		],
		usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, estCost: 0.001 },
		filenames: ['paper.pdf', 'markscheme.pdf']
	});

	it('stores the descriptions the parse found and skips the objectives it left null', () => {
		const storage = fakeStorage();
		const store = storeWith(storage);

		store.createFromParse({
			...input,
			breakdown: {
				...input.breakdown,
				aoDescriptions: [
					{ ao: 'AO1', description: 'Demonstrate knowledge and understanding' },
					{ ao: 'AO2', description: null },
					{ ao: 'AO3', description: '  ' }
				]
			}
		});

		expect(stored(storage).breakdown.aoDescriptions).toEqual({
			AO1: 'Demonstrate knowledge and understanding'
		});
	});

	it('writes an unconfirmed document with generated entry ids and re-keyed warnings', () => {
		const storage = fakeStorage();
		const store = storeWith(storage);

		store.createFromParse(input);

		const written = stored(storage);
		expect(written.schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);
		expect(written.breakdownConfirmedAt).toBeNull();
		expect(written.lastExportedAt).toBeNull();
		expect(written.createdAt).toBe(NOW.toISOString());
		expect(written.updatedAt).toBe(NOW.toISOString());
		expect(written.paper).toEqual({
			label: 'paper',
			className: null,
			sourceFilenames: ['paper.pdf', 'markscheme.pdf'],
			parsedAt: NOW.toISOString(),
			boundaries: null,
			belowLowestLabel: 'U'
		});
		expect(written.students).toEqual([]);
		expect(written.marks).toEqual({});
		expect(written.topicNames).toEqual({});
		expect(written.reports).toEqual({});

		const entries = written.breakdown.entries;
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

		expect(written.breakdown.warnings).toEqual([
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

		const written = stored(storage);
		expect(written.paper.label).toBe('10X Ph1 2026');
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
			breakdown: { questions: [input.breakdown.questions[1], duplicate], aoDescriptions: [] },
			warnings: [
				{ questionId: '2bii', code: 'DUPLICATE_ID', message: "Duplicate question id '2bii'." },
				{ questionId: 'q[0]', code: 'EMPTY_ID', message: 'Entry q[0] has an empty question id.' }
			],
			filenames: ['paper.pdf']
		});

		const written = stored(storage);
		expect(written.breakdown.entries).toHaveLength(2);
		expect(written.breakdown.warnings).toEqual([
			{ questionId: null, code: 'DUPLICATE_ID', message: "Duplicate question id '2bii'." },
			{ questionId: null, code: 'EMPTY_ID', message: 'Entry q[0] has an empty question id.' }
		]);
	});

	it('leaves the label null when the run had no filename', () => {
		const storage = fakeStorage();
		storeWith(storage).createFromParse({ ...input, filenames: [] });

		const written = stored(storage);
		expect(written.paper.label).toBeNull();
	});

	it('keeps working, and reporting unavailable, when the browser refuses writes', () => {
		const store = storeWith(refusingWrites(fakeStorage(), () => true, new Error('SecurityError')));
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
		const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(parsed()) });
		const store = storeWith(
			refusingWrites(storage, (key) => key === STORAGE_KEY, new Error('QuotaExceededError'))
		);
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
		expect(written.paper.label).toBe('10X/Ph1');
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
		expect(written.paper.label).toBe('10X/Ph1');
	});

	it('flushes a pending change immediately', () => {
		const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(parsed()) });
		const store = storeWith(storage);
		store.load();

		store.setPaperLabel('10X/Ph1');
		store.flush();

		const written = stored(storage);
		expect(written.paper.label).toBe('10X/Ph1');
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
		expect(written.paper.label).toBe('10X/Ph1');
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

		expect(store.document?.paper.label).toBe('10X/Ph1');
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
		store.createFromParse(
			parseRun({ breakdown: { questions: [], aoDescriptions: [] }, filenames: ['paper.pdf'] })
		);
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
		store.createFromParse(
			parseRun({
				breakdown: { questions: [question({ id: '3a' })], aoDescriptions: [] },
				filenames: ['new paper.pdf']
			})
		);

		const file = store.takeBackup();

		// The write was refused, so the file is the only copy of it there is: the
		// new parse, not the document storage still holds.
		const written = JSON.parse(file?.text ?? '{}') as MarksheetDocument;
		expect(written.schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);
		expect(written.paper.label).toBe('new paper');
		expect(written.breakdown.entries.map((entry) => entry.label)).toEqual(['3a']);
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
			paper: {
				label: 'Ph1',
				className: '10C1',
				sourceFilenames: ['paper.pdf'],
				parsedAt: 'x',
				boundaries: null,
				belowLowestLabel: 'U'
			},
			students: [student('student-1', 'Ada', 'Lovelace')],
			marks: { 'student-1': { 'entry-1': 3 } }
		});
		const file = store.takeBackup();

		const storage = fakeStorage();
		const fresh = storeWith(storage);

		expect(fresh.restoreBackup(readable(JSON.parse(file?.text ?? '')))).toBe(true);
		expect(fresh.route()).toBe('/marksheet');
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

	it('brings boundaries, topic names and reports back from the file it handed out, byte for byte', () => {
		const report = {
			strengths: ['You explain processes clearly.'],
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
						ao: 'AO2' as const,
						topics: ['Rates of reaction'],
						gained: 3,
						available: 4
					}
				]
			},
			model: 'openai/gpt-6-luna',
			generatedAt: NOW.toISOString()
		};
		const { store } = openStore({
			breakdownConfirmedAt: NOW.toISOString(),
			paper: {
				label: 'Ph1',
				className: '10C1',
				sourceFilenames: ['paper.pdf'],
				parsedAt: 'x',
				boundaries: [{ label: 'A', minimum: 52 }],
				belowLowestLabel: 'U'
			},
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
		const report = {
			strengths: ['You explain processes clearly.'],
			areasForImprovement: [] as string[],
			edit: null,
			input: { paperLabel: '10X Ph1', entries: [] as never[] },
			model: 'openai/gpt-6-luna',
			generatedAt: NOW.toISOString()
		};
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
		const report = {
			strengths: ['You explain processes clearly.'],
			areasForImprovement: [] as string[],
			edit: null,
			input: { paperLabel: '10X Ph1', entries: [] as never[] },
			model: 'openai/gpt-6-luna',
			generatedAt: NOW.toISOString()
		};
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
		const other = readable(parsed({ paper: { ...parsed().paper, label: 'Other paper' } }));

		expect(store.restoreBackup(other)).toBe(false);

		expect(store.document?.paper.label).toBe('10X Ph1');
		expect(stored(storage).paper.label).toBe('10X Ph1');
	});

	it('stands the reminder up again for a document restored after a dismissal', () => {
		const store = storeWith(fakeStorage());
		store.dismissBackupReminder();

		store.restoreBackup(readable(parsed({ lastExportedAt: null })));

		expect(store.backupReminderDismissed).toBe(false);
	});

	it('stands the reminder up again for a document parsed after a dismissal', () => {
		const store = storeWith(fakeStorage());
		store.dismissBackupReminder();

		store.createFromParse(
			parseRun({ breakdown: { questions: [], aoDescriptions: [] }, filenames: ['paper.pdf'] })
		);

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
