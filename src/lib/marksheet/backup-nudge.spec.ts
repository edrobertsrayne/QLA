import { describe, expect, it } from 'vitest';
import type { MarksheetDocument } from './document.js';
import { confirmed, NOW_DATE, ago } from './fixtures.spec-helpers.js';
import { backupNudge } from './backup-nudge.js';

function marksheet(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
	return confirmed({
		lastExportedAt: ago(5),
		firstUnbackedChangeAt: ago(4),
		...overrides
	});
}

describe('backupNudge', () => {
	it('says nothing while the oldest unbacked change is two days old or younger', () => {
		expect(backupNudge(marksheet({ firstUnbackedChangeAt: ago(2) }), NOW_DATE)).toBeNull();
	});

	it('names how old the oldest unbacked change is once it is past two days', () => {
		expect(backupNudge(marksheet({ firstUnbackedChangeAt: ago(2, 1) }), NOW_DATE)).toEqual({
			days: 2
		});
		expect(backupNudge(marksheet({ firstUnbackedChangeAt: ago(3) }), NOW_DATE)).toEqual({
			days: 3
		});
	});

	it('nudges a document that has never been backed up from its creation', () => {
		expect(
			backupNudge(
				marksheet({ lastExportedAt: null, firstUnbackedChangeAt: null, createdAt: ago(4) }),
				NOW_DATE
			)
		).toEqual({ days: 4 });
	});

	it('nudges a document whose backup moment cannot be read as never backed up', () => {
		expect(
			backupNudge(
				marksheet({
					lastExportedAt: 'not a date',
					firstUnbackedChangeAt: null,
					createdAt: ago(4)
				}),
				NOW_DATE
			)
		).toEqual({ days: 4 });
	});

	it('says nothing once a backup holds every change', () => {
		expect(backupNudge(marksheet({ firstUnbackedChangeAt: null }), NOW_DATE)).toBeNull();
	});

	it('says nothing when the creation moment of a never-backed-up document cannot be read', () => {
		expect(
			backupNudge(
				marksheet({ lastExportedAt: null, firstUnbackedChangeAt: null, createdAt: 'x' }),
				NOW_DATE
			)
		).toBeNull();
	});
});
