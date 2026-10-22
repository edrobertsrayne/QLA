// Grade boundaries for one paper: an ordered list of (grade label, minimum
// total mark), top grade first, plus the label for a total below the lowest
// boundary. Pure functions over plain values — no I/O, no reactive state — so
// the dialog, the marksheet grid and the report header share one rule; the
// commands at the end mutate a document in place for the store to commit.
//
// A row with no minimum is never stored: it reads as "not used" and is dropped
// on save. Validation works on rows as typed, so a half-typed row shows its
// problem where it is rather than refusing the keystroke.

import {
	DEFAULT_BELOW_LOWEST_LABEL,
	isOverMax,
	studentTotal,
	type GradeBoundary,
	type MarksheetDocument,
	type StoredStudent
} from './document.js';
import { progressOf } from './students.js';

/** One boundary row as typed: both fields are text until the dialog saves. */
export interface BoundaryRow {
	label: string;
	/** The lowest raw mark, blank when the grade is not used. In % mode a valid `percent` sets it, blank text clears it, and other invalid text leaves it as it was. */
	min: string;
	/** What the teacher typed in % mode, kept so a half-typed value stays visible; unset until then. */
	percent?: string;
}

/** One problem with the rows as typed, on the row it belongs to. */
export interface BoundaryIssue {
	index: number;
	field: 'label' | 'min';
	message: string;
}

/** The grade scales a teacher can start from; labels only, marks are typed. */
export const GRADE_SCALES: { name: string; labels: string[] }[] = [
	{ name: 'GCSE 9–1', labels: ['9', '8', '7', '6', '5', '4', '3', '2', '1'] },
	{
		name: 'GCSE Combined Science 9-9–1-1',
		labels: [9, 8, 7, 6, 5, 4, 3, 2, 1].flatMap((n) =>
			n === 1 ? ['1-1'] : [`${n}-${n}`, `${n}-${n - 1}`]
		)
	},
	{ name: 'A level A*–E', labels: ['A*', 'A', 'B', 'C', 'D', 'E'] },
	{ name: 'Distinction / Merit / Pass', labels: ['Distinction', 'Merit', 'Pass'] },
	{ name: 'Working at', labels: ['Greater depth', 'Expected', 'Working towards'] },
	{ name: 'Custom', labels: [] }
];

/** The raw mark a percentage of the paper total stands for, rounded up so the student must reach at least that percentage. */
export function percentToMarks(percent: number, paperTotal: number): number {
	// Round off float noise first: 50% of 80 is 40, never 40.000000000000004 → 41.
	return Math.ceil(Number(((percent * paperTotal) / 100).toFixed(9)));
}

/** A raw mark as a percentage of the paper total, unrounded; 0 when the paper has no marks. */
export function marksToPercent(marks: number, paperTotal: number): number {
	return paperTotal === 0 ? 0 : (marks * 100) / paperTotal;
}

/** A percentage for display: one decimal place, no trailing zero (54/83 → "65.1", 40/80 → "50"). */
export function formatPercent(percent: number): string {
	return String(Number(percent.toFixed(1)));
}

/** A typed percentage, 0 to 100 with optional decimals; null when it isn't one. */
export function parsePercent(text: string): number | null {
	const trimmed = text.trim();
	if (!/^(\d+\.?\d*|\.\d+)$/.test(trimmed)) return null;
	const value = Number(trimmed);
	return value <= 100 ? value : null;
}

/** Problems with percentages typed in % mode: rows with something typed that isn't 0–100. */
export function percentIssues(rows: readonly BoundaryRow[]): BoundaryIssue[] {
	const issues: BoundaryIssue[] = [];
	rows.forEach((row, index) => {
		const text = row.percent?.trim() ?? '';
		if (text !== '' && parsePercent(text) === null) {
			issues.push({ index, field: 'min', message: 'Percentage from 0 to 100' });
		}
	});
	return issues;
}

/** The below-lowest label as saved: trimmed, or the default when left blank. */
export function belowLabelOf(raw: string): string {
	return raw.trim() === '' ? DEFAULT_BELOW_LOWEST_LABEL : raw.trim();
}

/** A grade with no minimum: one this paper doesn't award. */
export function isUnused(row: BoundaryRow): boolean {
	return row.min.trim() === '';
}

/** The paper's boundaries, or null when it has none (null or empty): the one "has grades" check. */
export function boundariesOf(document: MarksheetDocument): readonly GradeBoundary[] | null {
	const boundaries = document.paper.boundaries;
	return boundaries === null || boundaries.length === 0 ? null : boundaries;
}

/** The boundary editor's working copy, started from what the paper stores. */
export function workingCopyOf(document: MarksheetDocument | null): {
	rows: BoundaryRow[];
	below: string;
	scale: string;
} {
	const below = document?.paper.belowLowestLabel ?? DEFAULT_BELOW_LOWEST_LABEL;
	const stored = document ? boundariesOf(document) : null;
	if (!stored) return { rows: [], below, scale: '' };
	const labels = stored.map((boundary) => boundary.label).join('|');
	const scale =
		GRADE_SCALES.find(
			(candidate) => candidate.labels.length > 0 && candidate.labels.join('|') === labels
		)?.name ?? 'Custom';
	return {
		rows: stored.map((boundary) => ({ label: boundary.label, min: String(boundary.minimum) })),
		below,
		scale
	};
}

/**
 * Every problem with the rows as typed, top grade first, indexed by the row's
 * place in `rows` so the dialog shows each problem on its own row. A blank row
 * (nothing typed) and a grade with no minimum (one this paper doesn't award)
 * are ignored — a tiered paper need not award every grade.
 */
export function boundaryIssues(
	rows: readonly BoundaryRow[],
	belowLowestLabel: string,
	paperTotal: number
): BoundaryIssue[] {
	const issues: BoundaryIssue[] = [];
	const seen = new Map<string, number>();
	let previous: number | null = null;
	rows.forEach((row, index) => {
		if (isUnused(row)) return;
		const label = row.label.trim();
		if (label === '') {
			issues.push({ index, field: 'label', message: 'Needs a grade label' });
		} else {
			// A blank below-lowest label saves as U, so a grade called U would
			// be indistinguishable from it.
			const below = belowLabelOf(belowLowestLabel);
			const key = label.toLowerCase();
			if (seen.has(key)) {
				issues.push({ index, field: 'label', message: `“${label}” is listed twice` });
			} else if (key === below.toLowerCase()) {
				issues.push({ index, field: 'label', message: `“${label}” is the below-lowest label` });
			}
			seen.set(key, index);
		}
		const text = row.min.trim();
		if (!/^\d+$/.test(text)) {
			issues.push({
				index,
				field: 'min',
				message: text === '' ? 'Needs a minimum mark' : 'Whole marks only'
			});
			return;
		}
		const min = Number(text);
		if (min > paperTotal) {
			issues.push({ index, field: 'min', message: `Above the paper total (${paperTotal})` });
		}
		if (previous !== null && min >= previous) {
			issues.push({
				index,
				field: 'min',
				message: `Must be below the grade above (${previous})`
			});
		}
		previous = min;
	});
	return issues;
}

/** What the rows would store: unused rows left out, labels trimmed. Meaningful once `boundaryIssues` is empty. */
export function boundariesFrom(rows: readonly BoundaryRow[]): GradeBoundary[] {
	return rows
		.filter((row) => !isUnused(row))
		.map((row) => ({ label: row.label.trim(), minimum: Number(row.min.trim()) }));
}

/** A teacher's grade, and what it would take to reach the next one up. */
export interface GradeResult {
	label: string;
	/** The next grade up and the marks to reach it; null at the top grade. */
	next: { label: string; marks: number } | null;
}

/**
 * From boundaries and the below-lowest label, the grade a total earns. The
 * next grade up is the boundary above the one the total cleared, so marks to
 * next is that boundary minus the total; the top grade has none to reach.
 * Labels are stored non-blank, so the below-lowest label is used as given.
 */
export function gradeOf(
	total: number,
	boundaries: readonly GradeBoundary[],
	belowLowestLabel: string
): GradeResult {
	const at = boundaries.findIndex((boundary) => total >= boundary.minimum);
	if (at === -1) {
		const lowest = boundaries[boundaries.length - 1];
		return {
			label: belowLowestLabel,
			next: { label: lowest.label, marks: lowest.minimum - total }
		};
	}
	if (at === 0) return { label: boundaries[0].label, next: null };
	return {
		label: boundaries[at].label,
		next: { label: boundaries[at - 1].label, marks: boundaries[at - 1].minimum - total }
	};
}

/** "2 to C", the nudge toward the next grade — blank at the top grade. */
export function toNextText(grade: GradeResult): string {
	return grade.next === null ? '' : `${grade.next.marks} to ${grade.next.label}`;
}

/** The grade a total earns on this paper, or null when it has no boundaries. */
export function paperGrade(document: MarksheetDocument, total: number): GradeResult | null {
	const boundaries = boundariesOf(document);
	return boundaries === null ? null : gradeOf(total, boundaries, document.paper.belowLowestLabel);
}

export type StudentGrade =
	| { kind: 'absent' }
	| { kind: 'over-max' }
	| { kind: 'complete'; total: number; grade: GradeResult | null }
	| { kind: 'partial'; total: number; grade: GradeResult | null };

/** What the marksheet knows about one student's grade: totals are live figures. */
export function studentGrade(document: MarksheetDocument, student: StoredStudent): StudentGrade {
	if (student.absent) return { kind: 'absent' };
	const entries = document.breakdown.entries;
	const marks = document.marks[student.id] ?? {};
	if (entries.some((entry) => marks[entry.id] !== undefined && isOverMax(marks[entry.id], entry))) {
		return { kind: 'over-max' };
	}
	const total = studentTotal(document, student.id);
	const grade = paperGrade(document, total);
	const { marked, total: of } = progressOf(marks, entries);
	return marked === of ? { kind: 'complete', total, grade } : { kind: 'partial', total, grade };
}

// Commands: mutate a document in place.

/**
 * Store the paper's grade boundaries, top grade first, and the below-lowest
 * label. Saving what amounts to nothing is marks only: no boundaries stores
 * null, like a paper that never had grades.
 */
export function setBoundaries(
	document: MarksheetDocument,
	boundaries: readonly GradeBoundary[],
	belowLowestLabel: string
): void {
	document.paper.boundaries = boundaries.length === 0 ? null : boundaries.map((b) => ({ ...b }));
	document.paper.belowLowestLabel = belowLabelOf(belowLowestLabel);
}

/**
 * Drop every boundary, back to marks only. The below-lowest label stays
 * where it was, so re-adding grades finds it as the teacher left it. False
 * when the paper already had none.
 */
export function clearBoundaries(document: MarksheetDocument): boolean {
	if (document.paper.boundaries === null) return false;
	document.paper.boundaries = null;
	return true;
}
