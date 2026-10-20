// Where every student's report stands, computed once per change: the one list
// the Who, Writing and Review steps all read, so none of them recomputes
// eligibility, generation input or what is out of date for itself.

import type { MarksheetDocument } from '$lib/marksheet/document.js';
import { blockerText, blockersFor, type ReportBlocker } from '$lib/marksheet/report-eligibility.js';
import { changedInputFields, generationInputFor } from '$lib/marksheet/report-input.js';
import { studentName } from '$lib/marksheet/students.js';
import type { TileState } from './report-run.svelte.js';

export type RosterStatus =
	| { kind: 'review'; changes: string[]; edited: boolean }
	| { kind: 'blocked'; blockers: ReportBlocker[]; written: boolean }
	| { kind: 'unwritten'; tile: TileState | null };

export interface RosterRow {
	studentId: string;
	name: string;
	status: RosterStatus;
}

/** Every student in sheet order, and where their report stands. Computes each generation input once. */
export function reportRoster(
	document: MarksheetDocument,
	tiles: Readonly<Record<string, TileState>>
): RosterRow[] {
	return document.students.map((student): RosterRow => {
		const id = student.id;
		const name = studentName(student);
		const report = document.reports[id];
		const input = generationInputFor(document, id);
		if (input === null) {
			return {
				studentId: id,
				name,
				status: { kind: 'blocked', blockers: blockersFor(document, id), written: !!report }
			};
		}
		if (!report)
			return { studentId: id, name, status: { kind: 'unwritten', tile: tiles[id] ?? null } };
		return {
			studentId: id,
			name,
			status: {
				kind: 'review',
				changes: changedInputFields(report.input, input),
				edited: report.edit !== null
			}
		};
	});
}

/** The rows in one status, narrowed. */
export function rowsOf<K extends RosterStatus['kind']>(
	roster: readonly RosterRow[],
	kind: K
): (RosterRow & { status: Extract<RosterStatus, { kind: K }> })[] {
	return roster.filter(
		(row): row is RosterRow & { status: Extract<RosterStatus, { kind: K }> } =>
			row.status.kind === kind
	);
}

/** What the Review rail says beside a student without a visible page. */
export function railStatus(status: Exclude<RosterStatus, { kind: 'review' }>): string {
	if (status.kind === 'blocked') {
		if (status.written) return `Blocked (${status.blockers.map(blockerText).join(' · ')})`;
		return status.blockers.some((blocker) => blocker.kind === 'absent') ? 'Absent' : 'Blocked';
	}
	return status.tile?.kind === 'failed' ? 'Failed' : 'Not written';
}
