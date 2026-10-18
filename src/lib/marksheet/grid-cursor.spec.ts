import { describe, expect, it } from 'vitest';
import { resolveCell } from './grid-cursor.js';
import type { GridShape } from './grid-cursor.js';

const shape: GridShape = { studentIds: ['s1', 's2'], entryIds: ['e1', 'e2'] };

describe('resolveCell', () => {
	it('keeps a cursor whose row and column still exist', () => {
		expect(resolveCell({ studentId: 's2', entryId: 'e2' }, shape)).toEqual({
			studentId: 's2',
			entryId: 'e2'
		});
		expect(resolveCell({ studentId: 's2', entryId: null }, shape)).toEqual({
			studentId: 's2',
			entryId: null
		});
	});

	it('falls back to the first cell when the cursor student is gone', () => {
		expect(resolveCell({ studentId: 'gone', entryId: 'e2' }, shape)).toEqual({
			studentId: 's1',
			entryId: 'e1'
		});
	});

	it('falls back to the first cell when the cursor entry is gone', () => {
		expect(resolveCell({ studentId: 's2', entryId: 'gone' }, shape)).toEqual({
			studentId: 's1',
			entryId: 'e1'
		});
	});

	it('gives the first cell for no cursor', () => {
		expect(resolveCell(null, shape)).toEqual({ studentId: 's1', entryId: 'e1' });
	});

	it('gives nothing when there are no students', () => {
		expect(resolveCell(null, { studentIds: [], entryIds: ['e1'] })).toBeNull();
		expect(
			resolveCell({ studentId: 's1', entryId: 'e1' }, { studentIds: [], entryIds: [] })
		).toBeNull();
	});

	it("gives the first student's name cell when there are no entries", () => {
		expect(resolveCell(null, { studentIds: ['s1'], entryIds: [] })).toEqual({
			studentId: 's1',
			entryId: null
		});
	});
});
