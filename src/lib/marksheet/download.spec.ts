import { describe, expect, it } from 'vitest';
import { CORRUPT_KEY_PREFIX, DOCUMENT_SCHEMA_VERSION } from './document.js';
import type { MarksheetDocument } from './document.js';
import { backupFile, corruptFile, marksCsvFile } from './download.js';

// Local time, so the day on the file is the day the teacher saw whatever the
// machine's timezone is.
const NOW = new Date(2026, 0, 1, 10, 0);

function marksheet(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
	return {
		schemaVersion: DOCUMENT_SCHEMA_VERSION,
		createdAt: NOW.toISOString(),
		updatedAt: NOW.toISOString(),
		breakdownConfirmedAt: NOW.toISOString(),
		lastExportedAt: null,
		paper: {
			label: '10X Ph1',
			className: '10C1',
			sourceFilenames: ['10X Ph1.pdf'],
			parsedAt: NOW.toISOString(),
			boundaries: null,
			belowLowestLabel: 'U'
		},
		breakdown: {
			entries: [
				{
					id: 'entry-1',
					label: '2bii',
					questionNumber: '2',
					marks: 4,
					summary: 'Explain the process shown',
					specPoint: '3.2.1.4',
					commandWord: 'Explain',
					ao: 'AO1',
					original: null
				}
			],
			warnings: []
		},
		students: [{ id: 'student-1', firstName: 'Ada', surname: 'Lovelace', absent: false }],
		marks: { 'student-1': { 'entry-1': 3 } },
		topicNames: {},
		reports: {},
		...overrides
	};
}

describe('backupFile', () => {
	it('holds the document exactly as storage does', () => {
		const document = marksheet();

		const file = backupFile(document, NOW);

		// Byte for byte: this is the only thing that restores a marksheet.
		expect(file.text).toBe(JSON.stringify(document));
		expect(file.type).toBe('application/json');
	});

	it('names itself by paper and date', () => {
		expect(backupFile(marksheet(), NOW).filename).toBe('qla-backup-10x-ph1-2026-01-01.json');
	});

	it('falls back to a plain name when the paper has none', () => {
		const document = marksheet({ paper: { ...marksheet().paper, label: null } });

		expect(backupFile(document, NOW).filename).toBe('qla-backup-marksheet-2026-01-01.json');
	});

	it('names a paper the filesystem would not take as one it will', () => {
		const document = marksheet({
			paper: { ...marksheet().paper, label: '  AQA GCSE Physics P1 — Nov mock  ' }
		});

		expect(backupFile(document, NOW).filename).toBe(
			'qla-backup-aqa-gcse-physics-p1-nov-mock-2026-01-01.json'
		);
	});
});

describe('marksCsvFile', () => {
	/**
	 * Two entries and two students, with an absent flag, a 0 and a cell still
	 * unmarked between them: every state a mark column can hold.
	 */
	function marksForSpreadsheet(): MarksheetDocument {
		const base = marksheet();
		const [, other] = base.breakdown.entries;
		return {
			...base,
			breakdown: {
				entries: [
					{ ...base.breakdown.entries[0], id: 'entry-2bii', label: '2bii', marks: 4 },
					{ ...(other ?? base.breakdown.entries[0]), id: 'entry-3a', label: '3a', marks: 2 }
				],
				warnings: []
			},
			students: [
				{ id: 'student-1', firstName: 'Ada', surname: 'Lovelace', absent: false },
				{ id: 'student-2', firstName: 'Grace', surname: 'Hopper', absent: true }
			],
			marks: { 'student-1': { 'entry-2bii': 3 }, 'student-2': { 'entry-2bii': 0, 'entry-3a': 2 } }
		};
	}

	it('lays the marks out as a spreadsheet reads them', () => {
		const file = marksCsvFile(marksForSpreadsheet());

		expect(file.text).toBe(
			[
				// One column per entry in breakdown order, and what the row is out of.
				'Surname,First name,Absent,2bii,3a,Total',
				'Max,,,4,2,6',
				// Unmarked is empty; 0 is a mark; absent keeps what was entered.
				'Lovelace,Ada,,3,,3',
				'Hopper,Grace,Y,0,2,2',
				''
			].join('\r\n')
		);
		expect(file.type).toBe('text/csv');
	});

	it('names itself by paper and class, so a Downloads folder tells it from a backup', () => {
		expect(marksCsvFile(marksForSpreadsheet()).filename).toBe('10x-ph1-10c1-marks.csv');
	});

	it('falls back for a paper or a class the teacher never named', () => {
		const document = marksForSpreadsheet();
		document.paper.label = null;
		document.paper.className = null;

		expect(marksCsvFile(document).filename).toBe('marksheet-class-marks.csv');
	});

	it('quotes a label a spreadsheet would otherwise read as two columns', () => {
		const document = marksForSpreadsheet();
		document.breakdown.entries[0].label = '2b, ii';

		expect(marksCsvFile(document).text.split('\r\n')[0]).toBe(
			'Surname,First name,Absent,"2b, ii",3a,Total'
		);
	});
});

describe('corruptFile', () => {
	it('hands back the raw text under a name from the key it was preserved under', () => {
		const key = `${CORRUPT_KEY_PREFIX}2026-01-01T10:00:00.000Z`;

		expect(corruptFile(key, 'not json at all')).toEqual({
			filename: 'qla-corrupt-2026-01-01T10-00-00.000Z.json',
			text: 'not json at all',
			type: 'application/json'
		});
	});
});
