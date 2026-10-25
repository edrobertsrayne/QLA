import { describe, expect, it } from 'vitest';
import { DOCUMENT_SCHEMA_VERSION } from './document.js';
import type { MarksheetDocument } from './document.js';
import { relativeTime, statusLine, storageNote } from './status.js';

const NOW = new Date(2026, 0, 1, 10, 0);
const secondsAgo = (seconds: number) => new Date(NOW.getTime() - seconds * 1000);

function marksheet(lastExportedAt: string | null): MarksheetDocument {
	return {
		schemaVersion: DOCUMENT_SCHEMA_VERSION,
		createdAt: NOW.toISOString(),
		updatedAt: NOW.toISOString(),
		breakdownConfirmedAt: NOW.toISOString(),
		lastExportedAt,
		firstUnbackedChangeAt: null,
		label: 'Ph1',
		className: null,
		aoDescriptions: {},
		tiers: [
			{
				tierName: null,
				sourceFilenames: ['paper.pdf'],
				parsedAt: NOW.toISOString(),
				breakdown: { entries: [], warnings: [] },
				boundaries: null,
				belowLowestLabel: 'U'
			}
		],
		students: [],
		marks: {},
		commonQuestions: [],
		topicNames: {},
		reports: {}
	};
}

describe('relativeTime', () => {
	it('reads a moment just past as just now, and a moment to come the same', () => {
		expect(relativeTime(NOW, NOW)).toBe('just now');
		expect(relativeTime(secondsAgo(9), NOW)).toBe('just now');
		// A clock that disagrees with itself is not a teacher's problem.
		expect(relativeTime(new Date(NOW.getTime() + 60_000), NOW)).toBe('just now');
	});

	it('counts seconds, then minutes, then hours, then days', () => {
		expect(relativeTime(secondsAgo(12), NOW)).toBe('12s ago');
		expect(relativeTime(secondsAgo(59), NOW)).toBe('59s ago');
		expect(relativeTime(secondsAgo(60), NOW)).toBe('1 min ago');
		expect(relativeTime(secondsAgo(45 * 60), NOW)).toBe('45 min ago');
		expect(relativeTime(secondsAgo(60 * 60), NOW)).toBe('1 h ago');
		expect(relativeTime(secondsAgo(23 * 60 * 60), NOW)).toBe('23 h ago');
	});

	it('says yesterday for a day, and counts days beyond it', () => {
		expect(relativeTime(secondsAgo(24 * 60 * 60), NOW)).toBe('yesterday');
		expect(relativeTime(secondsAgo(3 * 24 * 60 * 60), NOW)).toBe('3 days ago');
	});
});

describe('statusLine', () => {
	it('reports the last save with how long ago it landed', () => {
		expect(statusLine({ kind: 'saved', at: secondsAgo(12) }, NOW)).toEqual({
			tone: 'ok',
			text: 'All changes saved · 12s ago',
			rescue: false
		});
	});

	it('reports a save in flight', () => {
		expect(statusLine({ kind: 'saving' }, NOW)).toEqual({
			tone: 'busy',
			text: 'Saving…',
			rescue: false
		});
	});

	it('names the moment a refused write left behind, in the day the teacher reads', () => {
		const line = statusLine({ kind: 'failed', since: new Date(2026, 0, 1, 9, 5) }, NOW);

		expect(line.tone).toBe('error');
		expect(line.text).toBe("Couldn't save — changes since 09:05 are only in this tab");
		// The work is in this tab alone, so the bar has to offer it out.
		expect(line.rescue).toBe(true);
	});

	it('reads a marksheet changed in another tab like a refused write, offering the work out', () => {
		const line = statusLine({ kind: 'stale' }, NOW);

		expect(line.tone).toBe('error');
		expect(line.text).toContain('changed in another tab');
		expect(line.text).toContain('reload');
		expect(line.text).toContain("won't be kept");
		expect(line.rescue).toBe(true);
	});

	it('warns that a browser keeping nothing loses the work with the tab', () => {
		expect(statusLine({ kind: 'unavailable' }, NOW)).toEqual({
			tone: 'warn',
			text: "This browser can't store anything — work is lost when the tab closes",
			rescue: true
		});
	});
});

describe('storageNote', () => {
	it('says nothing when there is no marksheet to say it about', () => {
		expect(storageNote(null, NOW)).toBeNull();
	});

	it('names where the work is kept and how old the only copy out of it is', () => {
		expect(storageNote(marksheet(secondsAgo(3 * 24 * 60 * 60).toISOString()), NOW)).toBe(
			'Stored in this browser only · backup 3 days ago'
		);
		expect(storageNote(marksheet(NOW.toISOString()), NOW)).toBe(
			'Stored in this browser only · backup just now'
		);
	});

	it('says there is no way out at all until a backup is taken', () => {
		expect(storageNote(marksheet(null), NOW)).toBe('Stored in this browser only · no backup yet');
		expect(storageNote(marksheet('not a date'), NOW)).toBe(
			'Stored in this browser only · no backup yet'
		);
	});
});
