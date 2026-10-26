import { describe, expect, it, vi } from 'vitest';
import { MARK_REFUSAL, storedMarkCount } from './document.js';
import type { BreakdownEntry, MarksheetDocument, StoredTier } from './document.js';
import { entry, student, tier } from './fixtures.spec-helpers.js';
import {
	NOW,
	entryOf,
	fakeStorage,
	idOf,
	openStore,
	stored,
	storeWith,
	studentOf
} from './store.spec-helpers.js';
import type { MarksheetStore } from './store.svelte.js';

/** One tier's breakdown, as a document override. */
function tierWith(entries: BreakdownEntry[], tierName: string | null = null): StoredTier {
	return tier({
		tierName,
		breakdown: { entries, warnings: [] }
	});
}

/** Two two-entry tiers (four entries in all), with every entry worth four marks. */
function twoTierBreakdown(): Partial<MarksheetDocument> {
	return {
		tiers: [
			tierWith([entry('h1', '1a', '1'), entry('h2', '1b', '1')], 'Higher'),
			tierWith([entry('f1', '1a', '1'), entry('f2', '1b', '1')], 'Foundation')
		]
	};
}

describe('class', () => {
	/** A confirmed document: the class belongs to the marksheet a confirmation builds. */
	function openMarksheet(overrides: Partial<MarksheetDocument> = {}) {
		return openStore({ breakdownConfirmedAt: NOW.toISOString(), ...overrides });
	}

	it('adds a student on the one tier, and hands back the id their marks will be filed under', () => {
		const { store } = openMarksheet();

		const id = idOf(store.addStudent({ firstName: 'Ada', surname: 'Lovelace' }));

		expect(studentOf(store, id)).toEqual({
			id,
			firstName: 'Ada',
			surname: 'Lovelace',
			absent: false,
			tier: 0
		});
	});

	it('adds a student with no tier on a two-tier assessment', () => {
		const { store } = openMarksheet(twoTierBreakdown());

		const id = idOf(store.addStudent({ firstName: 'Ada', surname: 'Lovelace' }));

		expect(studentOf(store, id)).toMatchObject({ tier: null });
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

		expect(store.document?.students).toEqual([student('student-1', 'Ada', 'Lovelace')]);
	});

	it('adds an uploaded class list to the end, skipping duplicates, in one undo', () => {
		const { store } = openMarksheet({ students: [student('student-1', 'Ada', 'Lovelace')] });
		const names = [
			{ firstName: 'ada', surname: 'LOVELACE' },
			{ firstName: 'Grace', surname: 'Hopper' },
			{ firstName: 'Grace', surname: 'Hopper' },
			{ firstName: 'Cher', surname: '' }
		];

		store.addStudentsFromUpload(names, 0);

		expect(store.document?.students.map(({ firstName }) => firstName)).toEqual([
			'Ada',
			'Grace',
			'Cher'
		]);
		expect(store.pasteNotice).toMatchObject({ studentsAdded: 2, duplicatesSkipped: 2 });

		expect(store.undo()).toBe(true);
		expect(store.document?.students).toEqual([student('student-1', 'Ada', 'Lovelace')]);
	});

	it('uploads a class list onto the tier named', () => {
		const { store } = openMarksheet(twoTierBreakdown());

		store.addStudentsFromUpload([{ firstName: 'Ada', surname: 'Lovelace' }], 1);

		expect(store.document?.students).toEqual([
			{ id: expect.any(String), firstName: 'Ada', surname: 'Lovelace', absent: false, tier: 1 }
		]);
	});

	it('uploads a class list with no tier on a two-tier assessment', () => {
		const { store } = openMarksheet(twoTierBreakdown());

		store.addStudentsFromUpload([{ firstName: 'Ada', surname: 'Lovelace' }], null);

		expect(store.document?.students).toEqual([
			{ id: expect.any(String), firstName: 'Ada', surname: 'Lovelace', absent: false, tier: null }
		]);
	});

	it('still lets paste and add-one repeat a name', () => {
		const { store } = openMarksheet({ students: [student('student-1', 'Ada', 'Lovelace')] });

		store.addStudent({ firstName: 'Ada', surname: 'Lovelace' });
		store.pasteNames('Lovelace, Ada', 0);

		expect(store.document?.students).toHaveLength(3);
	});

	it('maps a pasted column of names to first names and surnames', () => {
		const { store } = openMarksheet();

		store.pasteNames('Lovelace, Ada\nGrace Brewster Hopper\nCher\n\n   \nHopper, Grace\r\n', 0);

		expect(store.document?.students).toEqual([
			{ id: expect.any(String), firstName: 'Ada', surname: 'Lovelace', absent: false, tier: 0 },
			{
				id: expect.any(String),
				firstName: 'Grace Brewster',
				surname: 'Hopper',
				absent: false,
				tier: 0
			},
			{ id: expect.any(String), firstName: 'Cher', surname: '', absent: false, tier: 0 },
			{ id: expect.any(String), firstName: 'Grace', surname: 'Hopper', absent: false, tier: 0 }
		]);
	});

	it('puts a pasted class list on the resting tier when no tier is given', () => {
		const single = openMarksheet();
		single.store.pasteNames('Lovelace, Ada', null);
		expect(single.store.document?.students[0]).toMatchObject({ tier: 0 });

		const tiered = openMarksheet(twoTierBreakdown());
		tiered.store.pasteNames('Lovelace, Ada', null);
		expect(tiered.store.document?.students[0]).toMatchObject({ tier: null });
	});

	it('says how many students a paste made', () => {
		const { store } = openMarksheet();

		expect(store.pasteNames('Lovelace, Ada\n\n', 0)).toBe(1);
		expect(store.pasteNames('', 0)).toBe(0);
	});

	it('does not make a student of a pasted line that holds no name', () => {
		const { store } = openMarksheet();

		expect(store.pasteNames('Ada Lovelace\n,\n', 0)).toBe(1);
		expect(store.document?.students).toEqual([
			{ id: expect.any(String), firstName: 'Ada', surname: 'Lovelace', absent: false, tier: 0 }
		]);
	});

	it('builds the class and its marks from names with marks beside them', () => {
		const { store } = openMarksheet();
		const entryId = store.entriesOf(0)[0].id;

		expect(store.pasteNames('Ada Lovelace\t3\r\nHopper, Grace\t4\r\n', 0)).toBe(2);

		const [ada, grace] = store.document?.students ?? [];
		expect(ada).toMatchObject({ firstName: 'Ada', surname: 'Lovelace', tier: 0 });
		expect(grace).toMatchObject({ firstName: 'Grace', surname: 'Hopper', tier: 0 });
		expect(store.document?.marks).toEqual({
			[ada.id]: { [entryId]: 3 },
			[grace.id]: { [entryId]: 4 }
		});
	});

	it('puts a class list and its marks on the second tier', () => {
		const { store } = openMarksheet(twoTierBreakdown());

		expect(store.pasteNames('Ada Lovelace\t3\r\nHopper, Grace\t4\r\n', 1)).toBe(2);

		const [ada, grace] = store.document?.students ?? [];
		expect(ada).toMatchObject({ firstName: 'Ada', surname: 'Lovelace', tier: 1 });
		expect(grace).toMatchObject({ firstName: 'Grace', surname: 'Hopper', tier: 1 });
		// f1 is Tier 2's first entry: the marks went with the students.
		expect(store.document?.marks).toEqual({
			[ada.id]: { f1: 3 },
			[grace.id]: { f1: 4 }
		});
	});

	it('refuses a class list with marks while there is no tier to put them on', () => {
		const { store } = openMarksheet(twoTierBreakdown());

		expect(store.pasteNames('Ada Lovelace\t3\r\n', null)).toBe(0);

		expect(store.document?.students).toEqual([]);
		expect(store.pasteRefusal).toContain('marks need a tier');
		expect(store.undoable).toBeNull();

		// Names alone still wait on Tier not set, where the placing happens.
		expect(store.pasteNames('Grace Hopper', null)).toBe(1);
		expect(store.pasteRefusal).toBeNull();
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
		expect(store.document?.className).toBe('10C1');

		store.setClassName('   ');
		expect(store.document?.className).toBeNull();
	});

	it('labels the paper, reading a blank label as none', () => {
		const { store } = openMarksheet();

		store.setPaperLabel('  10X/Ph1 ');
		expect(store.label).toBe('10X/Ph1');

		store.setPaperLabel('   ');
		expect(store.label).toBeNull();
	});

	it('does nothing when no marksheet is stored', () => {
		const store = storeWith(fakeStorage());

		expect(store.addStudent({ firstName: 'Ada', surname: 'Lovelace' })).toBeNull();
		expect(store.pasteNames('Ada Lovelace', 0)).toBe(0);
		expect(store.removeStudent('student-1')).toBe(false);
		expect(store.document).toBeNull();
	});
});

describe('student tiers', () => {
	/** A confirmed two-tier marksheet, with every entry worth four marks. */
	function openTwoTierMarksheet(overrides: Partial<MarksheetDocument> = {}) {
		return openStore({
			...twoTierBreakdown(),
			breakdownConfirmedAt: NOW.toISOString(),
			...overrides
		});
	}

	it('moves a student to the other tier and keeps their off-tier marks', () => {
		const { store } = openTwoTierMarksheet({
			students: [student('student-1', 'Ada', 'Lovelace', false, 0)],
			marks: { 'student-1': { h1: 3, f1: 2 } }
		});

		store.setStudentTier('student-1', 1);

		expect(studentOf(store, 'student-1')?.tier).toBe(1);
		// Marks on the tier they left are kept, not deleted: they count again if
		// the student moves back.
		expect(store.document?.marks).toEqual({ 'student-1': { h1: 3, f1: 2 } });
		expect(store.undoable).toMatchObject({ kind: 'student-tier', name: 'Ada Lovelace' });

		expect(store.undo()).toBe(true);
		expect(studentOf(store, 'student-1')?.tier).toBe(0);
	});

	it('keeps every stored mark when a student changes tier', () => {
		const { store } = openTwoTierMarksheet({
			students: [student('student-1', 'Ada', 'Lovelace', false, 0)],
			marks: { 'student-1': { h1: 3, f1: 2 } }
		});

		const document = store.document;
		if (document === null) throw new Error('expected a document');
		// The wipe account counts every kept mark, whether or not it is on the
		// student's own paper: a move never loses one.
		expect(storedMarkCount(document)).toBe(2);

		store.setStudentTier('student-1', 1);

		expect(storedMarkCount(document)).toBe(2);

		store.setStudentTier('student-1', null);

		expect(storedMarkCount(document)).toBe(2);
	});

	it('refuses a tier the assessment does not have, leaving the undo on offer alone', () => {
		const { store } = openTwoTierMarksheet({
			tiers: [tierWith([entry('entry-1', '1a', '1')])],
			students: [
				student('student-1', 'Ada', 'Lovelace', false, 0),
				student('student-2', 'Grace', 'Hopper', false, 0)
			]
		});
		store.removeStudent('student-2');

		store.setStudentTier('student-1', 1);

		expect(studentOf(store, 'student-1')?.tier).toBe(0);
		// A refused move changed nothing, so the removal is still there to take back.
		expect(store.undoable).toMatchObject({ kind: 'student-removal' });
		expect(store.undo()).toBe(true);
		expect(store.document?.students.map(({ id }) => id)).toEqual(['student-1', 'student-2']);
	});

	it('refuses to clear the tier on a single-tier assessment, leaving the undo alone', () => {
		const { store } = openStore({
			breakdownConfirmedAt: NOW.toISOString(),
			students: [
				student('student-1', 'Ada', 'Lovelace', false, 0),
				student('student-2', 'Grace', 'Hopper', false, 0)
			]
		});
		store.removeStudent('student-2');

		store.setStudentTier('student-1', null);

		expect(studentOf(store, 'student-1')?.tier).toBe(0);
		expect(store.undoable).toMatchObject({ kind: 'student-removal' });
		expect(store.undo()).toBe(true);
		expect(store.document?.students).toHaveLength(2);
	});

	it('spends no undo when the tier is the one already set', () => {
		const { store } = openTwoTierMarksheet({
			students: [
				student('student-1', 'Ada', 'Lovelace', false, 0),
				student('student-2', 'Grace', 'Hopper', false, 0)
			]
		});
		store.removeStudent('student-2');

		store.setStudentTier('student-1', 0);

		expect(store.undoable).toMatchObject({ kind: 'student-removal' });
		expect(store.undo()).toBe(true);
		expect(store.document?.students).toHaveLength(2);
	});

	it('ignores a student who is not there, leaving the undo alone', () => {
		const { store } = openTwoTierMarksheet({
			students: [
				student('student-1', 'Ada', 'Lovelace', false, 0),
				student('student-2', 'Grace', 'Hopper', false, 0)
			]
		});
		store.removeStudent('student-2');

		store.setStudentTier('student-gone', 1);

		expect(store.undoable).toMatchObject({ kind: 'student-removal' });
		expect(store.undo()).toBe(true);
		expect(store.document?.students).toHaveLength(2);
	});

	it('moves several students as one undoable change', () => {
		const { store } = openTwoTierMarksheet({
			students: [
				student('student-1', 'Ada', 'Lovelace', false, null),
				student('student-2', 'Grace', 'Hopper', false, null),
				student('student-3', 'Cher', '', false, null)
			]
		});

		expect(store.setStudentsTier(['student-1', 'student-2'], 1)).toBe(true);

		expect(store.studentsOf(1).map((candidate) => candidate.id)).toEqual([
			'student-1',
			'student-2'
		]);
		expect(store.undoable).toMatchObject({ kind: 'student-tier' });

		expect(store.undo()).toBe(true);
		expect(store.studentsWithoutTier().map((candidate) => candidate.id)).toEqual([
			'student-1',
			'student-2',
			'student-3'
		]);
	});

	it('splits the class into each tier and the students with none', () => {
		const { store } = openTwoTierMarksheet({
			students: [
				student('student-1', 'Ada', 'Lovelace', false, 0),
				student('student-2', 'Grace', 'Hopper', false, 1),
				student('student-3', 'Cher', '', false, null)
			]
		});

		expect(store.studentsOf(0).map(({ id }) => id)).toEqual(['student-1']);
		expect(store.studentsOf(1).map(({ id }) => id)).toEqual(['student-2']);
		expect(store.studentsWithoutTier().map(({ id }) => id)).toEqual(['student-3']);
	});

	it('analyses only the students on that tier', () => {
		const { store } = openTwoTierMarksheet({
			students: [
				student('student-1', 'Ada', 'Lovelace', false, 0),
				student('student-2', 'Grace', 'Hopper', false, 1)
			],
			marks: { 'student-1': { h1: 4 }, 'student-2': { f1: 2 } }
		});

		const tierZero = store.analysisOf(0);
		expect(tierZero.summary.studentsCounted).toBe(1);
		expect(tierZero.entries.find((row) => row.entry.id === 'h1')?.facility).toBe(1);
		expect(tierZero.entries.find((row) => row.entry.id === 'h2')?.coverage).toMatchObject({
			marked: 0,
			of: 1
		});

		const tierOne = store.analysisOf(1);
		expect(tierOne.summary.studentsCounted).toBe(1);
		expect(tierOne.entries.find((row) => row.entry.id === 'f1')?.facility).toBe(0.5);
		expect(tierOne.entries.find((row) => row.entry.id === 'f2')?.coverage).toMatchObject({
			marked: 0,
			of: 1
		});
	});
});

describe('common questions', () => {
	/** Unconfirmed two-tier assessment: pairs are reviewed and confirmed with the breakdowns. */
	function openPairs(overrides: Partial<MarksheetDocument> = {}) {
		return openStore({ ...twoTierBreakdown(), ...overrides });
	}

	it('pairs two entries from either side, in one undoable change', () => {
		const { store } = openPairs();

		store.setCommonQuestion(0, 'h1', 'f1');

		expect(store.pairOf(0, 'h1')).toEqual({ tier1EntryId: 'h1', tier2EntryId: 'f1' });
		expect(store.partnerOf(1, 'f1')).toBe('h1');
		expect(store.undoable).toMatchObject({ kind: 'common-question' });

		expect(store.undo()).toBe(true);
		expect(store.commonQuestions).toEqual([]);
	});

	it('pairs from the second tier with the same one fact', () => {
		const { store } = openPairs();

		store.setCommonQuestion(1, 'f1', 'h1');

		expect(store.commonQuestions).toEqual([{ tier1EntryId: 'h1', tier2EntryId: 'f1' }]);
	});

	it('changes a partner, dropping the pair it replaces', () => {
		const { store } = openPairs();
		store.setCommonQuestion(0, 'h1', 'f1');

		store.setCommonQuestion(0, 'h1', 'f2');

		expect(store.commonQuestions).toEqual([{ tier1EntryId: 'h1', tier2EntryId: 'f2' }]);
		expect(store.pairOf(0, 'h1')?.tier2EntryId).toBe('f2');
		expect(store.partnerOf(1, 'f1')).toBeNull();
	});

	it('clears a pair without touching any mark', () => {
		const { store } = openPairs({
			students: [student('student-1', 'Ada', 'Lovelace', false, null)],
			marks: { 'student-1': { h1: 3, f1: 2 } }
		});
		store.setCommonQuestion(0, 'h1', 'f1');

		store.setCommonQuestion(0, 'h1', null);

		expect(store.commonQuestions).toEqual([]);
		expect(store.document?.marks).toEqual({ 'student-1': { h1: 3, f1: 2 } });
	});

	it('refuses a partner on the same tier', () => {
		const { store } = openPairs();

		store.setCommonQuestion(0, 'h1', 'h2');

		expect(store.commonQuestions).toEqual([]);
	});

	it('refuses a partner whose marks are unknown or unequal', () => {
		const { store } = openPairs({
			tiers: [
				tierWith([entry('h1', '1a', '1'), entry('h2', '1b', '1')], 'Higher'),
				tierWith(
					[entry('f1', '1a', '1', { marks: 3 }), entry('f2', '1b', '1', { marks: null })],
					'Foundation'
				)
			]
		});

		store.setCommonQuestion(0, 'h1', 'f1');
		store.setCommonQuestion(0, 'h1', 'f2');

		expect(store.commonQuestions).toEqual([]);
	});

	it('refuses a partner already paired with another entry', () => {
		const { store } = openPairs();
		store.setCommonQuestion(0, 'h1', 'f1');
		store.setCommonQuestion(0, 'h2', 'f2');

		store.setCommonQuestion(0, 'h1', 'f2');

		expect(store.commonQuestions).toEqual([
			{ tier1EntryId: 'h1', tier2EntryId: 'f1' },
			{ tier1EntryId: 'h2', tier2EntryId: 'f2' }
		]);
	});

	it('refuses an entry that is not on the tier named, and an unknown partner', () => {
		const { store } = openPairs();

		store.setCommonQuestion(0, 'f1', 'h1');
		store.setCommonQuestion(0, 'h1', 'nope');

		expect(store.commonQuestions).toEqual([]);
	});

	it('is refused once the breakdown is confirmed', () => {
		const { store } = openPairs({ breakdownConfirmedAt: NOW.toISOString() });

		store.setCommonQuestion(0, 'h1', 'f1');

		expect(store.commonQuestions).toEqual([]);
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

		store.setMark('student-1', 'entry-1', 0);

		expect(marksFor()).toEqual({ 'entry-1': 0 });
		// Zero is a mark the student gained: it is stored, not left out.
		expect(store.document?.marks).toEqual({ 'student-1': { 'entry-1': 0 } });

		store.clearMark('student-1', 'entry-1');

		// Cleared is no entry at all, so nothing says the cell was ever marked.
		expect(store.document?.marks).toEqual({});
		expect(marksFor()).toBeUndefined();
	});

	it('stores a mark above the entry’s available marks, never clamping it', () => {
		const { store } = openMarksheet();

		store.setMark('student-1', 'entry-1', 40);

		expect(store.document?.marks).toEqual({ 'student-1': { 'entry-1': 40 } });
		// What the entry offers is the teacher's: the mark does not change it back.
		expect(entryOf(store, 'entry-1')?.marks).toBe(4);
	});

	it('accepts a mark on either tier’s entry, even off the student’s own tier', () => {
		const { store } = openStore({
			...twoTierBreakdown(),
			breakdownConfirmedAt: NOW.toISOString(),
			students: [student('student-1', 'Ada', 'Lovelace', false, 0)]
		});

		store.setMark('student-1', 'f1', 2);

		expect(store.document?.marks).toEqual({ 'student-1': { f1: 2 } });
	});

	it('refuses a mark that is not a whole number', () => {
		const { store } = openMarksheet({ marks: { 'student-1': { 'entry-1': 2 } } });

		for (const refused of [2.5, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(store.setMark('student-1', 'entry-1', refused)).toBe(MARK_REFUSAL);
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
			tiers: [tierWith([entry('entry-1', '1a', '1'), entry('entry-2', '1b', '1')])],
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
				{ kind: 'names', studentId: 'student-1' },
				0
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

	it('keeps the account of the last paste until the next change', () => {
		const { store } = openPasteSheet();

		const refused = store.pasteMarks(
			[['2.5']],
			{ kind: 'marks', studentId: 'student-1', entryId: 'entry-1' },
			0
		);

		// Nothing changed, so there is no undo — but the teacher still has to be
		// told why the cell they pasted into is as they left it.
		expect(store.undoable).toBeNull();
		expect(store.pasteNotice).toEqual(refused);

		store.setMark('student-1', 'entry-1', 2);

		expect(store.pasteNotice).toBeNull();
	});

	it('leaves no notice for a paste that put down exactly what was there', () => {
		const { store } = openPasteSheet({ marks: { 'student-1': { 'entry-1': 3 } } });

		const result = store.pasteMarks(
			[['3']],
			{ kind: 'marks', studentId: 'student-1', entryId: 'entry-1' },
			0
		);

		expect(result.changed).toBe(false);
		expect(store.pasteNotice).toBeNull();
	});

	it('pastes marks against the entries and students of the tier named', () => {
		const { store } = openStore({
			...twoTierBreakdown(),
			breakdownConfirmedAt: NOW.toISOString(),
			students: [
				student('student-1', 'Ada', 'Lovelace', false, 0),
				student('student-2', 'Grace', 'Hopper', false, 1)
			]
		});

		const pasted = store.pasteMarks(
			[['2', '3']],
			{ kind: 'marks', studentId: 'student-2', entryId: 'f1' },
			1
		);

		// Grace is on Tier 2, so the block lands on f1 and f2 there.
		expect(pasted).toMatchObject({ marksStored: 2 });
		expect(store.document?.marks).toEqual({ 'student-2': { f1: 2, f2: 3 } });

		// The same cell aimed at Tier 1 has no row for Grace and no f1 column.
		const refused = store.pasteMarks(
			[['4']],
			{ kind: 'marks', studentId: 'student-2', entryId: 'f1' },
			0
		);

		expect(refused).toMatchObject({ changed: false });
		expect(store.document?.marks).toEqual({ 'student-2': { f1: 2, f2: 3 } });
	});

	it('does nothing when there is no marksheet, the tier is absent, or the anchor is gone', () => {
		const empty = storeWith(fakeStorage());
		expect(
			empty.pasteMarks([['3']], { kind: 'marks', studentId: 'student-1', entryId: 'entry-1' }, 0)
		).toMatchObject({ changed: false });

		const { store } = openPasteSheet();
		expect(
			store.pasteMarks([['3']], { kind: 'marks', studentId: 'student-1', entryId: 'entry-1' }, 1)
		).toMatchObject({ changed: false });
		expect(
			store.pasteMarks([['3']], { kind: 'marks', studentId: 'student-gone', entryId: 'entry-1' }, 0)
		).toMatchObject({ changed: false });
		expect(
			store.pasteMarks([['3']], { kind: 'marks', studentId: 'student-1', entryId: 'entry-gone' }, 0)
		).toMatchObject({ changed: false });
		expect(store.document?.marks).toEqual({});
	});
});

describe('what is on offer to undo', () => {
	const ada = student('student-1', 'Ada', 'Lovelace');
	const grace = student('student-2', 'Grace', 'Hopper');
	const confirmedClass: Partial<MarksheetDocument> = {
		breakdownConfirmedAt: NOW.toISOString(),
		students: [ada, grace]
	};

	// One thing is on offer at a time, and the next change takes its place: a
	// second click can never take back two things.
	it.each([
		{
			name: 'an entry removal',
			overrides: {
				tiers: [
					tierWith([
						entry('entry-1', '1a', '1'),
						entry('entry-2', '1b', '1'),
						entry('entry-3', '2a', '2')
					])
				]
			},
			offer: (store: MarksheetStore) => store.deleteEntry('entry-2'),
			kind: 'entry-removal',
			change: (store: MarksheetStore) => store.setPaperLabel('10X/Ph1'),
			remaining: (store: MarksheetStore) => store.entriesOf(0).map(({ id }) => id),
			expected: ['entry-1', 'entry-3']
		},
		{
			name: 'a student removal, to a class change',
			overrides: confirmedClass,
			offer: (store: MarksheetStore) => store.removeStudent('student-1'),
			kind: 'student-removal',
			change: (store: MarksheetStore) => store.setStudentAbsent('student-2', true),
			remaining: (store: MarksheetStore) => store.document?.students.map(({ id }) => id),
			expected: ['student-2']
		},
		{
			name: 'a student removal, to a mark',
			overrides: confirmedClass,
			offer: (store: MarksheetStore) => store.removeStudent('student-2'),
			kind: 'student-removal',
			change: (store: MarksheetStore) => store.setMark('student-1', 'entry-1', 3),
			remaining: (store: MarksheetStore) => store.document?.students.map(({ id }) => id),
			expected: ['student-1']
		},
		{
			name: 'a paste',
			overrides: confirmedClass,
			offer: (store: MarksheetStore) =>
				store.pasteMarks([['3']], { kind: 'marks', studentId: 'student-1', entryId: 'entry-1' }, 0),
			kind: 'mark-paste',
			change: (store: MarksheetStore) => store.setMark('student-2', 'entry-1', 1),
			remaining: (store: MarksheetStore) => store.document?.marks,
			expected: { 'student-1': { 'entry-1': 3 }, 'student-2': { 'entry-1': 1 } }
		}
	])('offers $name until the next change, which takes its place', (scenario) => {
		const { store } = openStore(scenario.overrides);

		scenario.offer(store);
		expect(store.undoable).toMatchObject({ kind: scenario.kind });

		scenario.change(store);

		expect(store.undoable).toBeNull();
		expect(store.undo()).toBe(false);
		expect(scenario.remaining(store)).toEqual(scenario.expected);
	});
});

describe('new class', () => {
	/** The assessment a new class leaves alone, with a class on it to discard. */
	function withClass() {
		return openStore({
			...twoTierBreakdown(),
			breakdownConfirmedAt: NOW.toISOString(),
			className: '10C1',
			students: [
				student('student-1', 'Ada', 'Lovelace', false, 0),
				student('student-2', 'Grace', 'Hopper', false, 1)
			],
			marks: { 'student-1': { h1: 3 }, 'student-2': { f1: 2 } },
			reports: {
				'student-1': {
					strengths: ['You explain clearly.'],
					areasForImprovement: [],
					edit: null,
					input: { paperLabel: '10X Ph1', entries: [] },
					model: 'openai/gpt-6-luna',
					generatedAt: NOW.toISOString()
				}
			},
			commonQuestions: [{ tier1EntryId: 'h1', tier2EntryId: 'f1' }],
			topicNames: { '3.2.1.4': 'Rates of reaction' },
			aoDescriptions: { AO2: 'Apply knowledge' }
		});
	}

	it('discards the class and every mark, keeping the assessment', () => {
		const { store, storage } = withClass();
		const tiers = JSON.parse(JSON.stringify(store.tiers));
		const pairs = [...store.commonQuestions];

		expect(store.newClass()).toBe(true);

		expect(store.students).toEqual([]);
		expect(store.className).toBeNull();
		expect(store.document?.marks).toEqual({});
		expect(store.document?.reports).toEqual({});
		// The paper, its pairs, its topic names and skill descriptions stay.
		expect(store.tiers).toEqual(tiers);
		expect(store.commonQuestions).toEqual(pairs);
		expect(store.document?.topicNames).toEqual({ '3.2.1.4': 'Rates of reaction' });
		expect(store.document?.aoDescriptions).toEqual({ AO2: 'Apply knowledge' });
		// The class before comes back only from its backup.
		expect(store.undoable).toBeNull();
		store.flush();
		expect(stored(storage).students).toEqual([]);
	});

	it('does nothing when there is no class to discard', () => {
		const { store } = openStore({ breakdownConfirmedAt: NOW.toISOString() });

		expect(store.newClass()).toBe(false);
		expect(store.document?.className).toBeNull();
	});
});
