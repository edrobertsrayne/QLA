// One student's figures for their report: totals, the roll-up by topic name
// and by assessment objective, and each entry's band. Pure functions over a
// stored document — no I/O, no reactive state — shared by the browser (live
// figures on the page) and the server (the roll-up the model receives).
//
// The roll-up is shared through `report-rollup.ts`. Topics are grouped
// by name, so codes that share a name share a row. Entries with no
// specification point count only toward their assessment objective.

import { assessmentObjectiveOf } from '$lib/parse/assessment-objectives.js';
import { facilityBand, type RagBand } from './analysis.js';
import { studentTotal, totalMarks, type MarksheetDocument } from './document.js';
import { rollupBy, topicNamesFor, type RollupTotals } from './report-rollup.js';

/** One roll-up row: marks summed over the entries carrying the name. */
export interface RollupRow extends RollupTotals {
	/** Shown beside the name on the page only: the AO description, never sent to the model. */
	description: string | null;
	share: number;
	band: RagBand;
}

/** The app's own line where a section has nothing generated to show: app text, not model text. */
export const EMPTY_STRENGTHS_LINE = 'No particular strengths stood out on this paper.';
export const EMPTY_AREAS_LINE =
	'You dropped no marks on this paper: keep doing what you are doing.';

/** Whether the student gained every mark: the only time the app's no-areas line is true. */
export function droppedNoMarks(figures: StudentReportFigures): boolean {
	return figures.total >= figures.available;
}

/** One entry's figures on a report: what the student gained, and its band. */
export interface ReportEntryFigures {
	entryId: string;
	label: string;
	gained: number;
	available: number;
	band: RagBand;
}

/** A roll-up's share of marks gained (0 when nothing is available) and its band. */
function shareOf(gained: number, available: number): { share: number; band: RagBand } {
	const share = available === 0 ? 0 : gained / available;
	return { share, band: facilityBand(share) };
}

function toRow(totals: RollupTotals): RollupRow {
	return { ...totals, description: null, ...shareOf(totals.gained, totals.available) };
}

/** The description of the assessment objective a roll-up row is named for, if it has one. */
function descriptionOf(document: MarksheetDocument, name: string): string | null {
	const ao = assessmentObjectiveOf(name);
	return (ao && document.breakdown.aoDescriptions[ao]) || null;
}

/** Every figure on one student's report, calculated locally from the document. */
export interface StudentReportFigures {
	total: number;
	available: number;
	percent: number;
	topics: RollupRow[];
	aos: RollupRow[];
	entries: ReportEntryFigures[];
}

/** Every figure on one student's report, from the document as it stands. */
export function reportFiguresFor(
	document: MarksheetDocument,
	studentId: string
): StudentReportFigures {
	const marks = document.marks[studentId] ?? {};
	const rows = document.breakdown.entries.map((entry) => ({
		entry,
		gained: marks[entry.id] ?? 0,
		available: entry.marks ?? 0
	}));

	const available = totalMarks(document.breakdown.entries);
	const total = studentTotal(document, studentId);
	return {
		total,
		available,
		percent: available === 0 ? 0 : Math.round((total / available) * 100),
		topics: rollupBy(rows, (row) => topicNamesFor(document, row.entry.specPoint)).map(toRow),
		aos: rollupBy(rows, (row) => (row.entry.ao ? [row.entry.ao] : [])).map((totals) => ({
			...toRow(totals),
			description: descriptionOf(document, totals.name)
		})),
		entries: rows.map(({ entry, gained, available }) => ({
			entryId: entry.id,
			label: entry.label,
			gained,
			available,
			band: shareOf(gained, available).band
		}))
	};
}
