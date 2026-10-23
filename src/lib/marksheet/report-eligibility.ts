// Who gets a report: not absent, every entry marked, no mark over the
// maximum. Shared by the browser (Who gets one names the blocked students)
// and, through the generation-input builder, the shape the server checks.
//
// A blocked student carries the reason in words the teacher acts on.

import {
	entriesOfStudent,
	isOverMax,
	type BreakdownEntry,
	type MarksheetDocument
} from './document.js';

/** Why a student gets no report, in the words the step shows them with. */
export type ReportBlocker =
	| { kind: 'no-tier' }
	| { kind: 'absent' }
	| { kind: 'unmarked'; entries: BreakdownEntry[] }
	| { kind: 'over-max'; entries: BreakdownEntry[] };

/** One reason a blocked student is blocked, as the Who gets one step names it. */
export function blockerText(blocker: ReportBlocker): string {
	switch (blocker.kind) {
		case 'no-tier':
			return 'No tier set';
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

/** Why one student is blocked: no tier, absent, unmarked entries, over-max entries. */
export function blockersFor(document: MarksheetDocument, studentId: string): ReportBlocker[] {
	const student = document.students.find((candidate) => candidate.id === studentId);
	if (!student) return [];
	// A student with no tier has no paper to write about: that comes before
	// every other reason, because no report exists for them to miss.
	if (student.tier === null) return [{ kind: 'no-tier' }];
	if (student.absent) return [{ kind: 'absent' }];
	const entries = entriesOfStudent(document, student);
	const marks = document.marks[studentId] ?? {};
	const blockers: ReportBlocker[] = [];
	const unmarked = entries.filter((entry) => marks[entry.id] === undefined);
	if (unmarked.length > 0) blockers.push({ kind: 'unmarked', entries: unmarked });
	const overMax = entries.filter(
		(entry) => marks[entry.id] !== undefined && isOverMax(marks[entry.id], entry)
	);
	if (overMax.length > 0) blockers.push({ kind: 'over-max', entries: overMax });
	return blockers;
}

/** Whether one student gets a report: no blockers at all. */
export function isEligible(document: MarksheetDocument, studentId: string): boolean {
	return blockersFor(document, studentId).length === 0;
}
