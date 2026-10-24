// What a class's marks say about each entry: the facility index it earned, the
// band that puts it in, and how much of the class the figure rests on.
//
// Pure functions over a stored document — no I/O and no reactive state — so the
// arithmetic is testable on its own and every surface that shows a figure
// derives it the same way. Nothing here is stored: the analysis is recomputed
// from the document as it stands, so there is no run step and no stale figures.

import { entryName } from './breakdown.js';
import {
	isOverMax,
	pairOfEntry,
	tierEntries,
	type BreakdownEntry,
	type CommonQuestion,
	type MarksheetDocument,
	type StoredStudent,
	type TierIndex
} from './document.js';

/** Below this facility, a question is one to reteach. */
export const RED_BELOW = 0.4;
/** From this facility up, a question is secure. */
export const GREEN_FROM = 0.7;

/** What a facility index means, by fixed thresholds that are the same on every paper. */
export type RagBand = 'red' | 'amber' | 'green';

/** The band a facility index falls in. The thresholds are absolute, never relative to the class. */
export function facilityBand(facility: number): RagBand {
	if (facility < RED_BELOW) return 'red';
	if (facility < GREEN_FROM) return 'amber';
	return 'green';
}

/** A facility index as the whole percentage a teacher reads. */
export function facilityPercent(facility: number): number {
	return Math.round(facility * 100);
}

/**
 * Why an entry has no facility: its available marks are unknown, or no counted
 * mark counts towards one — an entry whose only marks are above its available
 * marks is not scored, and says so rather than reading as unmarked.
 */
export type NotScoredReason = 'no-available-marks' | 'no-counted-marks';

/** How far one entry has been marked across the class. */
export interface EntryCoverage {
	/** Non-absent students with a mark on the entry, whatever that mark is. */
	marked: number;
	/** Non-absent students: the class the entry is measured over. */
	of: number;
	/** The figure rests on part of the class, so it is worth reading as an estimate. */
	partMarked: boolean;
}

/** One entry's figures, as the document stands. */
export interface EntryAnalysis {
	entry: BreakdownEntry;
	/** Marks the facility is taken over: present, in range, not absent. */
	counted: number;
	/** Mean of the counted marks, or null when there are none. */
	mean: number | null;
	/** Mean counted mark ÷ available marks, or null when the entry is not scored. */
	facility: number | null;
	/** The band the facility falls in, or null when the entry is not scored. */
	band: RagBand | null;
	coverage: EntryCoverage;
	/** Marks above the entry's available marks: kept in the sheet, left out of the figures. */
	overMax: number;
	/** Why there is no facility, or null when there is one. */
	notScored: NotScoredReason | null;
}

/** What the class's marks add up to, stated beside the figures they produced. */
export interface AnalysisSummary {
	/** Non-absent students, whose marks every figure is counted over. */
	studentsCounted: number;
	/** Students left out of every figure by their absent flag. */
	absentExcluded: number;
	/** Marks counted towards the figures; over-max marks are not among them. */
	marksCounted: number;
	/** Entries whose figure rests on part of the class. */
	partMarked: number;
	/** Entries carrying a mark above their available marks, which no figure counts. */
	invalid: number;
}

/** Every entry's figures, as the analysis view and the facility row read them. */
export interface MarksheetAnalysis {
	/** One per breakdown entry, in breakdown order. */
	entries: EntryAnalysis[];
	/** The same entries worst first: red, amber, green, then the ones not scored. */
	ordered: EntryAnalysis[];
	/** The red entries worst first, as many as a strip can name. */
	hardest: EntryAnalysis[];
	summary: AnalysisSummary;
}

/** How many red entries the Hardest strip names. */
export const HARDEST_LIMIT = 8;

/** The order the bands are read in: what needs reteaching comes first. */
const BAND_ORDER: Record<RagBand, number> = { red: 0, amber: 1, green: 2 };

/** The rank entries not scored are read at: last, in the order the paper has them. */
const NOT_SCORED_RANK = 3;

function bandRank(analysis: EntryAnalysis): number {
	return analysis.band === null ? NOT_SCORED_RANK : BAND_ORDER[analysis.band];
}

/** Worst first within a band; entries with no facility keep the order the paper has them in. */
function worstFirst(a: EntryAnalysis, b: EntryAnalysis): number {
	const rank = bandRank(a) - bandRank(b);
	if (rank !== 0) return rank;
	if (a.facility === null || b.facility === null) return 0;
	return a.facility - b.facility;
}

/**
 * One entry's figures over the class as it stands.
 *
 * `presentStudents` is the class with the absent already left out: an absent
 * student's marks count nowhere, and clearing the flag is what brings them back.
 *
 * A mark above the available marks is a typo rather than a mark: it is left out
 * of the mean rather than capped into a figure nobody earned, and it is counted
 * so the entry can be shown as invalid until it is fixed.
 */
function analyseEntry(
	entry: BreakdownEntry,
	presentStudents: readonly StoredStudent[],
	marks: MarksheetDocument['marks']
): EntryAnalysis {
	const available = entry.marks;
	// An entry with no available marks has nothing to measure a mark against, so
	// no mark can count towards a facility however it is entered.
	const measurable = available !== null && available > 0;

	let counted = 0;
	let sum = 0;
	let overMax = 0;
	let marked = 0;
	for (const student of presentStudents) {
		const mark = marks[student.id]?.[entry.id];
		if (mark === undefined) continue;
		// Any mark at all is the entry marked for that student, which is what
		// coverage reports, whether or not the figure can count it.
		marked += 1;
		if (!measurable) continue;
		if (isOverMax(mark, entry)) {
			overMax += 1;
			continue;
		}
		counted += 1;
		sum += mark;
	}

	const mean = counted === 0 ? null : sum / counted;
	const facility = measurable && mean !== null ? mean / available : null;
	return {
		entry,
		counted,
		mean,
		facility,
		band: facility === null ? null : facilityBand(facility),
		coverage: {
			marked,
			of: presentStudents.length,
			// An entry nobody has marked yet is not scored rather than part-marked:
			// there is no figure on part of the class for a coverage to qualify.
			partMarked: facility !== null && marked < presentStudents.length
		},
		overMax,
		notScored: !measurable ? 'no-available-marks' : counted === 0 ? 'no-counted-marks' : null
	};
}

/**
 * What an entry with no figure is called, in the words its reason means. Marks
 * may be entered and none of them count — every one above the available marks —
 * so "not marked yet" is only true when nothing has been entered at all.
 */
export function notScoredLabel(row: EntryAnalysis): string {
	if (row.notScored === 'no-available-marks') return 'No available marks';
	return row.coverage.marked === 0 ? 'Not marked yet' : 'No mark within the available marks';
}

/**
 * What one entry's figure rests on, for the cell that shows it: the cell is
 * the whole width of a narrow column, so the detail is the title's to carry.
 */
export function facilityDescription(row: EntryAnalysis): string {
	const lines = [`${entryName(row.entry)} — ${row.entry.summary}`];
	if (row.facility === null) {
		lines.push(notScoredLabel(row));
	} else {
		lines.push(
			`Facility ${facilityPercent(row.facility)}%${
				row.coverage.partMarked
					? ` — part-marked, ${row.coverage.marked} of ${row.coverage.of}`
					: ''
			}`
		);
	}
	if (row.overMax > 0) lines.push(`${row.overMax} above the available marks — not counted`);
	lines.push('Click to read the analysis');
	return lines.join('\n');
}

/** One tier's entries' figures over that tier's class, and what they add up to. */
export function analyseTier(
	document: MarksheetDocument | null,
	tier: TierIndex
): MarksheetAnalysis {
	if (document === null) {
		return {
			entries: [],
			ordered: [],
			hardest: [],
			summary: {
				studentsCounted: 0,
				absentExcluded: 0,
				marksCounted: 0,
				partMarked: 0,
				invalid: 0
			}
		};
	}

	const entries = tierEntries(document, tier);
	const tierStudents = document.students.filter((student) => student.tier === tier);
	const presentStudents = tierStudents.filter((student) => !student.absent);
	const analysed = entries.map((entry) => analyseEntry(entry, presentStudents, document.marks));
	// `sort` is stable, so entries of a figure keep the order the paper has them in.
	const ordered = [...analysed].sort(worstFirst);
	return {
		entries: analysed,
		ordered,
		hardest: ordered.filter((analysis) => analysis.band === 'red').slice(0, HARDEST_LIMIT),
		summary: {
			studentsCounted: presentStudents.length,
			absentExcluded: tierStudents.length - presentStudents.length,
			marksCounted: analysed.reduce((total, analysis) => total + analysis.counted, 0),
			partMarked: analysed.filter((analysis) => analysis.coverage.partMarked).length,
			invalid: analysed.filter((analysis) => analysis.overMax > 0).length
		}
	};
}

/** The pooled figure for a pair: both tiers' marks over both tiers' students. */
export interface PooledAnalysis {
	/** Both tiers' counted marks over both tiers' students × available marks; null until each tier has a counted mark and both entries offer the same available marks. */
	facility: number | null;
	/** The band the pooled facility falls in, or null when there is no figure. */
	band: RagBand | null;
	/** Students on either tier with any mark on their side of the pair. */
	marked: number;
	/** Present students on either tier: the class the figure is measured over. */
	of: number;
	/** The pooled figure rests on part of both tiers' classes. */
	partMarked: boolean;
}

/** One common question: each tier's own figures, the pooled figure and the gap. */
export interface CommonQuestionAnalysis {
	pair: CommonQuestion;
	tier1: { entry: BreakdownEntry; analysis: EntryAnalysis };
	tier2: { entry: BreakdownEntry; analysis: EntryAnalysis };
	pooled: PooledAnalysis;
	/** Tier 1 facility minus Tier 2 facility in signed whole percentage points; null unless both are scored. */
	gap: number | null;
}

/**
 * Every confirmed pair's figures, in Tier 1's paper order: the order the
 * common-questions view reads them in, and the order `paper` sorting keeps.
 * A pair whose entry is missing from its tier is left out; nothing can be
 * compared for it.
 */
export function analyseCommonQuestions(document: MarksheetDocument): CommonQuestionAnalysis[] {
	const tier1 = analyseTier(document, 0);
	const tier2 = analyseTier(document, 1);
	const tier2ById = new Map<string, EntryAnalysis>();
	for (const row of tier2.entries) tier2ById.set(row.entry.id, row);

	const rows: CommonQuestionAnalysis[] = [];
	for (const row of tier1.entries) {
		const pair = pairOfEntry(document, 0, row.entry.id);
		if (pair === null) continue;
		const other = tier2ById.get(pair.tier2EntryId);
		if (other === undefined) continue;

		const available = row.entry.marks;
		const counted = row.counted + other.counted;
		const sum = (row.mean ?? 0) * row.counted + (other.mean ?? 0) * other.counted;
		// Both sides need a counted mark and the same available marks: otherwise
		// the pooled figure would compare two different questions.
		const comparable =
			row.counted > 0 &&
			other.counted > 0 &&
			available !== null &&
			available > 0 &&
			other.entry.marks === available;
		const facility = comparable ? sum / counted / available : null;
		const marked = row.coverage.marked + other.coverage.marked;
		const of = row.coverage.of + other.coverage.of;

		rows.push({
			pair,
			tier1: { entry: row.entry, analysis: row },
			tier2: { entry: other.entry, analysis: other },
			pooled: {
				facility,
				band: facility === null ? null : facilityBand(facility),
				marked,
				of,
				partMarked: facility !== null && marked < of
			},
			gap:
				row.facility !== null && other.facility !== null
					? facilityPercent(row.facility) - facilityPercent(other.facility)
					: null
		});
	}
	return rows;
}

/** How the common-questions view orders its rows. */
export type CommonQuestionOrder = 'gap' | 'pooled' | 'paper';

/**
 * The common questions in the order the teacher asked for: biggest absolute
 * gap first, lowest pooled facility first, or Tier 1's paper order. Rows with
 * no figure go last; ties keep their paper order.
 */
export function sortCommonQuestions(
	rows: readonly CommonQuestionAnalysis[],
	order: CommonQuestionOrder
): CommonQuestionAnalysis[] {
	if (order === 'paper') return [...rows];
	return [...rows].sort((a, b) => {
		if (order === 'gap') {
			if (a.gap === null && b.gap === null) return 0;
			if (a.gap === null) return 1;
			if (b.gap === null) return -1;
			return Math.abs(b.gap) - Math.abs(a.gap);
		}
		const pooledA = a.pooled.facility;
		const pooledB = b.pooled.facility;
		if (pooledA === null && pooledB === null) return 0;
		if (pooledA === null) return 1;
		if (pooledB === null) return -1;
		return pooledA - pooledB;
	});
}
