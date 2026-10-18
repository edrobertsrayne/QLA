import { describe, expect, it } from 'vitest';
import {
	confirmationBlockers,
	entryName,
	isUndivided,
	needsAttention,
	questionBands,
	questionCount,
	runWarnings,
	warningsForEntry
} from './breakdown.js';
import type { BreakdownEntry, StoredWarning } from './document.js';

function entry(
	id: string,
	label: string,
	questionNumber: string,
	overrides: Partial<BreakdownEntry> = {}
): BreakdownEntry {
	return {
		id,
		label,
		questionNumber,
		marks: 4,
		summary: 'Explain the process shown',
		specPoint: '3.2.1.4',
		commandWord: 'Explain',
		ao: 'AO1',
		...overrides
	};
}

describe('questionBands', () => {
	it('runs contiguous entries of one question number together', () => {
		const entries = [
			entry('a', '1a', '1'),
			entry('b', '1b', '1'),
			entry('c', '1c', '1'),
			entry('d', '2a', '2')
		];

		const bands = questionBands(entries);

		expect(bands.map((band) => band.questionNumber)).toEqual(['1', '2']);
		expect(bands.map((band) => band.entries.map((one) => one.label))).toEqual([
			['1a', '1b', '1c'],
			['2a']
		]);
	});

	it('gives a question number that comes back later a band of its own', () => {
		const bands = questionBands([
			entry('a', '1a', '1'),
			entry('b', '2a', '2'),
			entry('c', '1b', '1')
		]);

		expect(bands.map((band) => band.questionNumber)).toEqual(['1', '2', '1']);
	});

	it('bands on the trimmed question number, so stray spaces do not split a question', () => {
		const bands = questionBands([entry('a', '1a', '1'), entry('b', '1b', ' 1 ')]);

		expect(bands.map((band) => band.questionNumber)).toEqual(['1']);
		expect(bands[0].entries).toHaveLength(2);
	});

	it('has no bands for a breakdown with no entries', () => {
		expect(questionBands([])).toEqual([]);
	});
});

describe('isUndivided', () => {
	it('is an undivided question when one entry is labelled with its own number', () => {
		const [band] = questionBands([entry('a', '3', '3')]);

		expect(isUndivided(band)).toBe(true);
	});

	it('is not undivided when one entry is a subquestion of the question it bands under', () => {
		const [band] = questionBands([entry('a', '2bii', '2')]);

		expect(isUndivided(band)).toBe(false);
	});

	it('is not undivided when a question carries subquestions', () => {
		const [band] = questionBands([entry('a', '1a', '1'), entry('b', '1b', '1')]);

		expect(isUndivided(band)).toBe(false);
	});
});

describe('questionCount', () => {
	it('counts the distinct questions, not the runs they form', () => {
		const entries = [
			entry('a', '1a', '1'),
			entry('b', '2a', '2'),
			entry('c', '1b', '1'),
			entry('d', '2b', '2')
		];

		expect(questionCount(entries)).toBe(2);
	});

	it('ignores the spaces around a question number', () => {
		expect(questionCount([entry('a', '1a', '1'), entry('b', '1b', ' 1 ')])).toBe(1);
	});

	it('does not count an entry whose question number has been cleared', () => {
		expect(questionCount([entry('a', '1a', '1'), entry('b', '2a', '  ')])).toBe(1);
	});

	it('is zero for a breakdown with no entries', () => {
		expect(questionCount([])).toBe(0);
	});
});

describe('confirmationBlockers', () => {
	it('blocks nothing when every entry has available marks and a unique label', () => {
		const blockers = confirmationBlockers([entry('a', '1a', '1'), entry('b', '2bii', '2')]);

		expect(blockers).toEqual({
			blocked: false,
			noAvailableMarks: [],
			emptyLabels: [],
			duplicateLabels: []
		});
	});

	it('blocks entries whose available marks are unknown', () => {
		const blockers = confirmationBlockers([
			entry('a', '1a', '1', { marks: null }),
			entry('b', '2a', '2')
		]);

		expect(blockers.blocked).toBe(true);
		expect(blockers.noAvailableMarks.map((one) => one.label)).toEqual(['1a']);
	});

	it('blocks a label that is empty or only spaces', () => {
		const blockers = confirmationBlockers([entry('a', '', '1'), entry('b', '   ', '2')]);

		expect(blockers.emptyLabels.map((one) => one.id)).toEqual(['a', 'b']);
		expect(blockers.blocked).toBe(true);
	});

	it('blocks every entry carrying a repeated label, ignoring surrounding spaces', () => {
		const blockers = confirmationBlockers([
			entry('a', '2bii', '2'),
			entry('b', ' 2bii ', '2'),
			entry('c', '2a', '2')
		]);

		expect(blockers.duplicateLabels.map((one) => one.id)).toEqual(['a', 'b']);
		expect(blockers.blocked).toBe(true);
	});

	it('treats empty labels as missing rather than as duplicates of each other', () => {
		const blockers = confirmationBlockers([entry('a', '', '1'), entry('b', ' ', '1')]);

		expect(blockers.duplicateLabels).toEqual([]);
	});
});

describe('needsAttention', () => {
	it('lists entries with unknown marks, a parse warning or a label problem, in document order', () => {
		const warnings: StoredWarning[] = [
			{ questionId: 'b', code: 'SUMMARY_LENGTH', message: 'Summary is 2 words.' },
			{ questionId: null, code: 'SPEC_UNREADABLE', message: 'Specification could not be read.' }
		];

		const items = needsAttention({
			entries: [
				entry('a', '1a', '1', { marks: null }),
				entry('b', '1b', '1'),
				entry('c', '2a', '2'),
				entry('d', '2a', '2')
			],
			warnings
		});

		expect(items.map((item) => item.entry.id)).toEqual(['a', 'b', 'c', 'd']);
		expect(items[0].reasons).toEqual(['no-available-marks']);
		expect(items[1].reasons).toEqual([]);
		expect(items[1].warnings.map((warning) => warning.code)).toEqual(['SUMMARY_LENGTH']);
		expect(items[2].reasons).toEqual(['duplicate-label']);
	});

	it('leaves out an entry the parse was happy with', () => {
		expect(needsAttention({ entries: [entry('a', '1a', '1')], warnings: [] })).toEqual([]);
	});
});

describe('warnings', () => {
	const warnings: StoredWarning[] = [
		{ questionId: 'a', code: 'SUMMARY_LENGTH', message: 'Summary is 2 words.' },
		{ questionId: null, code: 'SPEC_UNREADABLE', message: 'Specification could not be read.' }
	];

	it('keeps a finding beside the table when it is not about one entry', () => {
		expect(runWarnings(warnings).map((warning) => warning.code)).toEqual(['SPEC_UNREADABLE']);
	});

	it('picks out the findings that belong to one entry', () => {
		expect(warningsForEntry(warnings, 'a').map((warning) => warning.code)).toEqual([
			'SUMMARY_LENGTH'
		]);
		expect(warningsForEntry(warnings, 'b')).toEqual([]);
	});
});

describe('entryName', () => {
	it('names an entry by its label, trimmed', () => {
		expect(entryName(entry('a', ' 2bii ', '2'))).toBe('2bii');
	});

	it('stands in for a label the teacher has not given yet', () => {
		expect(entryName(entry('a', '', '2'))).toBe('(no label)');
		expect(entryName(entry('b', '   ', '2'))).toBe('(no label)');
	});
});
