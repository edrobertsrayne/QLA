// Who gets a report: not absent, every entry marked, no mark over the
// maximum. Shared by the browser (Who gets one names the blocked students)
// and, through the generation-input builder, the shape the server checks.
//
// A blocked student carries the reason in words the teacher acts on.

import { isOverMax, type BreakdownEntry, type MarksheetDocument } from './document.js';

/** Why a student gets no report, in the words the step shows them with. */
export type ReportBlocker =
	| { kind: 'absent' }
	| { kind: 'unmarked'; entries: BreakdownEntry[] }
	| { kind: 'over-max'; entries: BreakdownEntry[] };

/** One reason a blocked student is blocked, as the Who gets one step names it. */
export function blockerText(blocker: ReportBlocker): string {
	switch (blocker.kind) {
		case 'absent':
			return 'Absent';
		case 'unmarked': {
			const labels = blocker.entries.slice(0, 4).map((entry) => entry.label);
			const more = blocker.entries.length > 4 ? '…' : '';
			return `${blocker.entries.length} unmarked (${labels.join(', ')}${more})`;
		}
		case 'over-max':
			return `Mark over max on (${blocker.entries.map((entry) => entry.label).join(', ')})`;
	}
}

/** One student, and why they do or do not get a report. */
export interface EligibilityRow {
	studentId: string;
	eligible: boolean;
	blockers: ReportBlocker[];
}

/** Why one student is blocked: absent, unmarked entries, over-max entries. */
export function blockersFor(document: MarksheetDocument, studentId: string): ReportBlocker[] {
	const student = document.students.find((candidate) => candidate.id === studentId);
	if (!student) return [];
	if (student.absent) return [{ kind: 'absent' }];
	const marks = document.marks[studentId] ?? {};
	const blockers: ReportBlocker[] = [];
	const unmarked = document.breakdown.entries.filter((entry) => marks[entry.id] === undefined);
	if (unmarked.length > 0) blockers.push({ kind: 'unmarked', entries: unmarked });
	const overMax = document.breakdown.entries.filter(
		(entry) => marks[entry.id] !== undefined && isOverMax(marks[entry.id], entry)
	);
	if (overMax.length > 0) blockers.push({ kind: 'over-max', entries: overMax });
	return blockers;
}

/** Whether one student gets a report: no blockers at all. */
export function isEligible(document: MarksheetDocument, studentId: string): boolean {
	return blockersFor(document, studentId).length === 0;
}

/** Every student, and why each does or does not get a report. */
export function eligibilityRows(document: MarksheetDocument): EligibilityRow[] {
	return document.students.map((student) => {
		const blockers = blockersFor(document, student.id);
		return { studentId: student.id, eligible: blockers.length === 0, blockers };
	});
}
