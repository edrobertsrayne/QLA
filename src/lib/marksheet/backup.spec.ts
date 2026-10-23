import { describe, expect, it } from 'vitest';
import type { MarksheetDocument } from './document.js';
import { backupState, backupTakenAt, readBackup } from './backup.js';
import { confirmed, entry, student, tier, writtenAsV2, ago } from './fixtures.spec-helpers.js';

function marksheet(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
	return confirmed({
		className: '10C1',
		tiers: [
			tier({
				breakdown: {
					entries: [entry('entry-1', '2bii', '2')],
					warnings: []
				}
			})
		],
		students: [student('student-1', 'Ada', 'Lovelace'), student('student-2', 'Grace', 'Hopper')],
		marks: { 'student-1': { 'entry-1': 3 } },
		...overrides
	});
}

describe('backupTakenAt', () => {
	it('reads the moment the document records, or nothing when it holds none', () => {
		expect(backupTakenAt(marksheet())).toBeNull();
		expect(backupTakenAt(marksheet({ lastExportedAt: ago(3) }))?.toISOString()).toBe(ago(3));
	});

	it('treats a moment it cannot read as no backup at all', () => {
		expect(backupTakenAt(marksheet({ lastExportedAt: 'not a date' }))).toBeNull();
	});
});

describe('backupState', () => {
	it('counts a document that has never been backed up as changed from the moment it was created', () => {
		expect(backupState(marksheet({ createdAt: ago(3) }))).toEqual({
			kind: 'never',
			changedAt: new Date(ago(3))
		});
	});

	it('treats a backup moment it cannot read as never backed up', () => {
		expect(backupState(marksheet({ lastExportedAt: 'not a date', createdAt: ago(3) }))).toEqual({
			kind: 'never',
			changedAt: new Date(ago(3))
		});
	});

	it('names the oldest change the last backup does not hold', () => {
		expect(
			backupState(marksheet({ lastExportedAt: ago(1), firstUnbackedChangeAt: ago(0.5) }))
		).toEqual({
			kind: 'unbacked',
			takenAt: new Date(ago(1)),
			changedAt: new Date(ago(0.5))
		});
	});

	it('reads a backup that holds every change as clean', () => {
		expect(backupState(marksheet({ lastExportedAt: ago(1) }))).toEqual({
			kind: 'clean',
			takenAt: new Date(ago(1))
		});
	});

	it('treats an unreadable moment for the oldest change as nothing unbacked', () => {
		expect(backupState(marksheet({ lastExportedAt: ago(1), firstUnbackedChangeAt: 'x' }))).toEqual({
			kind: 'clean',
			takenAt: new Date(ago(1))
		});
	});

	it('counts only marks on the tier a student sits', () => {
		const document = marksheet({
			tiers: [
				tier({ breakdown: { entries: [entry('entry-1', '1a', '1')], warnings: [] } }),
				tier({ breakdown: { entries: [entry('entry-2', '8a', '8')], warnings: [] } })
			],
			students: [
				student('student-1', 'Ada', 'Lovelace', false, 0),
				student('student-2', 'Grace', 'Hopper', false, null)
			],
			marks: {
				'student-1': { 'entry-1': 1, 'entry-2': 2 },
				'student-2': { 'entry-2': 3 }
			}
		});

		// student-1's Foundation mark is kept but uncounted; student-2's mark counts.
		expect(readBackup(JSON.stringify(document))?.summary.marks).toBe(2);
	});
});

describe('readBackup', () => {
	it('reads what the restore confirm names: paper, class, students, marks and age', () => {
		const document = marksheet({ lastExportedAt: ago(3) });

		expect(readBackup(JSON.stringify(document))?.summary).toEqual({
			paperLabel: '10X Ph1',
			className: '10C1',
			students: 2,
			marks: 1,
			takenAt: new Date(ago(3))
		});
	});

	it('reads a document with nothing in it yet', () => {
		const document = marksheet({
			label: null,
			className: null,
			students: [],
			marks: {}
		});

		expect(readBackup(JSON.stringify(document))?.summary).toEqual({
			paperLabel: null,
			className: null,
			students: 0,
			marks: 0,
			takenAt: null
		});
	});

	it('reads a backup file written before changes were tracked', () => {
		const written = writtenAsV2(marksheet({ lastExportedAt: ago(3), updatedAt: ago(2) }));

		const read = readBackup(JSON.stringify(written));

		expect(read?.summary.takenAt).toEqual(new Date(ago(3)));
		expect(read?.document.firstUnbackedChangeAt).toBe(ago(2));
	});

	it('rejects anything that is not one of our documents', () => {
		expect(readBackup('not json at all')).toBeNull();
		expect(readBackup('{"schemaVersion":99}')).toBeNull();
		// A document of ours with a field of the wrong type is not one either.
		expect(readBackup(JSON.stringify({ ...marksheet(), students: 'nobody' }))).toBeNull();
	});
});
