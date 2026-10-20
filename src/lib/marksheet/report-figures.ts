// One student's figures for their report: totals, the roll-up by topic name
// and by assessment objective, and each entry's band. Pure functions over a
// stored document — no I/O, no reactive state — shared by the browser (live
// figures on the page) and the server (the roll-up the model receives).
//
// The topic roll-up is shared through `report-rollup.ts`. Topics are grouped
// by name, so codes that share a name share a row. Entries with no
// specification point count only toward their assessment objective.

import { facilityBand, type RagBand } from './analysis.js';
import { totalMarks, type MarksheetDocument } from './document.js';
import { rollupByTopic, topicNamesFor } from './report-rollup.js';

/** One roll-up row: marks summed over the entries carrying the key. */
export interface RollupRow {
	key: string;
	name: string;
	gained: number;
	available: number;
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

/** Every figure on one student's report, calculated locally from the document. */
export interface StudentReportFigures {
	total: number;
	available: number;
	percent: number;
	topics: RollupRow[];
	aos: RollupRow[];
	entries: ReportEntryFigures[];
}

function addTo(
	map: Map<string, { gained: number; available: number }>,
	key: string,
	gained: number,
	available: number
): void {
	const row = map.get(key) ?? { gained: 0, available: 0 };
	row.gained += gained;
	row.available += available;
	map.set(key, row);
}

function rowOf(key: string, name: string, gained: number, available: number): RollupRow {
	const share = available === 0 ? 0 : gained / available;
	return { key, name, gained, available, share, band: facilityBand(share) };
}

function toRows(
	map: Map<string, { gained: number; available: number }>,
	name: (key: string) => string
): RollupRow[] {
	return [...map].map(([key, value]) => rowOf(key, name(key), value.gained, value.available));
}

/** Every figure on one student's report, from the document as it stands. */
export function reportFiguresFor(
	document: MarksheetDocument,
	studentId: string
): StudentReportFigures {
	const marks = document.marks[studentId] ?? {};
	const entries = document.breakdown.entries;
	const topicEntries: { topics: string[]; gained: number; available: number }[] = [];
	const aos = new Map<string, { gained: number; available: number }>();
	const entryFigures: ReportEntryFigures[] = [];
	let total = 0;

	for (const entry of entries) {
		const gained = marks[entry.id] ?? 0;
		const available = entry.marks ?? 0;
		total += gained;
		topicEntries.push({ topics: topicNamesFor(document, entry.specPoint), gained, available });
		if (entry.ao) addTo(aos, entry.ao, gained, available);
		const share = available === 0 ? 0 : gained / available;
		entryFigures.push({
			entryId: entry.id,
			label: entry.label,
			gained,
			available,
			band: facilityBand(share)
		});
	}

	const available = totalMarks(entries);
	return {
		total,
		available,
		percent: available === 0 ? 0 : Math.round((total / available) * 100),
		topics: rollupByTopic(topicEntries).map((row) =>
			rowOf(row.name, row.name, row.gained, row.available)
		),
		aos: toRows(aos, (ao) => ao),
		entries: entryFigures
	};
}
