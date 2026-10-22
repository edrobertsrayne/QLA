import { describe, expect, it } from 'vitest';
import {
	formatPercent,
	marksToPercent,
	parsePercent,
	percentIssues,
	percentToMarks
} from './grades.js';

describe('percentToMarks', () => {
	it('rounds up so the student must reach the percentage', () => {
		expect(percentToMarks(65, 83)).toBe(54);
	});
	it('keeps a percentage that lands exactly on a mark', () => {
		expect(percentToMarks(50, 80)).toBe(40);
		expect(percentToMarks(52.5, 80)).toBe(42);
	});
	it('maps the bounds to 0 and the paper total', () => {
		expect(percentToMarks(0, 83)).toBe(0);
		expect(percentToMarks(100, 83)).toBe(83);
	});
	it('round-trips every raw mark through its exact percentage', () => {
		for (const total of [1, 7, 40, 83, 100, 117]) {
			for (let marks = 0; marks <= total; marks++) {
				expect(percentToMarks(marksToPercent(marks, total), total)).toBe(marks);
			}
		}
	});
});

describe('percent entry', () => {
	it('shows a percentage to one decimal place', () => {
		expect(formatPercent(marksToPercent(54, 83))).toBe('65.1');
		expect(formatPercent(marksToPercent(40, 80))).toBe('50');
	});
	it('accepts 0 to 100 with decimals and rejects the rest', () => {
		expect(parsePercent('52.5')).toBe(52.5);
		expect(parsePercent('0')).toBe(0);
		expect(parsePercent('100')).toBe(100);
		for (const bad of ['-1', '101', 'abc', '5%', '.']) expect(parsePercent(bad)).toBeNull();
	});
	it('flags typed percentages that are out of range', () => {
		const rows = [
			{ label: 'A', min: '', percent: '-1' },
			{ label: 'B', min: '', percent: '101' },
			{ label: 'C', min: '', percent: 'abc' },
			{ label: 'D', min: '40', percent: '50' },
			{ label: 'E', min: '', percent: '' },
			{ label: 'F', min: '3' }
		];
		expect(percentIssues(rows).map((issue) => issue.index)).toEqual([0, 1, 2]);
	});
});
