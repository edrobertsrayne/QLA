import { describe, expect, it } from 'vitest';
import { CORRUPT_KEY_PREFIX } from './document.js';
import type { MarksheetDocument } from './document.js';
import { confirmed, entry, student, tier } from './fixtures.spec-helpers.js';
import {
	analysisCsvFile,
	backupFile,
	commonQuestionsCsvFile,
	corruptFile,
	exportFilename,
	marksCsvFile,
	reportPdfFilename
} from './download.js';

// Local time, so the day on the file is the day the teacher saw whatever the
// machine's timezone is.
const NOW = new Date(2026, 0, 1, 10, 0);

function marksheet(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
	return confirmed({
		label: '10X Ph1',
		className: '10C1',
		tiers: [
			tier({ breakdown: { entries: [entry('entry-1', '2bii', '2', { marks: 4 })], warnings: [] } })
		],
		students: [student('student-1', 'Ada', 'Lovelace', false, 0)],
		marks: { 'student-1': { 'entry-1': 3 } },
		...overrides
	});
}

describe('backupFile', () => {
	it('holds the document exactly as storage does', () => {
		const document = marksheet();

		const file = backupFile(document, NOW);

		// Byte for byte: this is the only thing that restores a marksheet.
		expect(file.text).toBe(JSON.stringify(document));
		expect(file.type).toBe('application/json');
	});

	it('names itself by assessment and date', () => {
		expect(backupFile(marksheet(), NOW).filename).toBe('qla-backup-10x-ph1-2026-01-01.json');
	});

	it('falls back to a plain name when the assessment has none', () => {
		const document = marksheet({ label: null });

		expect(backupFile(document, NOW).filename).toBe('qla-backup-marksheet-2026-01-01.json');
	});

	it('names a paper the filesystem would not take as one it will', () => {
		const document = marksheet({ label: '  AQA GCSE Physics P1 — Nov mock  ' });

		expect(backupFile(document, NOW).filename).toBe(
			'qla-backup-aqa-gcse-physics-p1-nov-mock-2026-01-01.json'
		);
	});
});

describe('marksCsvFile', () => {
	/**
	 * Two entries and two students on one tier, with an absent flag, a 0 and a
	 * cell still unmarked between them: every state a mark column can hold.
	 */
	function marksForSpreadsheet(): MarksheetDocument {
		const base = marksheet();
		const first = base.tiers[0].breakdown.entries[0];
		return marksheet({
			tiers: [
				tier({
					tierName: 'Higher',
					breakdown: {
						entries: [
							{ ...first, id: 'entry-2bii', label: '2bii', marks: 4 },
							{ ...first, id: 'entry-3a', label: '3a', marks: 2 }
						],
						warnings: []
					}
				})
			],
			students: [
				student('student-1', 'Ada', 'Lovelace', false, 0),
				student('student-2', 'Grace', 'Hopper', true, 0)
			],
			marks: {
				'student-1': { 'entry-2bii': 3 },
				'student-2': { 'entry-2bii': 0, 'entry-3a': 2 }
			}
		});
	}

	it('lays the tier’s marks out as a spreadsheet reads them', () => {
		const file = marksCsvFile(marksForSpreadsheet(), 0);

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

	it('names itself by assessment and class, with the tier’s name when it has one', () => {
		expect(marksCsvFile(marksForSpreadsheet(), 0).filename).toBe('10x-ph1-10c1-higher-marks.csv');
	});

	it('leaves the tier out of the name when the tier has none', () => {
		const document = marksheet();

		expect(marksCsvFile(document, 0).filename).toBe('10x-ph1-10c1-marks.csv');
	});

	it('falls back for an assessment or a class the teacher never named', () => {
		const document = marksForSpreadsheet();
		document.label = null;
		document.className = null;

		expect(marksCsvFile(document, 0).filename).toBe('marksheet-class-higher-marks.csv');
	});

	it('holds only the tier’s students, entries and on-tier marks', () => {
		const document = marksheet({
			tiers: [
				tier({
					tierName: 'Higher',
					breakdown: { entries: [entry('entry-1', '1a', '1', { marks: 4 })], warnings: [] }
				}),
				tier({
					tierName: 'Foundation',
					breakdown: { entries: [entry('entry-2', '8a', '8', { marks: 2 })], warnings: [] }
				})
			],
			students: [
				student('h1', 'Hana', 'Higher', false, 0),
				student('f1', 'Flo', 'Foundation', false, 1)
			],
			marks: { h1: { 'entry-1': 3, 'entry-2': 2 }, f1: { 'entry-2': 1 } }
		});

		expect(marksCsvFile(document, 0).text).toBe(
			['Surname,First name,Absent,1a,Total', 'Max,,,4,4', 'Higher,Hana,,3,3', ''].join('\r\n')
		);
		expect(marksCsvFile(document, 1).text).toBe(
			['Surname,First name,Absent,8a,Total', 'Max,,,2,2', 'Foundation,Flo,,1,1', ''].join('\r\n')
		);
	});

	it('quotes a label a spreadsheet would otherwise read as two columns', () => {
		const document = marksForSpreadsheet();
		document.tiers[0].breakdown.entries[0].label = '2b, ii';

		expect(marksCsvFile(document, 0).text.split('\r\n')[0]).toBe(
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

/** A minimal RFC 4180 reader: quoted cells may hold commas, quotes and line breaks. */
function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (quoted) {
			if (char === '"' && text[i + 1] === '"') {
				cell += '"';
				i++;
			} else if (char === '"') quoted = false;
			else cell += char;
		} else if (char === '"') quoted = true;
		else if (char === ',') {
			row.push(cell);
			cell = '';
		} else if (char === '\r' && text[i + 1] === '\n') {
			row.push(cell);
			rows.push(row);
			row = [];
			cell = '';
			i++;
		} else cell += char;
	}
	return rows;
}

describe('analysisCsvFile', () => {
	const NASTY = 'Explain "why", then\nshow working';

	/** Entries in an order band order would scramble: green, then red, then not scored. */
	function analysed(): MarksheetDocument {
		const base = marksheet();
		const sample = base.tiers[0].breakdown.entries[0];
		return marksheet({
			tiers: [
				tier({
					tierName: 'Higher',
					breakdown: {
						entries: [
							{
								...sample,
								id: 'e-green',
								label: '1a',
								questionNumber: '1',
								marks: 4,
								summary: NASTY,
								ao: 'AO1'
							},
							{
								...sample,
								id: 'e-red',
								label: '1b',
								questionNumber: '1',
								marks: 4,
								summary: 'Red one',
								specPoint: null,
								ao: null
							},
							{
								...sample,
								id: 'e-none',
								label: '2',
								questionNumber: '',
								marks: null,
								summary: 'No marks given',
								specPoint: null,
								ao: null
							}
						],
						warnings: []
					}
				})
			],
			students: [
				student('s1', 'Ada', 'Lovelace', false, 0),
				student('s2', 'Grace', 'Hopper', false, 0)
			],
			marks: { s1: { 'e-green': 4, 'e-red': 1 }, s2: { 'e-green': 3, 'e-red': 9 } }
		});
	}

	it('has the header, then one row per entry on the tier in breakdown order', () => {
		const rows = parseCsv(analysisCsvFile(analysed(), 0, NOW).text);

		expect(rows[0]).toEqual([
			'Question',
			'Q number',
			'Summary',
			'Available marks',
			'Spec point',
			'AO',
			'Facility %',
			'Mean mark',
			'Band',
			'Marked',
			'Of',
			'Part-marked',
			'Over-max marks',
			'Not-scored reason'
		]);
		expect(rows.slice(1).map((row) => row[0])).toEqual(['1a', '1b', '2']);
	});

	it('fills figures for scored entries and leaves unscored ones empty', () => {
		const [, green, red, none] = parseCsv(analysisCsvFile(analysed(), 0, NOW).text);

		expect(green).toEqual([
			'1a',
			'1',
			NASTY,
			'4',
			'3.2.1.4',
			'AO1',
			'88',
			'3.50',
			'green',
			'2',
			'2',
			'no',
			'0',
			''
		]);
		// 9 is above the 4 available: kept in the sheet, counted as over-max, left out of the figures.
		expect(red).toEqual([
			'1b',
			'1',
			'Red one',
			'4',
			'',
			'',
			'25',
			'1.00',
			'red',
			'2',
			'2',
			'no',
			'1',
			''
		]);
		expect(none).toEqual([
			'2',
			'',
			'No marks given',
			'',
			'',
			'',
			'',
			'',
			'',
			'0',
			'2',
			'no',
			'0',
			'No available marks'
		]);
	});

	it('survives a CSV parser: commas, quotes and line breaks in a summary', () => {
		const rows = parseCsv(analysisCsvFile(analysed(), 0, NOW).text);

		expect(rows[1][2]).toBe(NASTY);
		expect(rows.every((row) => row.length === 14)).toBe(true);
	});

	it('exports only the entries of the tier asked for', () => {
		const document = analysed();
		document.tiers.push(
			tier({
				tierName: 'Foundation',
				breakdown: { entries: [entry('f1', '8a', '8', { marks: 2 })], warnings: [] }
			})
		);

		const rows = parseCsv(analysisCsvFile(document, 1, NOW).text);

		expect(rows.slice(1).map((row) => row[0])).toEqual(['8a']);
	});

	it('is named by assessment and day', () => {
		const file = analysisCsvFile(analysed(), 0, NOW);

		expect(file.filename).toBe('qla-analysis-10x-ph1-2026-01-01.csv');
		expect(file.type).toBe('text/csv');
	});
});

describe('commonQuestionsCsvFile', () => {
	/** One pair, marked on both tiers: Tier 1 63%, Tier 2 38%, pooled 50%, gap 25. */
	function paired(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
		return marksheet({
			tiers: [
				tier({
					tierName: 'Higher',
					breakdown: {
						entries: [
							entry('e1', '1a', '1', {
								marks: 4,
								summary: 'Shared question',
								specPoint: '3.2.1.4',
								ao: 'AO1'
							})
						],
						warnings: []
					}
				}),
				tier({
					tierName: 'Foundation',
					breakdown: {
						entries: [
							entry('e2', '8a', '8', {
								marks: 4,
								summary: 'Foundation wording',
								specPoint: null,
								ao: null
							})
						],
						warnings: []
					}
				})
			],
			commonQuestions: [{ tier1EntryId: 'e1', tier2EntryId: 'e2' }],
			students: [
				student('h1', 'Hana', 'Higher', false, 0),
				student('h2', 'Hugo', 'Higher', false, 0),
				student('f1', 'Flo', 'Foundation', false, 1),
				student('f2', 'Finn', 'Foundation', false, 1)
			],
			marks: { h1: { e1: 3 }, h2: { e1: 2 }, f1: { e2: 1 }, f2: { e2: 2 } },
			...overrides
		});
	}

	it('has the fixed columns in order, naming each tier', () => {
		const [header] = parseCsv(commonQuestionsCsvFile(paired(), NOW).text);

		expect(header).toEqual([
			'Higher question',
			'Foundation question',
			'Summary',
			'Available marks',
			'Spec point',
			'AO',
			'Higher facility %',
			'Higher band',
			'Higher marked',
			'Higher of',
			'Foundation facility %',
			'Foundation band',
			'Foundation marked',
			'Foundation of',
			'Pooled facility %',
			'Pooled band',
			'Gap (Higher − Foundation, points)',
			'Part-marked'
		]);
	});

	it('keeps a formula-looking cell as text for the spreadsheet', () => {
		const document = paired();
		document.tiers[0].breakdown.entries[0].summary = '=1+1';
		document.tiers[0].tierName = '=cmd';

		const text = commonQuestionsCsvFile(document, NOW).text;

		expect(text).toContain("'=cmd question");
		expect(text).toContain("'=1+1");
	});

	it('writes one row per pair with both tiers’ figures, the pooled figure and the gap', () => {
		const [, row] = parseCsv(commonQuestionsCsvFile(paired(), NOW).text);

		expect(row).toEqual([
			'1a',
			'8a',
			'Shared question',
			'4',
			'3.2.1.4',
			'AO1',
			'63',
			'amber',
			'2',
			'2',
			'38',
			'red',
			'2',
			'2',
			'50',
			'amber',
			'25',
			'no'
		]);
	});

	it('keeps a negative gap a number the spreadsheet can sort', () => {
		const document = paired({
			marks: { h1: { e1: 1 }, h2: { e1: 0 }, f1: { e2: 4 }, f2: { e2: 3 } }
		});

		const [, row] = parseCsv(commonQuestionsCsvFile(document, NOW).text);

		expect(row?.[16]).toBe('-75');
	});

	it('writes the pairs in Tier 1’s paper order', () => {
		const document = paired({
			tiers: [
				tier({
					tierName: 'Higher',
					breakdown: {
						entries: [entry('e1a', '1a', '1', { marks: 4 }), entry('e1b', '1b', '1', { marks: 4 })],
						warnings: []
					}
				}),
				tier({
					tierName: 'Foundation',
					breakdown: {
						entries: [entry('e2a', '8a', '8', { marks: 4 }), entry('e2b', '8b', '8', { marks: 4 })],
						warnings: []
					}
				})
			],
			commonQuestions: [
				{ tier1EntryId: 'e1b', tier2EntryId: 'e2b' },
				{ tier1EntryId: 'e1a', tier2EntryId: 'e2a' }
			],
			students: [
				student('h1', 'Hana', 'Higher', false, 0),
				student('f1', 'Flo', 'Foundation', false, 1)
			],
			marks: { h1: { e1a: 4, e1b: 4 }, f1: { e2a: 2, e2b: 2 } }
		});

		const rows = parseCsv(commonQuestionsCsvFile(document, NOW).text);

		expect(rows.slice(1).map((row) => row[0])).toEqual(['1a', '1b']);
	});

	it('falls back to Tier 1 and Tier 2 when a tier has no printed name', () => {
		const document = paired({
			tiers: [
				tier({ breakdown: { entries: [entry('e1', '1a', '1', { marks: 4 })], warnings: [] } }),
				tier({
					breakdown: { entries: [entry('e2', '8a', '8', { marks: 4 })], warnings: [] }
				})
			]
		});

		const [header] = parseCsv(commonQuestionsCsvFile(document, NOW).text);

		expect(header[0]).toBe('Tier 1 question');
		expect(header[1]).toBe('Tier 2 question');
		expect(header[6]).toBe('Tier 1 facility %');
		expect(header[16]).toBe('Gap (Tier 1 − Tier 2, points)');
	});

	it('marks a pooled figure that rests on part of the class', () => {
		const document = paired();
		document.students.push(student('h3', 'Hattie', 'Higher', false, 0));

		const [, row] = parseCsv(commonQuestionsCsvFile(document, NOW).text);

		expect(row[15]).toBe('amber');
		expect(row[17]).toBe('yes');
	});

	it('is named by assessment and day', () => {
		const file = commonQuestionsCsvFile(paired(), NOW);

		expect(file.filename).toBe('qla-common-questions-10x-ph1-2026-01-01.csv');
		expect(file.type).toBe('text/csv');
	});
});

describe('PDF filenames', () => {
	it('follow the report and analysis conventions', () => {
		const document = marksheet();
		const ada = document.students[0];

		expect(reportPdfFilename(document, ada, NOW)).toBe(
			'qla-report-10x-ph1-ada-lovelace-2026-01-01.pdf'
		);
		expect(exportFilename('reports', document, NOW, 'pdf')).toBe(
			'qla-reports-10x-ph1-2026-01-01.pdf'
		);
		expect(exportFilename('reports', document, NOW, 'zip')).toBe(
			'qla-reports-10x-ph1-2026-01-01.zip'
		);
		expect(exportFilename('analysis', document, NOW, 'pdf')).toBe(
			'qla-analysis-10x-ph1-2026-01-01.pdf'
		);
	});
});
