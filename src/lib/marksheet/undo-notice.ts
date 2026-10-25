// What an undo notice says about the change it offers to take back.

import type { MarksheetDocument, TierIndex } from './document.js';
import { studentName } from './students.js';

/**
 * The one change undo would take back, held in memory for the session. The next
 * change clears it, so a second click can never take back two things. Each kind
 * carries the whole document as it was before the change.
 */
export type UndoableChange =
	| {
			kind: 'entry-removal' | 'student-removal';
			/** What the notice calls what went. */
			name: string;
	  }
	/** A paste or a class-list upload: the paste notice speaks for it. */
	| { kind: 'mark-paste' }
	/** A student put on another tier, or back to no tier. */
	| { kind: 'student-tier'; name: string; to: TierIndex | null }
	/** A common question added, changed or cleared. */
	| { kind: 'common-question' }
	| { kind: 'report-edit'; studentId: string }
	| { kind: 'report-kept'; studentId: string }
	| { kind: 'grade-boundaries'; action: 'saved' | 'removed' };

/** An undoable change with the whole document as it was before it. */
export type Undoable = UndoableChange & { before: MarksheetDocument };

/** What an undo notice says: a verb phrase, then the bolded thing it is about (if any). */
export interface UndoNotice {
	verb: string;
	subject: string | null;
}

/** The notice for an undoable change; null for a paste (the paste notice speaks for it). */
export function undoNotice(undoable: Undoable, document: MarksheetDocument): UndoNotice | null {
	switch (undoable.kind) {
		case 'entry-removal':
			return { verb: 'Deleted', subject: undoable.name };
		case 'student-removal':
			return { verb: 'Removed', subject: undoable.name };
		case 'mark-paste':
			return null;
		case 'student-tier':
			return {
				verb: 'Moved',
				subject: `${undoable.name} to ${destinationLabel(document, undoable.to)}`
			};
		case 'common-question':
			return { verb: 'Changed common questions', subject: null };
		case 'grade-boundaries':
			return {
				verb: undoable.action === 'saved' ? 'Grade boundaries saved' : 'Grade boundaries removed',
				subject: null
			};
		case 'report-kept':
			return { verb: 'Kept wording for', subject: nameOrReport(document, undoable.studentId) };
		case 'report-edit':
			return {
				verb: document.reports[undoable.studentId]?.edit !== null ? 'Edited' : 'Reverted',
				subject: nameOrReport(document, undoable.studentId)
			};
	}
}

function nameOrReport(document: MarksheetDocument, studentId: string): string {
	const student = document.students.find((candidate) => candidate.id === studentId);
	const name = student ? studentName(student) : '';
	return name === '' ? 'a report' : name;
}

/** Where a moved student went: the printed tier name, its number, or the unplaced tab. */
function destinationLabel(document: MarksheetDocument, tier: TierIndex | null): string {
	if (tier === null) return 'Tier not set';
	const name = document.tiers[tier]?.tierName?.trim() ?? '';
	return name === '' ? `Tier ${tier + 1}` : name;
}

/**
 * The document with `undoable`'s change taken back. A backup taken since the
 * change is not taken back with it, nor is the change it holds: a moment the
 * backup already covers is not unbacked.
 */
export function withChangeUndone(
	document: MarksheetDocument,
	undoable: Undoable
): MarksheetDocument {
	const restored = { ...undoable.before, lastExportedAt: document.lastExportedAt };
	const marker = restored.firstUnbackedChangeAt;
	const backedUpAt = restored.lastExportedAt;
	if (marker !== null && backedUpAt !== null && Date.parse(marker) <= Date.parse(backedUpAt)) {
		restored.firstUnbackedChangeAt = null;
	}
	return restored;
}
