import { describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY, entryValuesOf, storedMarkCount } from './document.js';
import type { BreakdownEntry, MarksheetDocument, StoredTier, StoredWarning } from './document.js';
import { entry, parsed, student, tier } from './fixtures.spec-helpers.js';
import { changedInputFields, generationInputFor } from './report-input.js';
import {
	NOW,
	documentWrites,
	entryOf,
	fakeStorage,
	idOf,
	openStore,
	stored,
	storeWith
} from './store.spec-helpers.js';

const ORIGIN = entryValuesOf(entry('entry-1', '2bii', '2'));

/** One tier's breakdown, as a document override. */
function tierWith(
	entries: BreakdownEntry[],
	warnings: StoredWarning[] = [],
	overrides: Partial<StoredTier> = {}
): StoredTier {
	return tier({ breakdown: { entries, warnings }, ...overrides });
}

/** An assessment on two named tiers, neither confirmed yet. */
function twoTiers(overrides: Partial<MarksheetDocument> = {}): Partial<MarksheetDocument> {
	return {
		tiers: [
			tierWith([entry('entry-h1', '1a', '1')], [], { tierName: 'Higher' }),
			tierWith([entry('entry-f1', '1a', '1')], [], {
				tierName: 'Foundation',
				sourceFilenames: ['foundation.pdf']
			})
		],
		...overrides
	};
}

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

			expect(stored(storage).tiers[0].breakdown.entries).toEqual([
				{
					id: 'entry-1',
					label: '2b',
					questionNumber: '3',
					marks: 6,
					summary: 'Explain the rate change',
					specPoint: '3.2.2.1',
					commandWord: 'State',
					ao: 'AO3',
					// The values the entry carried as it was read.
					original: ORIGIN
				}
			]);
			expect(documentWrites(storage)).toEqual([STORAGE_KEY]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('keeps the values an entry was read with beside an edit to another entry', () => {
		const { store } = openStore({
			tiers: [tierWith([entry('entry-1', '1a', '1'), entry('entry-2', '1b', '1')])]
		});

		store.setEntrySummary('entry-2', 'Something else');

		expect(entryOf(store, 'entry-1')?.original).toEqual({
			...ORIGIN,
			label: '1a',
			questionNumber: '1'
		});
		expect(entryOf(store, 'entry-2')?.original).toEqual({
			...ORIGIN,
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
			tiers: [
				tierWith([
					entry('entry-1', '1a', '1'),
					entry('entry-2', '1b', '1'),
					entry('entry-3', '2a', '2')
				])
			]
		});

		store.setBandQuestionNumber(['entry-1', 'entry-2'], '5');

		expect(store.entriesOf(0).map((one) => one.questionNumber)).toEqual(['5', '5', '2']);
		expect(store.bandsOf(0).map((band) => band.entries.length)).toEqual([2, 1]);
	});

	it('ignores an edit aimed at an entry that is not there', () => {
		vi.useFakeTimers();
		try {
			const { store, storage } = openStore();

			store.setEntryLabel('entry-gone', '2b');
			store.setEntryMarks('entry-gone', 3);
			vi.advanceTimersByTime(500);

			expect(entryOf(store, 'entry-1')?.label).toBe('2bii');
			expect(documentWrites(storage)).toEqual([]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('edits an entry on either tier', () => {
		const { store } = openStore(twoTiers());

		store.setEntryLabel('entry-f1', '1b');
		store.setEntryMarks('entry-f1', 3);
		store.setEntryLabel('entry-h1', '1b');
		store.setEntryMarks('entry-h1', 2);

		expect(entryOf(store, 'entry-f1')).toMatchObject({ label: '1b', marks: 3 });
		expect(entryOf(store, 'entry-h1')).toMatchObject({ label: '1b', marks: 2 });
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

		expect(entryOf(store, 'entry-1')).toEqual(parsed().tiers[0].breakdown.entries[0]);
	});
});

describe('breakdown structure', () => {
	const threeEntries: Partial<MarksheetDocument> = {
		tiers: [
			tierWith([
				entry('entry-1', '1a', '1'),
				entry('entry-2', '1b', '1'),
				entry('entry-3', '2a', '2')
			])
		]
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
			expect(store.entriesOf(0).map((one) => one.id)).toEqual([
				'entry-1',
				id,
				'entry-2',
				'entry-3'
			]);

			vi.advanceTimersByTime(500);
			expect(stored(storage).tiers[0].breakdown.entries.map((one) => one.id)).toEqual([
				'entry-1',
				id,
				'entry-2',
				'entry-3'
			]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('inserts below a row on the row’s own tier', () => {
		const { store } = openStore(twoTiers());

		const id = idOf(store.insertEntryAfter('entry-f1'));

		expect(store.entriesOf(1).map((one) => one.id)).toEqual(['entry-f1', id]);
		expect(store.entriesOf(0).map((one) => one.id)).toEqual(['entry-h1']);
	});

	it('adds a row at the end as a question of its own', () => {
		const { store } = openStore(threeEntries);

		const id = idOf(store.appendEntry(0));

		expect(store.entriesOf(0).map((one) => one.id)).toEqual(['entry-1', 'entry-2', 'entry-3', id]);
		// A question of its own, for the paper's last question — the one a parse
		// most often misses. Numbering it re-numbers nothing else.
		expect(entryOf(store, id)?.questionNumber).toBe('');
		expect(store.bandsOf(0).map((band) => band.questionNumber)).toEqual(['1', '2', '']);
	});

	it('adds a row to the end of one tier, leaving the other alone', () => {
		const { store } = openStore(twoTiers());

		const id = idOf(store.appendEntry(1));

		expect(store.entriesOf(1).map((one) => one.id)).toEqual(['entry-f1', id]);
		expect(store.entriesOf(0).map((one) => one.id)).toEqual(['entry-h1']);
	});

	it('adds a row at the end of a breakdown with no entries', () => {
		const { store } = openStore({ tiers: [tierWith([])] });

		const id = idOf(store.appendEntry(0));

		expect(store.entriesOf(0)).toHaveLength(1);
		expect(entryOf(store, id)?.questionNumber).toBe('');
	});

	it('refuses a row aimed at a tier the assessment does not have', () => {
		const { store } = openStore(threeEntries);

		expect(store.appendEntry(1)).toBeNull();
		expect(store.entriesOf(0)).toHaveLength(3);
	});

	it('refuses to insert below an entry that is not there', () => {
		vi.useFakeTimers();
		try {
			const { store, storage } = openStore(threeEntries);

			expect(store.insertEntryAfter('entry-gone')).toBeNull();

			expect(store.entriesOf(0)).toHaveLength(3);
			vi.advanceTimersByTime(500);
			expect(documentWrites(storage)).toEqual([]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('deletes an entry and takes its marks and findings with it', () => {
		const { store } = openStore({
			...threeEntries,
			students: [student('student-1', 'Ada', 'Lovelace')],
			marks: { 'student-1': { 'entry-2': 3, 'entry-3': 1 } },
			tiers: [
				tierWith(
					[entry('entry-1', '1a', '1'), entry('entry-2', '1b', '1'), entry('entry-3', '2a', '2')],
					[
						{ questionId: 'entry-2', code: 'SUMMARY_LENGTH', message: 'Two words.' },
						{ questionId: 'entry-3', code: 'MARKS_UNKNOWN', message: 'No marks read.' },
						{ questionId: null, code: 'SPEC_UNREADABLE', message: 'No specification.' }
					]
				)
			]
		});

		expect(store.deleteEntry('entry-2')).toBe(true);

		expect(store.entriesOf(0).map((one) => one.id)).toEqual(['entry-1', 'entry-3']);
		expect(store.document?.marks).toEqual({ 'student-1': { 'entry-3': 1 } });
		// The finding was about an entry that is gone: nothing could show it again.
		expect(store.document?.tiers[0].breakdown.warnings).toEqual([
			{ questionId: 'entry-3', code: 'MARKS_UNKNOWN', message: 'No marks read.' },
			{ questionId: null, code: 'SPEC_UNREADABLE', message: 'No specification.' }
		]);
	});

	it('deletes an entry on the second tier without touching the first', () => {
		const { store } = openStore(twoTiers());

		expect(store.deleteEntry('entry-f1')).toBe(true);

		expect(store.entriesOf(1)).toEqual([]);
		expect(store.entriesOf(0).map((one) => one.id)).toEqual(['entry-h1']);
	});

	it('offers one deletion to undo, back where it was with its marks and findings', () => {
		const { store } = openStore({
			...threeEntries,
			students: [student('student-1', 'Ada', 'Lovelace')],
			marks: { 'student-1': { 'entry-2': 3 } },
			tiers: [
				tierWith(
					[entry('entry-1', '1a', '1'), entry('entry-2', '1b', '1'), entry('entry-3', '2a', '2')],
					[
						{ questionId: 'entry-2', code: 'SUMMARY_LENGTH', message: 'Two words.' },
						{ questionId: null, code: 'SPEC_UNREADABLE', message: 'No specification.' }
					]
				)
			]
		});

		store.deleteEntry('entry-2');
		expect(store.undoable).toMatchObject({ kind: 'entry-removal' });

		expect(store.undo()).toBe(true);

		expect(store.entriesOf(0).map((one) => one.id)).toEqual(['entry-1', 'entry-2', 'entry-3']);
		expect(entryOf(store, 'entry-2')?.label).toBe('1b');
		expect(store.document?.marks).toEqual({ 'student-1': { 'entry-2': 3 } });
		expect(
			store.document?.tiers[0].breakdown.warnings.map((warning) => warning.questionId)
		).toEqual(['entry-2', null]);
		expect(store.undoable).toBeNull();
	});

	it('deleting a paired entry drops the pair from either side, and undo brings both back', () => {
		const { store } = openStore(
			twoTiers({
				commonQuestions: [{ tier1EntryId: 'entry-h1', tier2EntryId: 'entry-f1' }]
			})
		);

		expect(store.deleteEntry('entry-f1')).toBe(true);

		expect(store.pairOf(0, 'entry-h1')).toBeNull();
		expect(store.document?.commonQuestions).toEqual([]);

		expect(store.undo()).toBe(true);

		expect(store.pairOf(0, 'entry-h1')).toEqual({
			tier1EntryId: 'entry-h1',
			tier2EntryId: 'entry-f1'
		});
		expect(store.partnerOf(1, 'entry-f1')).toBe('entry-h1');

		// The Tier 1 member is the other side of the same cleanup.
		expect(store.deleteEntry('entry-h1')).toBe(true);
		expect(store.pairOf(1, 'entry-f1')).toBeNull();
		expect(store.document?.commonQuestions).toEqual([]);

		expect(store.undo()).toBe(true);
		expect(store.pairOf(0, 'entry-h1')).toEqual({
			tier1EntryId: 'entry-h1',
			tier2EntryId: 'entry-f1'
		});
	});

	it('takes nothing back twice', () => {
		const { store } = openStore(threeEntries);

		store.deleteEntry('entry-2');
		store.undo();
		store.undo();

		expect(store.entriesOf(0)).toHaveLength(3);
	});

	it('keeps the undo when a change is refused', () => {
		const { store } = openStore(threeEntries);

		store.deleteEntry('entry-2');
		// Refused: a mark that is not a whole number, and an entry that is not there.
		store.setEntryMarks('entry-1', 2.5);
		store.setEntryLabel('entry-gone', '9z');

		expect(store.undoable).not.toBeNull();
		expect(store.undo()).toBe(true);
		expect(store.entriesOf(0).map((one) => one.id)).toEqual(['entry-1', 'entry-2', 'entry-3']);
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
		expect(store.entriesOf(0).map((one) => one.id)).toEqual(['entry-1', 'entry-3', 'entry-2']);

		expect(store.moveEntry('entry-2', -1)).toBe(true);
		expect(store.entriesOf(0).map((one) => one.id)).toEqual(['entry-1', 'entry-2', 'entry-3']);
	});

	it('moves only within the entry’s own tier', () => {
		const { store } = openStore(
			twoTiers({
				tiers: [
					tierWith([entry('entry-h1', '1a', '1'), entry('entry-h2', '1b', '1')], [], {
						tierName: 'Higher'
					}),
					tierWith([entry('entry-f1', '1a', '1'), entry('entry-f2', '1b', '1')], [], {
						tierName: 'Foundation'
					})
				]
			})
		);

		expect(store.moveEntry('entry-f1', 1)).toBe(true);

		expect(store.entriesOf(1).map((one) => one.id)).toEqual(['entry-f2', 'entry-f1']);
		expect(store.entriesOf(0).map((one) => one.id)).toEqual(['entry-h1', 'entry-h2']);
	});

	it('refuses to move an entry past either end, or one that is not there', () => {
		vi.useFakeTimers();
		try {
			const { store, storage } = openStore(threeEntries);

			expect(store.moveEntry('entry-1', -1)).toBe(false);
			expect(store.moveEntry('entry-3', 1)).toBe(false);
			expect(store.moveEntry('entry-gone', -1)).toBe(false);

			expect(store.entriesOf(0).map((one) => one.id)).toEqual(['entry-1', 'entry-2', 'entry-3']);
			vi.advanceTimersByTime(500);
			expect(documentWrites(storage)).toEqual([]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('leaves a confirmed breakdown alone', () => {
		const { store } = openStore({ ...threeEntries, breakdownConfirmedAt: NOW.toISOString() });

		expect(store.insertEntryAfter('entry-1')).toBeNull();
		expect(store.appendEntry(0)).toBeNull();
		expect(store.deleteEntry('entry-1')).toBe(false);
		expect(store.moveEntry('entry-1', 1)).toBe(false);
		expect(store.undo()).toBe(false);

		expect(store.entriesOf(0)).toHaveLength(3);
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

			expect(entryOf(store, 'entry-1')).toEqual(parsed().tiers[0].breakdown.entries[0]);
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
			tiers: [
				tierWith([
					entry('entry-1', '1a', '1', { marks: 3 }),
					entry('entry-2', '2bii', '2', { marks: null })
				])
			]
		});

		expect(store.confirmBreakdown()).toBe(false);

		expect(store.document?.breakdownConfirmedAt).toBeNull();
		expect(store.route()).toBe('/breakdown');
		expect(store.blockers).toMatchObject({
			blocked: true,
			tiers: [
				{
					noAvailableMarks: [expect.objectContaining({ label: '2bii' })],
					emptyLabels: [],
					duplicateLabels: []
				}
			]
		});
	});

	it('refuses while a label is empty or repeated, naming the offenders', () => {
		const { store } = openStore({
			tiers: [
				tierWith([
					entry('entry-1', '2bii', '2'),
					entry('entry-2', '2bii', '2'),
					entry('entry-3', '   ', '3')
				])
			]
		});

		expect(store.confirmBreakdown()).toBe(false);

		expect(store.document?.breakdownConfirmedAt).toBeNull();
		expect(store.blockers.tiers[0].emptyLabels.map((offender) => offender.id)).toEqual(['entry-3']);
		expect(store.blockers.tiers[0].duplicateLabels.map((offender) => offender.id)).toEqual([
			'entry-1',
			'entry-2'
		]);
	});

	it('refuses while either tier name is blank, naming the tier', () => {
		const { store } = openStore(
			twoTiers({
				tiers: [
					tierWith([entry('entry-h1', '1a', '1')], [], { tierName: 'Higher' }),
					tierWith([entry('entry-f1', '1a', '1')], [], { tierName: '  ' })
				]
			})
		);

		expect(store.confirmBreakdown()).toBe(false);

		expect(store.blockers).toMatchObject({ blocked: true, blankTierNames: [1] });
		expect(store.document?.breakdownConfirmedAt).toBeNull();
	});

	it('refuses while both tier names are the same, ignoring case and spacing', () => {
		const { store } = openStore(
			twoTiers({
				tiers: [
					tierWith([entry('entry-h1', '1a', '1')], [], { tierName: 'Higher' }),
					tierWith([entry('entry-f1', '1a', '1')], [], { tierName: ' higher ' })
				]
			})
		);

		expect(store.confirmBreakdown()).toBe(false);

		expect(store.blockers).toMatchObject({ blocked: true, sameTierNames: true });
		expect(store.document?.breakdownConfirmedAt).toBeNull();
	});

	it('refuses while a pair has unequal marks, naming the pair', () => {
		const { store } = openStore(
			twoTiers({
				tiers: [
					tierWith([entry('entry-h1', '1a', '1', { marks: 4 })], [], { tierName: 'Higher' }),
					tierWith([entry('entry-f1', '1a', '1', { marks: 3 })], [], {
						tierName: 'Foundation'
					})
				],
				commonQuestions: [{ tier1EntryId: 'entry-h1', tier2EntryId: 'entry-f1' }]
			})
		);

		expect(store.confirmBreakdown()).toBe(false);

		expect(store.blockers.unequalPairs).toEqual([
			{ tier1EntryId: 'entry-h1', tier2EntryId: 'entry-f1' }
		]);
		expect(store.document?.breakdownConfirmedAt).toBeNull();
	});

	it('confirms once both tier names differ and every pair has equal marks', () => {
		const { store } = openStore(
			twoTiers({
				tiers: [
					tierWith([entry('entry-h1', '1a', '1', { marks: 4 })], [], { tierName: 'Higher' }),
					tierWith([entry('entry-f1', '1a', '1', { marks: 3 })], [], { tierName: '  ' })
				],
				commonQuestions: [{ tier1EntryId: 'entry-h1', tier2EntryId: 'entry-f1' }]
			})
		);
		expect(store.confirmBreakdown()).toBe(false);

		store.setTierName(1, 'Foundation');
		expect(store.confirmBreakdown()).toBe(false);

		store.setEntryMarks('entry-f1', 4);
		expect(store.confirmBreakdown()).toBe(true);

		expect(store.document?.breakdownConfirmedAt).toBe(NOW.toISOString());
		expect(store.route()).toBe('/marksheet');
	});

	it('confirms once the blockers are fixed', () => {
		const { store } = openStore({
			tiers: [tierWith([entry('entry-1', '', '1', { marks: null })])]
		});
		expect(store.confirmBreakdown()).toBe(false);

		store.setEntryLabel('entry-1', '1a');
		store.setEntryMarks('entry-1', 2);

		expect(store.confirmBreakdown()).toBe(true);
		expect(store.route()).toBe('/marksheet');
	});
});

describe('tier names', () => {
	it('renames a tier after the breakdown is confirmed, leaving no undo behind', () => {
		const { store } = openStore({
			breakdownConfirmedAt: NOW.toISOString(),
			tiers: [tierWith([entry('entry-1', '2bii', '2')], [], { tierName: 'Higher' })]
		});

		store.setTierName(0, '  Higher Tier ');

		expect(store.tiers[0].tierName).toBe('Higher Tier');
		// Display data is not a document change to take back.
		expect(store.undoable).toBeNull();
	});

	it('renames either tier after a two-tier confirmation', () => {
		const { store } = openStore(twoTiers({ breakdownConfirmedAt: NOW.toISOString() }));

		store.setTierName(0, 'Higher Tier');
		store.setTierName(1, 'Foundation Tier');

		expect(store.tiers.map((one) => one.tierName)).toEqual(['Higher Tier', 'Foundation Tier']);
		expect(store.undoable).toBeNull();
	});

	it('clears a blank tier name on a single tier, reading it as none', () => {
		const { store } = openStore();

		store.setTierName(0, 'Higher');
		store.setTierName(0, '   ');

		expect(store.tiers[0].tierName).toBeNull();
	});

	it('refuses a blank or the other tier’s name on a two-tier assessment', () => {
		const { store } = openStore(twoTiers());

		store.setTierName(0, '   ');
		expect(store.tiers[0].tierName).toBe('Higher');

		// Trimmed and case-insensitive, the two names would read as one.
		store.setTierName(0, '  foundation ');
		expect(store.tiers[0].tierName).toBe('Higher');

		store.setTierName(0, 'Higher Tier');
		expect(store.tiers[0].tierName).toBe('Higher Tier');
	});

	it('changes nothing when the name is the one already there', () => {
		const { store } = openStore(twoTiers());
		const before = store.document?.updatedAt;

		store.setTierName(0, ' Higher ');

		expect(store.document?.updatedAt).toBe(before);
		expect(store.tiers[0].tierName).toBe('Higher');
		expect(store.undoable).toBeNull();
	});

	it('takes the undo offer with it, because there is no rename to take back', () => {
		const { store } = openStore({
			...twoTiers(),
			breakdownConfirmedAt: NOW.toISOString(),
			students: [student('student-1', 'Ada', 'Lovelace'), student('student-2', 'Grace', 'Hopper')]
		});
		store.removeStudent('student-2');
		expect(store.undoable).toMatchObject({ kind: 'student-removal' });

		store.setTierName(0, 'Higher Tier');

		expect(store.undoable).toBeNull();
		expect(store.undo()).toBe(false);
	});

	it('ignores a tier the assessment does not have', () => {
		const { store } = openStore();

		store.setTierName(1, 'Foundation');

		expect(store.tiers[0].tierName).toBeNull();
		expect(store.undoable).toBeNull();
	});
});

describe('tier findings', () => {
	it('hands back one tier’s findings alone, run-level ones included', () => {
		const { store } = openStore({
			tiers: [
				tierWith(
					[entry('entry-h1', '1a', '1')],
					[
						{ questionId: 'entry-h1', code: 'SUMMARY_LENGTH', message: 'Two words.' },
						{ questionId: null, code: 'MARKS_TOTAL', message: 'Marks total 76.' }
					],
					{ tierName: 'Higher' }
				),
				tierWith(
					[entry('entry-f1', '1a', '1')],
					[{ questionId: null, code: 'SPEC_UNREADABLE', message: 'No specification.' }],
					{ tierName: 'Foundation', sourceFilenames: ['foundation.pdf'] }
				)
			]
		});

		expect(store.warningsOf(0).map((warning) => warning.code)).toEqual([
			'SUMMARY_LENGTH',
			'MARKS_TOTAL'
		]);
		expect(store.warningsOf(1).map((warning) => warning.code)).toEqual(['SPEC_UNREADABLE']);
		// The whole assessment's findings stay available to surfaces covering both.
		expect(store.warnings).toHaveLength(3);
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
			expect(documentWrites(storage)).toEqual([]);
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
				{ id: 'student-2', firstName: 'Grace', surname: 'Hopper', absent: true, tier: 0 }
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
		const document = store.document;
		if (document === null) throw new Error('expected a document');
		expect(storedMarkCount(document)).toBe(0);
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
		const row = store.analysisOf(0).entries.find((one) => one.entry.id === 'entry-1');
		expect(row?.overMax).toBe(1);
	});
});

describe('AO descriptions', () => {
	it('sets, trims and clears a description, writing it with the document', () => {
		vi.useFakeTimers();
		try {
			const { store, storage } = openStore();

			store.setAoDescription('AO2', '  Apply knowledge to new situations ');
			vi.advanceTimersByTime(500);
			expect(stored(storage).aoDescriptions).toEqual({
				AO2: 'Apply knowledge to new situations'
			});

			// A blank clears it rather than storing an empty description.
			store.setAoDescription('AO2', '   ');
			vi.advanceTimersByTime(500);
			expect(stored(storage).aoDescriptions).toEqual({});
		} finally {
			vi.useRealTimers();
		}
	});

	it('is a breakdown edit, so a confirmed breakdown refuses it', () => {
		const { store } = openStore({ breakdownConfirmedAt: NOW.toISOString() });

		store.setAoDescription('AO2', 'Apply knowledge');

		expect(store.document?.aoDescriptions).toEqual({});
	});

	it('leaves a report current: the generation input carries no description', () => {
		const { store } = openStore({
			students: [student('student-1', 'Ada', 'Lovelace')],
			marks: { 'student-1': { 'entry-1': 3 } }
		});
		const document = store.document;
		if (document === null) throw new Error('expected a document');
		const before = generationInputFor(document, 'student-1');
		expect(before).not.toBeNull();

		store.setAoDescription('AO2', 'Apply knowledge to new situations');

		const after = generationInputFor(document, 'student-1');
		expect(after).toEqual(before);
		if (before === null || after === null) throw new Error('expected generation inputs');
		expect(changedInputFields(before, after)).toEqual([]);
		expect(JSON.stringify(after)).not.toContain('Apply knowledge');
	});
});

describe('per-tier grade boundaries', () => {
	it('saves and removes each tier’s boundaries on their own', () => {
		const { store } = openStore(twoTiers({ breakdownConfirmedAt: NOW.toISOString() }));

		store.saveBoundaries(0, [{ label: 'A', minimum: 40 }], 'U');
		store.saveBoundaries(1, [{ label: 'C', minimum: 20 }], 'Below C');

		expect(store.tiers[0].boundaries).toEqual([{ label: 'A', minimum: 40 }]);
		expect(store.tiers[1].boundaries).toEqual([{ label: 'C', minimum: 20 }]);
		expect(store.tiers[1].belowLowestLabel).toBe('Below C');

		store.removeBoundaries(1);

		expect(store.tiers[0].boundaries).toEqual([{ label: 'A', minimum: 40 }]);
		expect(store.tiers[1].boundaries).toBeNull();
	});

	it('offers a boundary save and removal to undo', () => {
		const { store } = openStore(twoTiers({ breakdownConfirmedAt: NOW.toISOString() }));

		store.saveBoundaries(0, [{ label: 'A', minimum: 40 }], 'U');
		expect(store.undoable).toMatchObject({ kind: 'grade-boundaries', action: 'saved' });
		expect(store.undo()).toBe(true);
		expect(store.tiers[0].boundaries).toBeNull();

		store.saveBoundaries(0, [{ label: 'A', minimum: 40 }], 'U');
		store.removeBoundaries(0);
		expect(store.undoable).toMatchObject({ kind: 'grade-boundaries', action: 'removed' });
		expect(store.undo()).toBe(true);
		expect(store.tiers[0].boundaries).toEqual([{ label: 'A', minimum: 40 }]);
	});

	it('does nothing for a tier the assessment does not have, or one with no boundaries', () => {
		const { store } = openStore();

		store.saveBoundaries(1, [{ label: 'A', minimum: 40 }], 'U');
		store.removeBoundaries(1);
		store.removeBoundaries(0);

		expect(store.tiers[0].boundaries).toBeNull();
		expect(store.undoable).toBeNull();
	});
});
