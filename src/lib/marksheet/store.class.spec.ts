import { describe, expect, it, vi } from 'vitest';
import type { MarksheetDocument } from './document.js';
import { entry, student } from './fixtures.spec-helpers.js';
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

		store.addStudentsFromUpload(names);

		expect(store.document?.students.map(({ firstName }) => firstName)).toEqual([
			'Ada',
			'Grace',
			'Cher'
		]);
		expect(store.pasteNotice).toMatchObject({ studentsAdded: 2, duplicatesSkipped: 2 });

		expect(store.undo()).toBe(true);
		expect(store.document?.students).toEqual([student('student-1', 'Ada', 'Lovelace')]);
	});

	it('still lets paste and add-one repeat a name', () => {
		const { store } = openMarksheet({ students: [student('student-1', 'Ada', 'Lovelace')] });

		store.addStudent({ firstName: 'Ada', surname: 'Lovelace' });
		store.pasteNames('Lovelace, Ada');

		expect(store.document?.students).toHaveLength(3);
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

	it('does not make a student of a pasted line that holds no name', () => {
		const { store } = openMarksheet();

		expect(store.pasteNames('Ada Lovelace\n,\n')).toBe(1);
		expect(store.document?.students).toEqual([
			{ id: expect.any(String), firstName: 'Ada', surname: 'Lovelace', absent: false }
		]);
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
				warnings: [],
				aoDescriptions: {}
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
				breakdown: {
					entries: [
						entry('entry-1', '1a', '1'),
						entry('entry-2', '1b', '1'),
						entry('entry-3', '2a', '2')
					],
					warnings: [],
					aoDescriptions: {}
				}
			},
			offer: (store: MarksheetStore) => store.deleteEntry('entry-2'),
			kind: 'entry-removal',
			change: (store: MarksheetStore) => store.setPaperLabel('10X/Ph1'),
			remaining: (store: MarksheetStore) => store.document?.breakdown.entries.map(({ id }) => id),
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
				store.pasteMarks([['3']], { kind: 'marks', studentId: 'student-1', entryId: 'entry-1' }),
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
