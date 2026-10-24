import { describe, expect, it } from 'vitest';
import {
	assessmentBlockers,
	bandName,
	confirmationBlockers,
	entryEdits,
	entryName,
	fallbackBands,
	isUndivided,
	needsAttention,
	questionBands,
	questionCount,
	runWarnings,
	warningsForEntry
} from './breakdown.js';
import type { BreakdownEntry, EntryValues, MarksheetDocument, StoredWarning } from './document.js';
import { confirmed, tier } from './fixtures.spec-helpers.js';

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
		original: null,
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

	it('is not undivided when the entry has no question number yet', () => {
		const [band] = questionBands([entry('a', '', '')]);

		expect(isUndivided(band)).toBe(false);
	});
});

describe('bandName', () => {
	it('names a band by its question number', () => {
		const [band] = questionBands([entry('a', '2bii', '2')]);

		expect(bandName(band)).toBe('2');
	});

	it('stands in for a band whose question number is not there yet', () => {
		const [band] = questionBands([entry('a', '', '')]);

		expect(bandName(band)).toBe('(none)');
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

describe('assessmentBlockers', () => {
	/** Two tiers named apart, each with one entry, and the pair that joins them. */
	function twoTier(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
		return confirmed({
			tiers: [
				tier({ tierName: 'Higher' }),
				tier({
					tierName: 'Foundation',
					breakdown: { entries: [entry('entry-2', '2bii', '2')], warnings: [] }
				})
			],
			commonQuestions: [{ tier1EntryId: 'entry-1', tier2EntryId: 'entry-2' }],
			...overrides
		});
	}

	it('reports each tier’s own blockers and blocks the assessment when one has any', () => {
		const document = twoTier({
			tiers: [
				tier({ tierName: 'Higher' }),
				tier({
					tierName: 'Foundation',
					breakdown: {
						entries: [entry('entry-2', '2bii', '2', { marks: null })],
						warnings: []
					}
				})
			]
		});

		const blockers = assessmentBlockers(document);

		expect(blockers.tiers.map((one) => one.blocked)).toEqual([false, true]);
		expect(blockers.tiers[1].noAvailableMarks.map((one) => one.id)).toEqual(['entry-2']);
		expect(blockers.blocked).toBe(true);
	});

	it('does not ask a single-tier assessment for a tier name', () => {
		const blockers = assessmentBlockers(confirmed());

		expect(blockers).toEqual({
			blocked: false,
			tiers: [confirmationBlockers([entry('entry-1', '2bii', '2')])],
			blankTierNames: [],
			sameTierNames: false,
			unequalPairs: []
		});
	});

	it('names the tier with no printed name, and blocks', () => {
		const document = twoTier({
			tiers: [
				tier({ tierName: 'Higher' }),
				tier({
					tierName: null,
					breakdown: { entries: [entry('entry-2', '2bii', '2')], warnings: [] }
				})
			]
		});

		const blockers = assessmentBlockers(document);

		expect(blockers.blankTierNames).toEqual([1]);
		expect(blockers.sameTierNames).toBe(false);
		expect(blockers.blocked).toBe(true);
	});

	it('treats a blank name as no name', () => {
		const document = twoTier({
			tiers: [
				tier({ tierName: '   ' }),
				tier({
					tierName: 'Foundation',
					breakdown: { entries: [entry('entry-2', '2bii', '2')], warnings: [] }
				})
			]
		});

		expect(assessmentBlockers(document).blankTierNames).toEqual([0]);
	});

	it('blocks two tiers whose names are the same, ignoring case and surrounding spaces', () => {
		const document = twoTier({
			tiers: [
				tier({ tierName: ' Higher Tier ' }),
				tier({
					tierName: 'higher tier',
					breakdown: { entries: [entry('entry-2', '2bii', '2')], warnings: [] }
				})
			]
		});

		const blockers = assessmentBlockers(document);

		expect(blockers.sameTierNames).toBe(true);
		expect(blockers.blankTierNames).toEqual([]);
		expect(blockers.blocked).toBe(true);
	});

	it('accepts a pair whose marks match', () => {
		expect(assessmentBlockers(twoTier()).unequalPairs).toEqual([]);
		expect(assessmentBlockers(twoTier()).blocked).toBe(false);
	});

	it('names a pair whose available marks were edited apart, and blocks', () => {
		const document = twoTier({
			tiers: [
				tier({ tierName: 'Higher' }),
				tier({
					tierName: 'Foundation',
					breakdown: {
						entries: [entry('entry-2', '2bii', '2', { marks: 5 })],
						warnings: []
					}
				})
			]
		});

		const blockers = assessmentBlockers(document);

		expect(blockers.unequalPairs).toEqual([{ tier1EntryId: 'entry-1', tier2EntryId: 'entry-2' }]);
		expect(blockers.blocked).toBe(true);
	});

	it('names a pair whose available marks are not known yet', () => {
		const document = twoTier({
			tiers: [
				tier({ tierName: 'Higher' }),
				tier({
					tierName: 'Foundation',
					breakdown: {
						entries: [entry('entry-2', '2bii', '2', { marks: null })],
						warnings: []
					}
				})
			]
		});

		expect(assessmentBlockers(document).unequalPairs).toHaveLength(1);
	});

	it('names a pair whose Tier 1 available marks are not known yet', () => {
		const document = twoTier({
			tiers: [
				tier({
					tierName: 'Higher',
					breakdown: {
						entries: [entry('entry-1', '2bii', '2', { marks: null })],
						warnings: []
					}
				}),
				tier({
					tierName: 'Foundation',
					breakdown: { entries: [entry('entry-2', '2bii', '2')], warnings: [] }
				})
			]
		});

		expect(assessmentBlockers(document).unequalPairs).toEqual([
			{ tier1EntryId: 'entry-1', tier2EntryId: 'entry-2' }
		]);
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

describe('fallback bands', () => {
	const warning: StoredWarning = {
		questionId: 'a',
		code: 'MISSING_QUESTION_NUMBER',
		message: "Entry 'a' has no question number; grouping falls back to its own id."
	};

	it('flags a band the parse could not read a question number for', () => {
		const entries = [entry('a', '3b', '3b'), entry('b', '3c', '3b')];

		expect(fallbackBands(questionBands(entries), [warning])).toHaveLength(1);
	});

	it('stops flagging once the question number is corrected', () => {
		const entries = [entry('a', '3b', '3'), entry('b', '3c', '3')];

		expect(fallbackBands(questionBands(entries), [warning])).toEqual([]);
	});

	it('does not flag a band whose number matches its label without the finding', () => {
		const entries = [entry('a', '3', '3')];

		expect(fallbackBands(questionBands(entries), [])).toEqual([]);
	});
});

/** The values `entry()` holds, as an entry that records its parse values. */
function parseValues(overrides: Partial<EntryValues> = {}): EntryValues {
	return {
		label: '1a',
		questionNumber: '1',
		marks: 4,
		summary: 'Explain the process shown',
		specPoint: '3.2.1.4',
		commandWord: 'Explain',
		ao: 'AO1',
		...overrides
	};
}

describe('entryEdits', () => {
	it('reports nothing for an entry the parse produced and nobody touched', () => {
		const untouched = entry('a', '1a', '1', { original: parseValues() });

		expect(entryEdits(untouched)).toEqual({ added: false, fields: [] });
	});

	it('names each field the teacher has changed since the parse', () => {
		const edited = entry('a', '2b', '2', {
			marks: 6,
			specPoint: null,
			original: parseValues()
		});

		expect(entryEdits(edited).fields).toEqual(['label', 'questionNumber', 'marks', 'specPoint']);
	});

	it('reports an entry the teacher added', () => {
		expect(entryEdits(entry('a', '', '', { marks: null, original: null }))).toEqual({
			added: true,
			fields: []
		});
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
