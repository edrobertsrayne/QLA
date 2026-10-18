import { describe, expect, it } from 'vitest';
import { CORRUPT_KEY_PREFIX, DOCUMENT_SCHEMA_VERSION } from './document.js';
import type { MarksheetDocument } from './document.js';
import { backupFile, corruptFile } from './download.js';

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
			parsedAt: NOW.toISOString()
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
					ao: 'AO1'
				}
			],
			warnings: []
		},
		students: [{ id: 'student-1', firstName: 'Ada', surname: 'Lovelace', absent: false }],
		marks: { 'student-1': { 'entry-1': 3 } },
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
