import { describe, expect, it } from 'vitest';
import {
	assessmentBlockers,
	bandName,
	confirmationBlockers,
	confirmationMessages,
	entryEdits,
	entryName,
	fallbackBands,
	isUndivided,
	needsAttention,
	noPairsNotice,
	pairedMarks,
	questionBands,
	questionCount,
	runWarnings,
	tierHasBlocker,
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

	it('reports two blank names as blank, not as the same name', () => {
		const document = twoTier({
			tiers: [
				tier({ tierName: null }),
				tier({
					tierName: '   ',
					breakdown: { entries: [entry('entry-2', '2bii', '2')], warnings: [] }
				})
			]
		});

		const blockers = assessmentBlockers(document);

		expect(blockers.blankTierNames).toEqual([0, 1]);
		expect(blockers.sameTierNames).toBe(false);
		expect(blockers.blocked).toBe(true);
	});
});

describe('confirmationMessages', () => {
	/** Two tiers named apart, each with one complete entry and no pairs. */
	function twoTiers(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
		return confirmed({
			tiers: [
				tier({ tierName: 'Higher' }),
				tier({
					tierName: 'Foundation',
					sourceFilenames: ['10X Ph1 F.pdf'],
					breakdown: { entries: [entry('entry-2', '8a', '8')], warnings: [] }
				})
			],
			...overrides
		});
	}

	function messages(document: MarksheetDocument): string[] {
		return confirmationMessages(document, assessmentBlockers(document));
	}

	it('says nothing when nothing is blocked', () => {
		expect(messages(confirmed())).toEqual([]);
		expect(messages(twoTiers())).toEqual([]);
	});

	it('names the entries whose available marks are not known, without a tier prefix on one tier', () => {
		const document = confirmed({
			tiers: [
				tier({
					breakdown: {
						entries: [entry('entry-1', '1a', '1', { marks: null })],
						warnings: []
					}
				})
			]
		});

		expect(messages(document)).toEqual([
			'Available marks are not yet known for 1a — every column needs them before the marksheet can be built.'
		]);
	});

	it('names the tier of a missing-marks entry on two tiers', () => {
		const document = twoTiers({
			tiers: [
				tier({
					tierName: 'Higher',
					breakdown: {
						entries: [entry('entry-1', '1a', '1', { marks: null })],
						warnings: []
					}
				}),
				tier({
					tierName: 'Foundation',
					sourceFilenames: ['10X Ph1 F.pdf'],
					breakdown: { entries: [entry('entry-2', '8a', '8')], warnings: [] }
				})
			]
		});

		expect(messages(document)).toEqual([
			'Tier 1: available marks are not yet known for 1a — every column needs them before the marksheet can be built.'
		]);
	});

	it('counts one entry with no label, and several', () => {
		const one = confirmed({
			tiers: [tier({ breakdown: { entries: [entry('entry-1', '', '1')], warnings: [] } })]
		});
		const many = confirmed({
			tiers: [
				tier({
					breakdown: {
						entries: [entry('entry-1', '', '1'), entry('entry-2', '  ', '2')],
						warnings: []
					}
				})
			]
		});

		expect(messages(one)).toEqual(['1 entry has no label, so its column would have no heading.']);
		expect(messages(many)).toEqual([
			'2 entries have no label, so their columns would have no headings.'
		]);
	});

	it('names each repeated label once', () => {
		const document = confirmed({
			tiers: [
				tier({
					breakdown: {
						entries: [
							entry('entry-1', '2a', '1'),
							entry('entry-2', ' 2a ', '2'),
							entry('entry-3', '2b', '3'),
							entry('entry-4', '2b', '4')
						],
						warnings: []
					}
				})
			]
		});

		expect(messages(document)).toEqual([
			'2a, 2b are each used more than once — every column needs its own label.'
		]);
	});

	it('names a blank tier, and both when both are blank', () => {
		const oneBlank = twoTiers({
			tiers: [
				tier({ tierName: null }),
				tier({
					tierName: 'Foundation',
					sourceFilenames: ['10X Ph1 F.pdf'],
					breakdown: { entries: [entry('entry-2', '8a', '8')], warnings: [] }
				})
			]
		});
		const bothBlank = twoTiers({
			tiers: [
				tier({ tierName: null }),
				tier({
					tierName: '   ',
					sourceFilenames: ['10X Ph1 F.pdf'],
					breakdown: { entries: [entry('entry-2', '8a', '8')], warnings: [] }
				})
			]
		});

		expect(messages(oneBlank)).toEqual(['Tier 1 needs a tier name.']);
		expect(messages(bothBlank)).toEqual(['Tier 1 needs a tier name.', 'Tier 2 needs a tier name.']);
	});

	it('asks two tiers sharing a name for different ones', () => {
		const document = twoTiers({
			tiers: [
				tier({ tierName: 'Higher' }),
				tier({
					tierName: '  higher ',
					sourceFilenames: ['10X Ph1 F.pdf'],
					breakdown: { entries: [entry('entry-2', '8a', '8')], warnings: [] }
				})
			]
		});

		expect(messages(document)).toEqual(['The two tiers need different names.']);
	});

	it('names a pair whose available marks differ, and skips a pair with a missing entry', () => {
		const unequal = twoTiers({
			tiers: [
				tier({
					tierName: 'Higher',
					breakdown: {
						entries: [entry('entry-1', '1a', '1', { marks: 5 })],
						warnings: []
					}
				}),
				tier({
					tierName: 'Foundation',
					sourceFilenames: ['10X Ph1 F.pdf'],
					breakdown: { entries: [entry('entry-2', '8a', '8', { marks: 6 })], warnings: [] }
				})
			],
			commonQuestions: [{ tier1EntryId: 'entry-1', tier2EntryId: 'entry-2' }]
		});
		const missing = twoTiers({
			commonQuestions: [{ tier1EntryId: 'entry-1', tier2EntryId: 'gone' }]
		});

		expect(messages(unequal)).toEqual([
			'1a (5) and 8a (6) are paired but have different available marks.'
		]);
		expect(assessmentBlockers(missing).unequalPairs).toHaveLength(1);
		expect(messages(missing)).toEqual([]);
	});
});

describe('pairedMarks', () => {
	function documentWith(commonQuestions: MarksheetDocument['commonQuestions']): MarksheetDocument {
		return confirmed({
			tiers: [
				tier({
					breakdown: {
						entries: [entry('a', '1a', '1', { marks: 5 }), entry('b', '2a', '2', { marks: 3 })],
						warnings: []
					}
				}),
				tier({
					tierName: 'Foundation',
					sourceFilenames: ['10X Ph1 F.pdf'],
					breakdown: {
						entries: [entry('c', '8a', '8', { marks: 5 }), entry('d', '9a', '9', { marks: 3 })],
						warnings: []
					}
				})
			],
			commonQuestions
		});
	}

	it('adds Tier 1’s side of each pair, once per pair', () => {
		expect(pairedMarks(documentWith([{ tier1EntryId: 'a', tier2EntryId: 'c' }]))).toBe(5);
		expect(
			pairedMarks(
				documentWith([
					{ tier1EntryId: 'a', tier2EntryId: 'c' },
					{ tier1EntryId: 'b', tier2EntryId: 'd' }
				])
			)
		).toBe(8);
	});

	it('counts a pair whose Tier 1 entry is missing as zero', () => {
		expect(
			pairedMarks(
				documentWith([
					{ tier1EntryId: 'gone', tier2EntryId: 'c' },
					{ tier1EntryId: 'a', tier2EntryId: 'c' }
				])
			)
		).toBe(5);
	});

	it('is zero with no pairs', () => {
		expect(pairedMarks(confirmed())).toBe(0);
	});
});

describe('noPairsNotice', () => {
	function twoTiers(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
		return confirmed({
			tiers: [
				tier({ tierName: 'Higher' }),
				tier({
					tierName: 'Foundation',
					sourceFilenames: ['10X Ph1 F.pdf'],
					breakdown: { entries: [entry('entry-2', '8a', '8')], warnings: [] }
				})
			],
			...overrides
		});
	}

	it('has nothing to say on a single tier, or when pairs exist', () => {
		expect(noPairsNotice(confirmed(), null)).toBeNull();
		expect(
			noPairsNotice(
				twoTiers({ commonQuestions: [{ tier1EntryId: 'entry-1', tier2EntryId: 'entry-2' }] }),
				null
			)
		).toBeNull();
	});

	it('asks for pairs by hand when no run offered any', () => {
		expect(noPairsNotice(twoTiers(), null)).toEqual({
			title: 'No common questions yet',
			description: 'Pair them by hand below.'
		});
	});

	it('shows the run’s reason when it proposed none', () => {
		expect(noPairsNotice(twoTiers(), 'The model could not read the PDFs.')).toEqual({
			title: 'No common questions proposed',
			description: 'The model could not read the PDFs.'
		});
	});
});

describe('tierHasBlocker', () => {
	function twoTiers(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
		return confirmed({
			tiers: [
				tier({ tierName: 'Higher' }),
				tier({
					tierName: 'Foundation',
					sourceFilenames: ['10X Ph1 F.pdf'],
					breakdown: { entries: [entry('entry-2', '8a', '8')], warnings: [] }
				})
			],
			...overrides
		});
	}

	it('marks only the tier with its own blocker', () => {
		const blockers = assessmentBlockers(
			twoTiers({
				tiers: [
					tier({ tierName: 'Higher' }),
					tier({
						tierName: 'Foundation',
						sourceFilenames: ['10X Ph1 F.pdf'],
						breakdown: {
							entries: [entry('entry-2', '8a', '8', { marks: null })],
							warnings: []
						}
					})
				]
			})
		);

		expect(tierHasBlocker(blockers, 0)).toBe(false);
		expect(tierHasBlocker(blockers, 1)).toBe(true);
	});

	it('marks the tab whose tier has no name', () => {
		const blockers = assessmentBlockers(
			twoTiers({
				tiers: [
					tier({ tierName: null }),
					tier({
						tierName: 'Foundation',
						sourceFilenames: ['10X Ph1 F.pdf'],
						breakdown: { entries: [entry('entry-2', '8a', '8')], warnings: [] }
					})
				]
			})
		);

		expect(tierHasBlocker(blockers, 0)).toBe(true);
		expect(tierHasBlocker(blockers, 1)).toBe(false);
	});

	it('marks both tabs when the names are shared', () => {
		const blockers = assessmentBlockers(
			twoTiers({
				tiers: [
					tier({ tierName: 'Higher' }),
					tier({
						tierName: 'higher',
						sourceFilenames: ['10X Ph1 F.pdf'],
						breakdown: { entries: [entry('entry-2', '8a', '8')], warnings: [] }
					})
				]
			})
		);

		expect(tierHasBlocker(blockers, 0)).toBe(true);
		expect(tierHasBlocker(blockers, 1)).toBe(true);
	});

	it('marks both tabs when a pair is unequal', () => {
		const blockers = assessmentBlockers(
			twoTiers({
				commonQuestions: [{ tier1EntryId: 'entry-1', tier2EntryId: 'gone' }]
			})
		);

		expect(tierHasBlocker(blockers, 0)).toBe(true);
		expect(tierHasBlocker(blockers, 1)).toBe(true);
	});

	it('marks neither tab when nothing blocks', () => {
		const blockers = assessmentBlockers(twoTiers());

		expect(tierHasBlocker(blockers, 0)).toBe(false);
		expect(tierHasBlocker(blockers, 1)).toBe(false);
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
