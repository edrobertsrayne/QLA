import { describe, expect, it } from 'vitest';
import { entry, student } from './fixtures.spec-helpers.js';
import { newStudent, progressOf, readName, sortStudentsByName, splitName } from './students.js';

describe('splitName', () => {
	it('reads a comma as Surname, First name', () => {
		expect(splitName('Lovelace, Ada')).toEqual({ firstName: 'Ada', surname: 'Lovelace' });
	});

	it('takes the last word as the surname and keeps the rest together', () => {
		expect(splitName('Grace Brewster Hopper')).toEqual({
			firstName: 'Grace Brewster',
			surname: 'Hopper'
		});
	});

	it('reads a single word as a first name', () => {
		expect(splitName('Cher')).toEqual({ firstName: 'Cher', surname: '' });
	});
});

describe('readName', () => {
	it('reads a name the way splitName does', () => {
		expect(readName(' Hopper, Grace ')).toEqual({ firstName: 'Grace', surname: 'Hopper' });
	});

	it.each(['', '   ', ',', ' , '])('reads %j as nobody', (text) => {
		expect(readName(text)).toBeNull();
	});
});

describe('sortStudentsByName', () => {
	const class10 = [
		student('student-1', 'Grace', 'Hopper'),
		student('student-2', 'Ada', 'Lovelace'),
		student('student-3', 'Cher', '')
	];

	it('puts the class in order by either name part, the students themselves untouched', () => {
		expect(sortStudentsByName(class10, 'surname').map(({ surname }) => surname)).toEqual([
			'',
			'Hopper',
			'Lovelace'
		]);
		expect(sortStudentsByName(class10, 'firstName').map(({ id }) => id)).toEqual([
			'student-2',
			'student-3',
			'student-1'
		]);
	});

	it('does not reorder the list it is given', () => {
		sortStudentsByName(class10, 'firstName');

		expect(class10.map(({ id }) => id)).toEqual(['student-1', 'student-2', 'student-3']);
	});

	it('keeps names of a feather in the order they were in', () => {
		const twins = [student('student-1', 'Ada', 'Byron'), student('student-2', 'ada', 'Lovelace')];

		expect(sortStudentsByName(twins, 'firstName').map(({ id }) => id)).toEqual([
			'student-1',
			'student-2'
		]);
	});
});

describe('newStudent', () => {
	it('makes a present, unmarked student on the tier they sit', () => {
		expect(newStudent({ firstName: 'Ada', surname: 'Lovelace' }, 1)).toMatchObject({
			firstName: 'Ada',
			surname: 'Lovelace',
			absent: false,
			tier: 1
		});
	});
});

describe('progressOf', () => {
	const entries = [entry('entry-1', '1a', '1')];

	it('keeps a mark of zero apart from a cell nobody has marked', () => {
		// Zero is a mark the student gained: their row counts it as filled in.
		expect(progressOf({ 'entry-1': 0 }, entries)).toEqual({ marked: 1, total: 1 });
		expect(progressOf({}, entries)).toEqual({ marked: 0, total: 1 });
		expect(progressOf(undefined, entries)).toEqual({ marked: 0, total: 1 });
	});
});
