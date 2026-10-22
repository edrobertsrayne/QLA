import { describe, expect, it } from 'vitest';
import { newNames } from './students.js';
import { parseCsv, readStudentCsv } from './students-csv.js';

const ada = { firstName: 'Ada', surname: 'Lovelace' };
const grace = { firstName: 'Grace', surname: 'Hopper' };

describe('parseCsv', () => {
	it('reads quoted cells holding commas, doubled quotes and line breaks', () => {
		expect(parseCsv('"Mary Ann",Evans\n"O""Brien",Liam\n"a,b","line\nbreak"')).toEqual([
			['Mary Ann', 'Evans'],
			['O"Brien', 'Liam'],
			['a,b', 'line\nbreak']
		]);
	});

	it('reads CRLF and LF alike, with or without a final line ending', () => {
		expect(parseCsv('a,b\r\nc,d\r\n')).toEqual([
			['a', 'b'],
			['c', 'd']
		]);
		expect(parseCsv('a,b\nc,d')).toEqual(parseCsv('a,b\r\nc,d\r\n'));
	});

	it('drops a leading byte order mark and trims cells', () => {
		expect(parseCsv('\uFEFF  Ada , Lovelace ')).toEqual([['Ada', 'Lovelace']]);
	});

	it('keeps blank lines as records so row numbers match the file', () => {
		expect(parseCsv('a,b\n\nc,d')).toEqual([['a', 'b'], [''], ['c', 'd']]);
	});

	it('is null when a quote never closes', () => {
		expect(parseCsv('"Ada,Lovelace')).toBeNull();
	});
});

describe('readStudentCsv', () => {
	const csv = 'First name,Last name\nAda,Lovelace\nGrace,Hopper';

	it('skips row 1 when the header box is ticked', () => {
		expect(readStudentCsv(csv, true)).toEqual({ ok: true, names: [ada, grace] });
	});

	it('reads row 1 as a student when it is not, with no guessing', () => {
		expect(readStudentCsv(csv, false)).toEqual({
			ok: true,
			names: [{ firstName: 'First name', surname: 'Last name' }, ada, grace]
		});
	});

	it('reads quoting, CRLF and a BOM together', () => {
		expect(
			readStudentCsv('\uFEFFfirst,last\r\n"Mary Ann",Evans\r\n"O""Brien",Liam\r\n', true)
		).toEqual({
			ok: true,
			names: [
				{ firstName: 'Mary Ann', surname: 'Evans' },
				{ firstName: 'O"Brien', surname: 'Liam' }
			]
		});
	});

	it('ignores blank rows, including rows of only empty cells', () => {
		expect(readStudentCsv('h,h\n\nAda,Lovelace\n , \n', true)).toEqual({ ok: true, names: [ada] });
	});

	it('accepts a row with one of its two cells empty', () => {
		expect(readStudentCsv('Cher,\n,Madonna', false)).toEqual({
			ok: true,
			names: [
				{ firstName: 'Cher', surname: '' },
				{ firstName: '', surname: 'Madonna' }
			]
		});
	});

	it('rejects the whole file naming the first row with three columns', () => {
		expect(readStudentCsv('h,h\nAda,Lovelace\n\nGrace,Brewster,Hopper\nA,B,C', true)).toEqual({
			ok: false,
			error: 'Row 4 has 3 columns; expected first name, last name.'
		});
	});

	it('rejects a row with one column', () => {
		expect(readStudentCsv('Ada,Lovelace\nGrace', false)).toEqual({
			ok: false,
			error: 'Row 2 has 1 column; expected first name, last name.'
		});
	});

	it('does not check the header row for its shape', () => {
		expect(readStudentCsv('Names\nAda,Lovelace', true)).toEqual({ ok: true, names: [ada] });
	});

	it.each([
		['', 'The file is empty.'],
		['\uFEFF', 'The file is empty.'],
		['  \n\n', 'The file is empty.']
	])('refuses %j as empty', (text, error) => {
		expect(readStudentCsv(text, true)).toEqual({ ok: false, error });
	});

	it('refuses a file with no names after the header', () => {
		expect(readStudentCsv('First,Last\n\n,\n', true)).toEqual({
			ok: false,
			error: 'The file has no names after the header.'
		});
	});

	it('refuses an unclosed quote', () => {
		expect(readStudentCsv('"Ada,Lovelace', false).ok).toBe(false);
	});
});

describe('newNames', () => {
	it('skips names the class has, trimmed and ignoring case', () => {
		expect(newNames([ada], [{ firstName: ' ada ', surname: 'LOVELACE' }, grace])).toEqual({
			added: [grace],
			skipped: 1
		});
	});

	it('counts a name repeated within the upload once', () => {
		expect(newNames([], [ada, grace, { firstName: 'ADA', surname: 'lovelace' }])).toEqual({
			added: [ada, grace],
			skipped: 1
		});
	});

	it('keeps students who share only one name part', () => {
		expect(newNames([ada], [{ firstName: 'Ada', surname: 'Byron' }]).skipped).toBe(0);
	});
});
