// What an undo notice says about the change it offers to take back.

import type { MarksheetDocument } from './document.js';
import { studentName } from './students.js';
import type { Undoable } from './store.svelte.js';

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
