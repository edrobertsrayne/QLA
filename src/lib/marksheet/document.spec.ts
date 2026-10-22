import { describe, expect, it } from 'vitest';
import {
	DOCUMENT_SCHEMA_VERSION,
	dropOrphanedTopicNames,
	dropUnreachableMarks,
	dropUnreachableReports,
	entryValuesOf,
	parseStoredDocument,
	type EntryValues,
	type MarksheetDocument
} from './document.js';
import { backupState } from './backup.js';
import { ago, confirmed, entry, parsed, student, writtenAsV2 } from './fixtures.spec-helpers.js';

/** A document as storage hands it back: serialised, then read. */
function read(document: MarksheetDocument): MarksheetDocument {
	const result = parseStoredDocument(JSON.stringify(document));
	if (!result) throw new Error('not a document');
	return result;
}

const ORIGIN: EntryValues = entryValuesOf(entry('entry-1', '2bii', '2'));

describe('reading a stored document', () => {
	it('reads the parse’s own values back with an entry that records them', () => {
		const document = parsed({
			breakdown: {
				entries: [entry('e', '2b', '2', { original: ORIGIN })],
				warnings: [],
				aoDescriptions: {}
			}
		});

		expect(read(document).breakdown.entries[0].original).toEqual(ORIGIN);
	});

	it('reads an entry that records no parse values as added by the teacher', () => {
		const document = parsed({
			breakdown: {
				entries: [entry('e', '', '', { original: null })],
				warnings: [],
				aoDescriptions: {}
			}
		});

		expect(read(document).breakdown.entries[0].original).toBeNull();
	});

	it('reads a document written before entries recorded the parse’s values', () => {
		// #35 wrote entries with no recorded values: they are read as the parse's.
		const written = JSON.parse(JSON.stringify(parsed()));
		delete written.breakdown.entries[0].original;

		const document = parseStoredDocument(JSON.stringify(written));

		expect(document).not.toBeNull();
		expect(document?.breakdown.entries[0].label).toBe('2bii');
		expect(document?.breakdown.entries[0].original).toEqual(ORIGIN);
	});

	it('treats an entry reciting nonsense as its parse values as unreadable', () => {
		const raw = JSON.stringify(parsed()).replace(
			'"original":{"label":"2bii"',
			'"original":{"label":7'
		);

		expect(parseStoredDocument(raw)).toBeNull();
	});
});

describe('dropping unreachable marks', () => {
	it('silently drops marks whose student or entry no longer exists', () => {
		const document = parsed({
			students: [student('student-1', 'Ada', 'Lovelace')],
			marks: {
				'student-1': { 'entry-1': 3, 'entry-gone': 2 },
				'student-gone': { 'entry-1': 1 }
			}
		});

		expect(dropUnreachableMarks(read(document)).marks).toEqual({
			'student-1': { 'entry-1': 3 }
		});
	});
});
describe('reading a document with boundaries, topic names and reports', () => {
	it('reads grade boundaries, topic names and reports back unchanged', () => {
		const document = confirmed({
			paper: {
				...confirmed().paper,
				boundaries: [
					{ label: 'A', minimum: 52 },
					{ label: 'B', minimum: 41 }
				],
				belowLowestLabel: 'U'
			},
			topicNames: { '3.2.1.4': 'Rates of reaction' },
			reports: {
				'student-1': {
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
				}
			}
		});

		expect(read(document)).toEqual(document);
	});

	it('reads a document with no grade boundaries as marks only', () => {
		expect(read(confirmed()).paper.boundaries).toBeNull();
		expect(read(confirmed()).paper.belowLowestLabel).toBe('U');
	});

	it('reads a document written before AO descriptions as having none', () => {
		const written = JSON.parse(JSON.stringify(confirmed()));
		delete written.breakdown.aoDescriptions;

		const document = parseStoredDocument(JSON.stringify(written));

		expect(document?.breakdown.aoDescriptions).toEqual({});
		expect(document?.breakdown.entries).toEqual(confirmed().breakdown.entries);
	});

	it('reads AO descriptions back as stored', () => {
		const document = confirmed();
		document.breakdown.aoDescriptions = { AO1: 'Recall facts', AO3: 'Evaluate evidence' };

		expect(read(document)).toEqual(document);
	});

	it('treats AO descriptions of the wrong shape as unreadable', () => {
		for (const aoDescriptions of [['AO1'], { AO9: 'Unknown' }, { AO1: 3 }]) {
			const written = JSON.parse(JSON.stringify(confirmed()));
			written.breakdown.aoDescriptions = aoDescriptions;

			expect(parseStoredDocument(JSON.stringify(written))).toBeNull();
		}
	});

	it('treats a v1 document as unreadable, like any other version', () => {
		const written = JSON.parse(JSON.stringify(confirmed()));
		written.schemaVersion = 1;

		expect(parseStoredDocument(JSON.stringify(written))).toBeNull();
	});

	it('treats a boundary of the wrong shape as unreadable', () => {
		const written = JSON.parse(JSON.stringify(confirmed()));
		written.paper.boundaries = [{ label: 'A' }];

		expect(parseStoredDocument(JSON.stringify(written))).toBeNull();
	});

	it('treats a report of the wrong shape as unreadable', () => {
		const written = JSON.parse(JSON.stringify(confirmed()));
		written.reports = { 'student-1': { strengths: ['Well done.'] } };

		expect(parseStoredDocument(JSON.stringify(written))).toBeNull();
	});

	it('treats an empty below-lowest label as unreadable rather than correcting it', () => {
		const written = JSON.parse(JSON.stringify(confirmed()));
		written.paper.belowLowestLabel = '';

		expect(parseStoredDocument(JSON.stringify(written))).toBeNull();
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

	it('treats an unbacked-change moment of the wrong shape as unreadable', () => {
		const written = JSON.parse(JSON.stringify(confirmed()));
		written.firstUnbackedChangeAt = 3;

		expect(parseStoredDocument(JSON.stringify(written))).toBeNull();
	});

	it('treats a current document with no unbacked-change field as unreadable', () => {
		const written = JSON.parse(JSON.stringify(confirmed()));
		delete written.firstUnbackedChangeAt;

		expect(parseStoredDocument(JSON.stringify(written))).toBeNull();
	});
});

describe('dropping what no longer exists', () => {
	it('drops reports for removed students but keeps reports for students still present', () => {
		const report = {
			strengths: ['You explain processes clearly.'],
			areasForImprovement: [] as string[],
			edit: null,
			input: { paperLabel: '10X Ph1', entries: [] as never[] },
			model: 'openai/gpt-6-luna',
			generatedAt: '2026-01-02T10:00:00.000Z'
		};
		const document = confirmed({
			students: [student('student-1', 'Ada', 'Lovelace')],
			reports: { 'student-1': report, 'student-gone': report }
		});

		expect(dropUnreachableReports(read(document))).toEqual({ 'student-1': report });
	});

	it('drops topic names whose code appears on no entry, including inside comma and slash lists', () => {
		const document = confirmed({
			breakdown: {
				entries: [
					entry('entry-1', '2bii', '2', { specPoint: '5.1.1, 5.1.2' }),
					entry('entry-2', '3a', '3', { specPoint: '5.2.1/5.2.2' }),
					entry('entry-3', '4a', '4', { specPoint: null })
				],
				warnings: [],
				aoDescriptions: {}
			},
			topicNames: {
				'5.1.1': 'Waves',
				'5.1.2': 'Sound',
				'5.2.1': 'Energy',
				'5.2.2': 'Power',
				'9.9.9': 'Gone'
			}
		});

		expect(dropOrphanedTopicNames(read(document))).toEqual({
			'5.1.1': 'Waves',
			'5.1.2': 'Sound',
			'5.2.1': 'Energy',
			'5.2.2': 'Power'
		});
	});
});
