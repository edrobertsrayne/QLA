import { describe, expect, it } from 'vitest';
import { newNames } from './students.js';
import { readStudentCsv } from './students-csv.js';

const ada = { firstName: 'Ada', surname: 'Lovelace' };
const grace = { firstName: 'Grace', surname: 'Hopper' };

describe('readStudentCsv: how the text is split', () => {
	it('reads quoted cells holding commas, doubled quotes and line breaks', () => {
		expect(readStudentCsv('"a,b","line\nbreak"\n"O""Brien",Liam', false)).toEqual({
			ok: true,
			names: [
				{ firstName: 'a,b', surname: 'line\nbreak' },
				{ firstName: 'O"Brien', surname: 'Liam' }
			]
		});
	});

	it('reads CRLF and LF alike, with or without a final line ending', () => {
		expect(readStudentCsv('a,b\nc,d', false)).toEqual(readStudentCsv('a,b\r\nc,d\r\n', false));
	});

	it('drops a leading byte order mark and trims cells', () => {
		expect(readStudentCsv('\uFEFF  Ada , Lovelace ', false)).toEqual({ ok: true, names: [ada] });
	});

	it('refuses an unclosed quote, whatever rows come before it', () => {
		expect(readStudentCsv('Ada,Lovelace\n"Grace,Hopper', false)).toEqual({
			ok: false,
			error: 'A quoted cell is never closed, so the file cannot be read.'
		});
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
