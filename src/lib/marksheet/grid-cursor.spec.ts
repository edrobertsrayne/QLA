import { describe, expect, it } from 'vitest';
import { resolveCell, step } from './grid-cursor.js';
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

describe('step', () => {
	const cell = (studentId: string, entryId: string | null) => ({ studentId, entryId });

	it('clamps up and down at the ends of the sheet', () => {
		expect(step(cell('s1', 'e1'), shape, 'up')).toEqual(cell('s1', 'e1'));
		expect(step(cell('s2', 'e1'), shape, 'down')).toEqual(cell('s2', 'e1'));
		expect(step(cell('s1', 'e2'), shape, 'down')).toEqual(cell('s2', 'e2'));
	});

	it('goes left from the first entry to the name cell, and right from it to the first entry', () => {
		expect(step(cell('s1', 'e1'), shape, 'left')).toEqual(cell('s1', null));
		expect(step(cell('s1', null), shape, 'left')).toEqual(cell('s1', null));
		expect(step(cell('s1', null), shape, 'right')).toEqual(cell('s1', 'e1'));
		expect(step(cell('s1', 'e2'), shape, 'right')).toEqual(cell('s1', 'e2'));
	});

	it('wraps next from the last entry to the next row’s first entry', () => {
		expect(step(cell('s1', 'e2'), shape, 'next')).toEqual(cell('s2', 'e1'));
		expect(step(cell('s1', 'e1'), shape, 'next')).toEqual(cell('s1', 'e2'));
	});

	it('wraps previous from the first entry to the previous row’s last entry', () => {
		expect(step(cell('s2', 'e1'), shape, 'previous')).toEqual(cell('s1', 'e2'));
	});

	it('stays put when next or previous has nowhere to go', () => {
		expect(step(cell('s2', 'e2'), shape, 'next')).toEqual(cell('s2', 'e2'));
		expect(step(cell('s1', 'e1'), shape, 'previous')).toEqual(cell('s1', 'e1'));
	});
});
