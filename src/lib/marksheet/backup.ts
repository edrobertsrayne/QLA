// When a backup becomes a risk worth naming, and what a backup file holds.
//
// A browser may clear a site's script-writable storage once it has gone a week
// without being used, so a copy on the teacher's disk is the only thing that
// survives it. This module keeps the rule and the reading of a backup file away
// from the components and free of I/O, so both are testable at their edges —
// including the day the window closes.

import { markCount, parseStoredDocument, type MarksheetDocument } from './document.js';

/**
 * How long a backup stands before the teacher is nudged: the window WebKit
 * gives script-writable storage without a visit.
 */
export const BACKUP_STALE_AFTER_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Why the teacher is being nudged, or nothing when there is nothing to say. */
export type BackupReminder =
	/** Marks are entered and no backup has been taken. */
	| { kind: 'never' }
	/** The last backup is past the eviction window, `days` ago. */
	| { kind: 'stale'; days: number };

/** What a backup file holds, in the terms the confirm names it back to the teacher. */
export interface BackupSummary {
	paperLabel: string | null;
	className: string | null;
	students: number;
	marks: number;
	/** The moment the file records as when it was taken, or null when it holds none to trust. */
	takenAt: Date | null;
}

/**
 * When the document says its backup was taken, or null when there is none to
 * trust: a document with marks and an unreadable moment is treated as never
 * backed up, which nudges rather than reassures.
 */
export function backupTakenAt(document: MarksheetDocument): Date | null {
	const recorded = document.lastExportedAt;
	if (recorded === null) return null;
	const at = new Date(recorded);
	return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * Whether the document holds a mark at all: the work a wipe or an eviction would take.
 */
function hasMarks(document: MarksheetDocument): boolean {
	return markCount(document) > 0;
}

/**
 * Whether the teacher should be reminded to back up: marks with no backup at
 * all, or a backup the eviction window has passed. Exactly the window is not
 * yet past it — the rule is "more than 7 days old".
 */
export function backupReminder(
	document: MarksheetDocument | null,
	now: Date
): BackupReminder | null {
	if (!document) return null;

	const takenAt = backupTakenAt(document);
	if (takenAt === null) return hasMarks(document) ? { kind: 'never' } : null;

	const ageMs = now.getTime() - takenAt.getTime();
	if (ageMs <= BACKUP_STALE_AFTER_DAYS * DAY_MS) return null;
	return { kind: 'stale', days: Math.floor(ageMs / DAY_MS) };
}

/**
 * Read a backup file as the document it holds and what it says of itself, or
 * nothing when it is not one of ours. It goes through the same validator the
 * boot gate uses, so a file QLA hands out is exactly a file QLA can boot
 * from — and anything else is refused whole, with the app left as it was.
 */
export function readBackup(
	text: string
): { document: MarksheetDocument; summary: BackupSummary } | null {
	const document = parseStoredDocument(text);
	if (!document) return null;
	return {
		document,
		summary: {
			paperLabel: document.paper.label,
			className: document.paper.className,
			students: document.students.length,
			marks: markCount(document),
			takenAt: backupTakenAt(document)
		}
	};
}
