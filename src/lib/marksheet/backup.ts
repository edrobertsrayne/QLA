// What the app knows about backups: when one was taken, when the oldest change
// it does not hold was made, and what a backup file contains.
//
// Kept away from the components and free of I/O, so every age boundary is
// testable without a browser — including the day the only copy left matters.

import { markCount, parseStoredDocument, type MarksheetDocument } from './document.js';

/** A stored moment as a date, or null when it holds none that can be read. */
function readMoment(recorded: string | null): Date | null {
	if (recorded === null) return null;
	const at = new Date(recorded);
	return Number.isNaN(at.getTime()) ? null : at;
}

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
 * Where the document stands against its last backup: never backed up (no
 * moment, or one that cannot be read), backed up with nothing unbacked since,
 * or backed up with the oldest unbacked change named.
 */
export type BackupState =
	| { kind: 'never'; changedAt: Date | null }
	| { kind: 'clean'; takenAt: Date }
	| { kind: 'unbacked'; takenAt: Date; changedAt: Date };

/**
 * The document's backup state, the one definition every surface reads: the
 * control's button, caption and title, and the nudge toast. A document that
 * has never been backed up counts as changed from the moment it was created.
 */
export function backupState(document: MarksheetDocument): BackupState {
	const takenAt = readMoment(document.lastExportedAt);
	if (takenAt === null) return { kind: 'never', changedAt: readMoment(document.createdAt) };
	const changedAt = readMoment(document.firstUnbackedChangeAt);
	return changedAt === null ? { kind: 'clean', takenAt } : { kind: 'unbacked', takenAt, changedAt };
}

/**
 * When the document says its backup was taken, or null when there is none to
 * trust: a document with an unreadable moment is treated as never backed up,
 * which nudges rather than reassures.
 */
export function backupTakenAt(document: MarksheetDocument): Date | null {
	const state = backupState(document);
	return state.kind === 'never' ? null : state.takenAt;
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
