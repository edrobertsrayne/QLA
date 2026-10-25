import { describe, expect, it } from 'vitest';
import {
	DOCUMENT_SCHEMA_VERSION,
	allEntries,
	dropOrphanedTopicNames,
	dropUnreachable,
	dropUnreachableMarks,
	dropUnreachableReports,
	entriesOfStudent,
	entryTierOf,
	entryValuesOf,
	hasTwoTiers,
	marksOnEntry,
	otherTier,
	parseStoredDocument,
	partnerIdOf,
	restingTier,
	storedMarkCount,
	studentTierName,
	studentTotal,
	tierEntries,
	tierNameProblem,
	tierNamesCollide,
	topicCodesOf,
	type EntryValues,
	type MarksheetDocument,
	type StoredReport
} from './document.js';
import { backupState } from './backup.js';
import {
	NOW,
	ago,
	confirmed,
	entry,
	parsed,
	student,
	tier,
	writtenAsV2
} from './fixtures.spec-helpers.js';

/** A document as storage hands it back: serialised, then read. */
function read(document: MarksheetDocument): MarksheetDocument {
	const result = parseStoredDocument(JSON.stringify(document));
	if (!result) throw new Error('not a document');
	return result;
}

const ORIGIN: EntryValues = entryValuesOf(entry('entry-1', '2bii', '2'));

const REPORT: StoredReport = {
	strengths: ['You explain processes clearly.'],
	areasForImprovement: ['Practise multi-step calculations weekly.'],
	edit: null,
	input: {
		paperLabel: '10X Ph1',
		entries: [
			{
				label: '2bii',
				summary: 'Describe the rate change',
				commandWord: 'Describe',
				ao: 'AO2',
				topics: ['Rates of reaction'],
				gained: 3,
				available: 4
			}
		]
	},
	model: 'openai/gpt-6-luna',
	generatedAt: '2026-01-02T10:00:00.000Z'
};

const V2_PAPER = {
	label: '10X Ph1',
	className: '10X',
	sourceFilenames: ['10X Ph1.pdf'],
	parsedAt: NOW,
	boundaries: null,
	belowLowestLabel: 'U'
};

/** A version 2 document as that version wrote it: one paper, one breakdown, no tiers. */
function version2(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		schemaVersion: 2,
		createdAt: NOW,
		updatedAt: NOW,
		breakdownConfirmedAt: NOW,
		lastExportedAt: null,
		paper: V2_PAPER,
		breakdown: {
			entries: [entry('entry-1', '2bii', '2')],
			warnings: [],
			aoDescriptions: {}
		},
		students: [{ id: 'student-1', firstName: 'Ada', surname: 'Lovelace', absent: false }],
		marks: { 'student-1': { 'entry-1': 3 } },
		topicNames: {},
		reports: {},
		...overrides
	};
}

function readVersion2(overrides: Record<string, unknown> = {}): MarksheetDocument | null {
	return parseStoredDocument(JSON.stringify(version2(overrides)));
}

/** A version 3 document with its fields exposed raw, so a test can break one. */
function rawVersion3(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		schemaVersion: DOCUMENT_SCHEMA_VERSION,
		createdAt: NOW,
		updatedAt: NOW,
		breakdownConfirmedAt: NOW,
		lastExportedAt: null,
		firstUnbackedChangeAt: null,
		label: '10X Ph1',
		className: null,
		aoDescriptions: {},
		tiers: [tier()],
		students: [],
		marks: {},
		commonQuestions: [],
		topicNames: {},
		reports: {},
		...overrides
	};
}

/** A two-tier assessment with one entry per tier, ids unique across the document. */
function twoTier(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
	return confirmed({
		tiers: [
			tier({ breakdown: { entries: [entry('tier-1-entry', '1a', '1')], warnings: [] } }),
			tier({
				tierName: 'Foundation',
				sourceFilenames: ['10X Ph1 F.pdf'],
				breakdown: { entries: [entry('tier-2-entry', '1a', '1')], warnings: [] }
			})
		],
		...overrides
	});
}

describe('reading a stored document', () => {
	it('reads a version 3 document back unchanged', () => {
		const document = confirmed({
			students: [student('student-1', 'Ada', 'Lovelace')],
			marks: { 'student-1': { 'entry-1': 3 } }
		});

		expect(read(document)).toEqual(document);
	});

	it('drops unknown fields instead of carrying them', () => {
		const document = parseStoredDocument(
			JSON.stringify(rawVersion3({ paper: { label: 'old' }, unknown: true }))
		);

		expect(document?.schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);
		expect(document).not.toHaveProperty('paper');
		expect(document).not.toHaveProperty('unknown');
	});

	it('reads the parse’s own values back with an entry that records them', () => {
		const document = parsed({
			tiers: [
				tier({
					breakdown: { entries: [entry('e', '2b', '2', { original: ORIGIN })], warnings: [] }
				})
			]
		});

		expect(read(document).tiers[0].breakdown.entries[0].original).toEqual(ORIGIN);
	});

	it('reads an entry that records no parse values as added by the teacher', () => {
		const document = parsed({
			tiers: [
				tier({ breakdown: { entries: [entry('e', '', '', { original: null })], warnings: [] } })
			]
		});

		expect(read(document).tiers[0].breakdown.entries[0].original).toBeNull();
	});

	it('reads an entry written before entries recorded the parse’s values', () => {
		// #35 wrote entries with no recorded values: they are read as the parse's.
		const written = JSON.parse(JSON.stringify(parsed()));
		delete written.tiers[0].breakdown.entries[0].original;

		const document = parseStoredDocument(JSON.stringify(written));

		expect(document).not.toBeNull();
		expect(document?.tiers[0].breakdown.entries[0].label).toBe('2bii');
		expect(document?.tiers[0].breakdown.entries[0].original).toEqual(ORIGIN);
	});

	it('treats an entry reciting nonsense as its parse values as unreadable', () => {
		const raw = JSON.stringify(parsed()).replace(
			'"original":{"label":"2bii"',
			'"original":{"label":7'
		);

		expect(parseStoredDocument(raw)).toBeNull();
	});

	it('reads AO descriptions back as stored', () => {
		const document = confirmed({
			aoDescriptions: { AO1: 'Recall facts', AO3: 'Evaluate evidence' }
		});

		expect(read(document)).toEqual(document);
	});

	it('treats AO descriptions of the wrong shape as unreadable', () => {
		for (const aoDescriptions of [['AO1'], { AO9: 'Unknown' }, { AO1: 3 }]) {
			const document = parseStoredDocument(JSON.stringify(rawVersion3({ aoDescriptions })));

			expect(document).toBeNull();
		}
	});
});

describe('reading a document that breaks an invariant', () => {
	const unreadable = (document: MarksheetDocument) => parseStoredDocument(JSON.stringify(document));

	it('refuses two entries sharing an id, within a tier or across tiers', () => {
		const within = confirmed({
			tiers: [
				tier({
					breakdown: { entries: [entry('e', '1a', '1'), entry('e', '1b', '1')], warnings: [] }
				})
			]
		});
		const across = twoTier();
		across.tiers[1].breakdown.entries[0].id = 'tier-1-entry';

		expect(unreadable(within)).toBeNull();
		expect(unreadable(across)).toBeNull();
	});

	it('refuses two students sharing an id', () => {
		const document = confirmed({
			students: [student('s', 'Ada', 'Lovelace'), student('s', 'Alan', 'Turing')]
		});

		expect(unreadable(document)).toBeNull();
	});

	it.each([0, -3])('refuses an entry with %i marks, and a parse recording them', (marks) => {
		const own = confirmed({
			tiers: [tier({ breakdown: { entries: [entry('e', '1a', '1', { marks })], warnings: [] } })]
		});
		const recorded = confirmed({
			tiers: [
				tier({
					breakdown: {
						entries: [entry('e', '1a', '1', { original: { ...ORIGIN, marks } })],
						warnings: []
					}
				})
			]
		});

		expect(unreadable(own)).toBeNull();
		expect(unreadable(recorded)).toBeNull();
	});

	it('still reads an entry with unknown marks', () => {
		const document = confirmed({
			tiers: [
				tier({ breakdown: { entries: [entry('e', '1a', '1', { marks: null })], warnings: [] } })
			]
		});

		expect(read(document)).toEqual(document);
	});

	it.each([
		[
			'not descending',
			[
				{ label: '5', minimum: 20 },
				{ label: '4', minimum: 30 }
			]
		],
		[
			'repeating a minimum',
			[
				{ label: '5', minimum: 20 },
				{ label: '4', minimum: 20 }
			]
		],
		[
			'repeating a label',
			[
				{ label: '5', minimum: 30 },
				{ label: ' 5 ', minimum: 20 }
			]
		],
		['using the below-lowest label', [{ label: 'U', minimum: 30 }]]
	])('refuses grade boundaries %s', (_why, boundaries) => {
		expect(unreadable(confirmed({ tiers: [tier({ boundaries })] }))).toBeNull();
	});

	it('still reads boundaries above the current paper total, and none at all', () => {
		const high = confirmed({
			tiers: [
				tier({
					boundaries: [
						{ label: '9', minimum: 500 },
						{ label: '8', minimum: 400 }
					]
				})
			]
		});

		expect(read(high)).toEqual(high);
		expect(read(confirmed({ tiers: [tier({ boundaries: [] })] })).tiers[0].boundaries).toEqual([]);
	});
});

describe('reading a version 2 document', () => {
	it('converts it to version 3 field by field', () => {
		const document = readVersion2({
			breakdown: {
				entries: [entry('entry-1', '2bii', '2')],
				warnings: [{ questionId: 'entry-1', code: 'MARKS_MISSING', message: 'No marks.' }],
				aoDescriptions: { AO1: 'Recall facts' }
			},
			paper: {
				label: '10X Ph1',
				className: '10X',
				sourceFilenames: ['10X Ph1.pdf', '10X Ph1 ms.pdf'],
				parsedAt: NOW,
				boundaries: [
					{ label: 'A', minimum: 52 },
					{ label: 'B', minimum: 41 }
				],
				belowLowestLabel: 'U'
			},
			students: [
				{ id: 'student-1', firstName: 'Ada', surname: 'Lovelace', absent: false },
				{ id: 'student-2', firstName: 'Alan', surname: 'Turing', absent: true }
			],
			marks: { 'student-1': { 'entry-1': 3 } },
			topicNames: { '3.2.1.4': 'Rates of reaction' },
			reports: { 'student-1': REPORT }
		});

		expect(document).toEqual({
			schemaVersion: DOCUMENT_SCHEMA_VERSION,
			createdAt: NOW,
			updatedAt: NOW,
			breakdownConfirmedAt: NOW,
			lastExportedAt: null,
			firstUnbackedChangeAt: null,
			label: '10X Ph1',
			className: '10X',
			aoDescriptions: { AO1: 'Recall facts' },
			tiers: [
				{
					tierName: null,
					sourceFilenames: ['10X Ph1.pdf', '10X Ph1 ms.pdf'],
					parsedAt: NOW,
					breakdown: {
						entries: [entry('entry-1', '2bii', '2')],
						warnings: [{ questionId: 'entry-1', code: 'MARKS_MISSING', message: 'No marks.' }]
					},
					boundaries: [
						{ label: 'A', minimum: 52 },
						{ label: 'B', minimum: 41 }
					],
					belowLowestLabel: 'U'
				}
			],
			students: [
				{ id: 'student-1', firstName: 'Ada', surname: 'Lovelace', absent: false, tier: 0 },
				{ id: 'student-2', firstName: 'Alan', surname: 'Turing', absent: true, tier: 0 }
			],
			marks: { 'student-1': { 'entry-1': 3 } },
			commonQuestions: [],
			topicNames: { '3.2.1.4': 'Rates of reaction' },
			reports: { 'student-1': REPORT }
		});
	});

	it('reads the converted document back through the version 3 validator', () => {
		const converted = readVersion2();
		if (!converted) throw new Error('not converted');

		expect(read(converted)).toEqual(converted);
	});

	it('keeps a converted report describing the same paper and marks', () => {
		const document = readVersion2({
			marks: { 'student-1': { 'entry-1': 3 } },
			reports: { 'student-1': REPORT }
		});
		if (!document) throw new Error('not a document');

		const input = document.reports['student-1'].input;
		const entries = tierEntries(document, 0);
		const marks = document.marks['student-1'];

		expect(input.paperLabel).toBe(document.label ?? '');
		expect(input.entries.map((reportEntry) => reportEntry.label)).toEqual(
			entries.map((tierEntry) => tierEntry.label)
		);
		expect(input.entries.map((reportEntry) => reportEntry.gained)).toEqual(
			entries.map((tierEntry) => marks[tierEntry.id])
		);
	});

	it('reads a paper with no grade boundaries as marks only', () => {
		const document = readVersion2({
			paper: { label: '10X Ph1', className: null, sourceFilenames: [], parsedAt: NOW }
		});

		expect(document?.tiers[0].boundaries).toBeNull();
		expect(document?.tiers[0].belowLowestLabel).toBe('U');
	});

	it('reads a breakdown written before AO descriptions as having none', () => {
		const document = readVersion2({
			breakdown: { entries: [entry('entry-1', '2bii', '2')], warnings: [] }
		});

		expect(document?.aoDescriptions).toEqual({});
		expect(document?.tiers[0].breakdown.entries).toEqual([entry('entry-1', '2bii', '2')]);
	});

	it('treats AO descriptions of the wrong shape as unreadable', () => {
		for (const aoDescriptions of [['AO1'], { AO9: 'Unknown' }, { AO1: 3 }]) {
			const document = readVersion2({
				breakdown: { entries: [], warnings: [], aoDescriptions }
			});

			expect(document).toBeNull();
		}
	});

	it('treats a boundary of the wrong shape as unreadable', () => {
		const document = readVersion2({
			paper: { ...V2_PAPER, boundaries: [{ label: 'A' }] }
		});

		expect(document).toBeNull();
	});

	it('treats a report of the wrong shape as unreadable', () => {
		const document = readVersion2({
			reports: { 'student-1': { strengths: ['Well done.'] } }
		});

		expect(document).toBeNull();
	});

	it('treats an empty below-lowest label as unreadable rather than correcting it', () => {
		const document = readVersion2({ paper: { ...V2_PAPER, belowLowestLabel: '' } });

		expect(document).toBeNull();
	});
});

describe('reading a version 3 document', () => {
	it('treats an assessment that is not one or two tiers as unreadable', () => {
		expect(parseStoredDocument(JSON.stringify(rawVersion3({ tiers: [] })))).toBeNull();
		expect(
			parseStoredDocument(JSON.stringify(rawVersion3({ tiers: [tier(), tier(), tier()] })))
		).toBeNull();
	});

	it('treats a null tier on a single-tier assessment as unreadable', () => {
		const document = rawVersion3({
			students: [
				{ id: 'student-1', firstName: 'Ada', surname: 'Lovelace', absent: false, tier: null }
			]
		});

		expect(parseStoredDocument(JSON.stringify(document))).toBeNull();
	});

	it('treats a tier index the assessment does not have as unreadable', () => {
		const student = { id: 'student-1', firstName: 'Ada', surname: 'Lovelace', absent: false };
		const oneTier = rawVersion3({ students: [{ ...student, tier: 1 }] });
		const twoTiers = rawVersion3({ tiers: [tier(), tier()], students: [{ ...student, tier: 2 }] });

		expect(parseStoredDocument(JSON.stringify(oneTier))).toBeNull();
		expect(parseStoredDocument(JSON.stringify(twoTiers))).toBeNull();
	});

	it('reads a two-tier assessment with a student tier not set', () => {
		const document = twoTier({
			students: [student('student-1', 'Ada', 'Lovelace', false, null)]
		});

		expect(read(document).students[0].tier).toBeNull();
	});

	it('treats a malformed pair as unreadable', () => {
		for (const commonQuestions of [
			[{ tier1EntryId: 'a', tier2EntryId: 'b' }, { tier1EntryId: 'c' }],
			[{ tier1EntryId: '', tier2EntryId: 'b' }],
			[{ tier1EntryId: 'a', tier2EntryId: 2 }],
			['a-b'],
			'none'
		]) {
			const document = rawVersion3({ commonQuestions });

			expect(parseStoredDocument(JSON.stringify(document))).toBeNull();
		}
	});

	it('treats an entry paired more than once as unreadable', () => {
		const sameSide = rawVersion3({
			commonQuestions: [
				{ tier1EntryId: 'a', tier2EntryId: 'b' },
				{ tier1EntryId: 'a', tier2EntryId: 'c' }
			]
		});
		const crossed = rawVersion3({
			commonQuestions: [
				{ tier1EntryId: 'a', tier2EntryId: 'b' },
				{ tier1EntryId: 'c', tier2EntryId: 'a' }
			]
		});

		expect(parseStoredDocument(JSON.stringify(sameSide))).toBeNull();
		expect(parseStoredDocument(JSON.stringify(crossed))).toBeNull();
	});
});

describe('reading an unknown version', () => {
	it('treats a version other than 2 or 3 as unreadable', () => {
		for (const schemaVersion of [1, 4, '3']) {
			const document = rawVersion3({ schemaVersion });

			expect(parseStoredDocument(JSON.stringify(document))).toBeNull();
		}
	});

	it('treats a flat document of an unknown version as unreadable', () => {
		for (const schemaVersion of [1, 4]) {
			const written = writtenAsV2(confirmed());
			written.schemaVersion = schemaVersion;

			expect(parseStoredDocument(JSON.stringify(written))).toBeNull();
		}
	});
});

describe('reading changes since the last backup', () => {
	it('reads the oldest unbacked change back unchanged', () => {
		const document = confirmed({
			lastExportedAt: '2026-01-01T10:00:00.000Z',
			firstUnbackedChangeAt: '2026-01-02T09:00:00.000Z'
		});

		expect(read(document).firstUnbackedChangeAt).toBe('2026-01-02T09:00:00.000Z');
	});

	it('reads a v2 document whose last write came after its backup as unbacked from that write', () => {
		const written = writtenAsV2(
			confirmed({
				lastExportedAt: '2026-01-01T09:00:00.000Z',
				updatedAt: '2026-01-01T10:00:00.000Z'
			})
		);

		const document = parseStoredDocument(JSON.stringify(written));

		expect(document?.schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);
		expect(document?.firstUnbackedChangeAt).toBe('2026-01-01T10:00:00.000Z');
	});

	it('reads a v2 document whose last write was its backup as having nothing unbacked', () => {
		const written = writtenAsV2(confirmed({ lastExportedAt: '2026-01-01T10:00:00.000Z' }));

		expect(parseStoredDocument(JSON.stringify(written))?.firstUnbackedChangeAt).toBeNull();
	});

	it('reads a v2 document that was never backed up as changed from its creation', () => {
		const document = parseStoredDocument(
			JSON.stringify(writtenAsV2(confirmed({ createdAt: ago(3) })))
		);
		if (!document) throw new Error('not a document');

		expect(backupState(document)).toEqual({ kind: 'never', changedAt: new Date(ago(3)) });
	});

	it('reads a flat version 3 document as one tier and keeps the moment it records', () => {
		const written = writtenAsV2(confirmed({ lastExportedAt: ago(2), updatedAt: ago(1) }));
		written.schemaVersion = 3;
		written.firstUnbackedChangeAt = ago(0.5);

		const document = parseStoredDocument(JSON.stringify(written));

		expect(document?.tiers).toHaveLength(1);
		expect(document?.label).toBe('10X Ph1');
		expect(document?.firstUnbackedChangeAt).toBe(ago(0.5));
	});

	it('derives the unbacked moment of a flat version 3 that never recorded one', () => {
		const written = writtenAsV2(
			confirmed({
				lastExportedAt: '2026-01-01T09:00:00.000Z',
				updatedAt: '2026-01-01T10:00:00.000Z'
			})
		);
		written.schemaVersion = 3;

		expect(parseStoredDocument(JSON.stringify(written))?.firstUnbackedChangeAt).toBe(
			'2026-01-01T10:00:00.000Z'
		);
	});

	it('treats an unbacked-change moment of the wrong shape as unreadable', () => {
		const written = JSON.parse(JSON.stringify(confirmed()));
		written.firstUnbackedChangeAt = 3;

		expect(parseStoredDocument(JSON.stringify(written))).toBeNull();

		// A flat version 3 recorded the field itself: a wrong shape there is not
		// read as "missing" and derived over.
		const flat = writtenAsV2(confirmed());
		flat.schemaVersion = 3;
		flat.firstUnbackedChangeAt = 3;

		expect(parseStoredDocument(JSON.stringify(flat))).toBeNull();
	});

	it('treats a current document with no unbacked-change field as unreadable', () => {
		const written = JSON.parse(JSON.stringify(confirmed()));
		delete written.firstUnbackedChangeAt;

		expect(parseStoredDocument(JSON.stringify(written))).toBeNull();
	});
});

describe('dropping what no longer exists', () => {
	it('drops unreachable marks and keeps marks on the tier the student is not set to', () => {
		const document = read(
			twoTier({
				students: [student('student-1', 'Ada', 'Lovelace', false, 0)],
				marks: {
					'student-1': { 'tier-1-entry': 3, 'tier-2-entry': 2, 'entry-gone': 1 },
					'student-gone': { 'tier-1-entry': 1 }
				}
			})
		);

		expect(dropUnreachableMarks(document).marks).toEqual({
			'student-1': { 'tier-1-entry': 3, 'tier-2-entry': 2 }
		});
	});

	it('drops a pair whose entry is missing from its own tier', () => {
		const document = read(
			confirmed({
				tiers: [
					tier({
						breakdown: {
							entries: [entry('t1-a', '1a', '1'), entry('t1-b', '2a', '2')],
							warnings: []
						}
					}),
					tier({
						tierName: 'Foundation',
						sourceFilenames: ['10X Ph1 F.pdf'],
						breakdown: {
							entries: [entry('t2-a', '1a', '1'), entry('t2-b', '2a', '2')],
							warnings: []
						}
					})
				],
				commonQuestions: [
					{ tier1EntryId: 't1-a', tier2EntryId: 't2-a' },
					{ tier1EntryId: 'gone', tier2EntryId: 't2-b' },
					{ tier1EntryId: 't1-b', tier2EntryId: 'also-gone' }
				]
			})
		);

		expect(dropUnreachable(document).commonQuestions).toEqual([
			{ tier1EntryId: 't1-a', tier2EntryId: 't2-a' }
		]);
	});

	it('drops a pair whose ids are on the wrong tiers', () => {
		const document = read(
			confirmed({
				tiers: [
					tier({ breakdown: { entries: [entry('t1-a', '1a', '1')], warnings: [] } }),
					tier({
						tierName: 'Foundation',
						sourceFilenames: ['10X Ph1 F.pdf'],
						breakdown: { entries: [entry('t2-a', '1a', '1')], warnings: [] }
					})
				],
				commonQuestions: [{ tier1EntryId: 't2-a', tier2EntryId: 't1-a' }]
			})
		);

		expect(dropUnreachable(document).commonQuestions).toEqual([]);
	});

	it('keeps a pair with unequal marks so confirmation can block on it', () => {
		const document = read(
			confirmed({
				tiers: [
					tier({
						breakdown: { entries: [entry('t1-a', '1a', '1', { marks: 4 })], warnings: [] }
					}),
					tier({
						tierName: 'Foundation',
						sourceFilenames: ['10X Ph1 F.pdf'],
						breakdown: { entries: [entry('t2-a', '1a', '1', { marks: 3 })], warnings: [] }
					})
				],
				commonQuestions: [{ tier1EntryId: 't1-a', tier2EntryId: 't2-a' }]
			})
		);

		expect(dropUnreachable(document).commonQuestions).toEqual([
			{ tier1EntryId: 't1-a', tier2EntryId: 't2-a' }
		]);
	});

	it('drops reports for removed students but keeps reports for students still present', () => {
		const document = confirmed({
			students: [student('student-1', 'Ada', 'Lovelace')],
			reports: { 'student-1': REPORT, 'student-gone': REPORT }
		});

		expect(dropUnreachableReports(read(document))).toEqual({ 'student-1': REPORT });
	});

	it('drops a topic name only when no tier carries its code', () => {
		const document = read(
			confirmed({
				tiers: [
					tier({
						breakdown: {
							entries: [entry('t1-a', '1a', '1', { specPoint: '5.1.1, 5.1.2' })],
							warnings: []
						}
					}),
					tier({
						tierName: 'Foundation',
						sourceFilenames: ['10X Ph1 F.pdf'],
						breakdown: {
							entries: [entry('t2-a', '1a', '1', { specPoint: '5.2.1/5.2.2' })],
							warnings: []
						}
					})
				],
				topicNames: {
					'5.1.1': 'Waves',
					'5.1.2': 'Sound',
					'5.2.1': 'Energy',
					'5.2.2': 'Power',
					'9.9.9': 'Gone'
				}
			})
		);

		expect(dropOrphanedTopicNames(document)).toEqual({
			'5.1.1': 'Waves',
			'5.1.2': 'Sound',
			'5.2.1': 'Energy',
			'5.2.2': 'Power'
		});
	});
});

describe('counting stored marks', () => {
	it('counts a mark on either tier, whether or not the student sits it', () => {
		const document = read(
			twoTier({
				students: [
					student('on-tier-1', 'Ada', 'Lovelace', false, 0),
					student('no-tier', 'Alan', 'Turing', false, null)
				],
				marks: {
					'on-tier-1': { 'tier-1-entry': 3, 'tier-2-entry': 2 },
					'no-tier': { 'tier-2-entry': 4 }
				}
			})
		);

		// The off-tier mark and the tierless student's mark are both stored work.
		expect(storedMarkCount(document)).toBe(3);
	});

	it('leaves out a mark whose entry no tier holds', () => {
		const document = read(
			twoTier({
				students: [student('student-1', 'Ada', 'Lovelace', false, 0)],
				marks: { 'student-1': { 'tier-1-entry': 3, 'entry-gone': 1 } }
			})
		);

		expect(storedMarkCount(document)).toBe(1);
	});

	it('counts every mark on one entry, including marks on the other tier', () => {
		const document = read(
			twoTier({
				students: [
					student('on-tier-1', 'Ada', 'Lovelace', false, 0),
					student('on-tier-2', 'Alan', 'Turing', false, 1)
				],
				marks: {
					'on-tier-1': { 'tier-1-entry': 3 },
					'on-tier-2': { 'tier-1-entry': 2 }
				}
			})
		);

		expect(marksOnEntry(document, 'tier-1-entry')).toBe(2);
	});
});

describe('document helpers', () => {
	it('lists every tier’s entries tier 0 first and says which tier holds an entry', () => {
		const document = read(twoTier());

		expect(tierEntries(document, 0).map((tierEntry) => tierEntry.id)).toEqual(['tier-1-entry']);
		expect(tierEntries(document, 1).map((tierEntry) => tierEntry.id)).toEqual(['tier-2-entry']);
		expect(allEntries(document).map((tierEntry) => tierEntry.id)).toEqual([
			'tier-1-entry',
			'tier-2-entry'
		]);
		expect(entryTierOf(document, 'tier-2-entry')).toBe(1);
		expect(entryTierOf(document, 'entry-gone')).toBeNull();
	});

	it('gives a single-tier assessment no entries on tier 1', () => {
		expect(tierEntries(read(confirmed()), 1)).toEqual([]);
	});

	it('collects topic codes across both tiers in first-seen order', () => {
		const document = read(
			confirmed({
				tiers: [
					tier({
						breakdown: {
							entries: [
								entry('t1-a', '1a', '1', { specPoint: '1.1, 1.2' }),
								entry('t1-b', '2a', '2', { specPoint: '2.1' })
							],
							warnings: []
						}
					}),
					tier({
						tierName: 'Foundation',
						sourceFilenames: ['10X Ph1 F.pdf'],
						breakdown: {
							entries: [entry('t2-a', '1a', '1', { specPoint: '1.2/3.1' })],
							warnings: []
						}
					})
				]
			})
		);

		expect(topicCodesOf(document)).toEqual(['1.1', '1.2', '2.1', '3.1']);
	});

	it('gives an entry its partner on the other tier, and none when unpaired', () => {
		const document = read(
			twoTier({
				commonQuestions: [{ tier1EntryId: 'tier-1-entry', tier2EntryId: 'tier-2-entry' }]
			})
		);

		expect(partnerIdOf(document, 0, 'tier-1-entry')).toBe('tier-2-entry');
		expect(partnerIdOf(document, 1, 'tier-2-entry')).toBe('tier-1-entry');
		expect(partnerIdOf(document, 0, 'tier-2-entry')).toBeNull();
	});

	it('gives a student their own tier’s entries, and none without a tier', () => {
		const document = twoTier({
			students: [
				student('on-tier-2', 'Ada', 'Lovelace', false, 1),
				student('no-tier', 'Alan', 'Turing', false, null)
			]
		});

		expect(
			entriesOfStudent(document, document.students[0]).map((tierEntry) => tierEntry.id)
		).toEqual(['tier-2-entry']);
		expect(entriesOfStudent(document, document.students[1])).toEqual([]);
	});

	it('totals a student’s own tier only, and nothing without a tier', () => {
		const document = twoTier({
			students: [
				student('on-tier-1', 'Ada', 'Lovelace', false, 0),
				student('no-tier', 'Alan', 'Turing', false, null)
			],
			marks: {
				'on-tier-1': { 'tier-1-entry': 3, 'tier-2-entry': 2 },
				'no-tier': { 'tier-1-entry': 3, 'tier-2-entry': 2 }
			}
		});

		expect(studentTotal(document, 'on-tier-1')).toBe(3);
		expect(studentTotal(document, 'no-tier')).toBe(0);
	});

	it('names the tier a student sits, and none without one', () => {
		const document = twoTier({
			students: [
				student('on-tier-2', 'Ada', 'Lovelace', false, 1),
				student('no-tier', 'Alan', 'Turing', false, null)
			]
		});

		expect(studentTierName(document, document.students[0])).toBe('Foundation');
		expect(studentTierName(document, document.students[1])).toBeNull();
	});

	it('reads a stored blank tier name back and gives the report header no separator', () => {
		const document = twoTier({ students: [student('on-tier-1', 'Ada', 'Lovelace', false, 0)] });
		document.tiers[0].tierName = '   ';

		const reread = read(document);

		expect(reread.tiers[0].tierName).toBe('   ');
		expect(studentTierName(reread, reread.students[0])).toBeNull();
	});
});

describe('tier rules', () => {
	function named(first: string | null, second: string | null): MarksheetDocument {
		return twoTier({
			tiers: [tier({ tierName: first }), tier({ tierName: second })]
		});
	}

	it('gives the other tier of a two-tier assessment', () => {
		expect(otherTier(0)).toBe(1);
		expect(otherTier(1)).toBe(0);
	});

	it('knows an assessment with two papers from one with a single paper', () => {
		expect(hasTwoTiers(confirmed())).toBe(false);
		expect(hasTwoTiers(twoTier())).toBe(true);
	});

	it('rests a new student on tier 0 alone, and on no tier when there are two', () => {
		expect(restingTier(confirmed())).toBe(0);
		expect(restingTier(twoTier())).toBeNull();
	});

	it('collides only when both tiers carry the same non-blank name, trimmed and ignoring case', () => {
		expect(tierNamesCollide(named('Higher', '  higher '))).toBe(true);
		expect(tierNamesCollide(named('Higher', 'Foundation'))).toBe(false);
		expect(tierNamesCollide(named('Higher', '   '))).toBe(false);
		expect(tierNamesCollide(named('   ', 'Foundation'))).toBe(false);
		expect(tierNamesCollide(named('   ', '  '))).toBe(false);
		expect(tierNamesCollide(confirmed())).toBe(false);
	});

	it('allows any name, blank included, on a single tier', () => {
		expect(tierNameProblem(confirmed(), 0, null)).toBeNull();
		expect(tierNameProblem(confirmed(), 0, '   ')).toBeNull();
		expect(tierNameProblem(confirmed(), 0, 'Higher')).toBeNull();
	});

	it('asks a two-tier assessment for a non-blank name', () => {
		expect(tierNameProblem(twoTier(), 0, null)).toBe('blank');
		expect(tierNameProblem(twoTier(), 1, '   ')).toBe('blank');
	});

	it('refuses a two-tier name the other tier already carries, trimmed and ignoring case', () => {
		for (const name of ['Higher', ' higher ', 'HIGHER']) {
			expect(tierNameProblem(named('Higher', 'Foundation'), 1, name)).toBe('shared');
			expect(tierNameProblem(named('Foundation', 'Higher'), 0, name)).toBe('shared');
		}
	});

	it('accepts a distinct two-tier name, and one beside a blank name', () => {
		expect(tierNameProblem(named('Higher', 'Foundation'), 0, 'Higher Tier')).toBeNull();
		expect(tierNameProblem(named('Higher', null), 1, 'Foundation')).toBeNull();
		expect(tierNameProblem(named(null, 'Foundation'), 0, 'Higher')).toBeNull();
	});
});
