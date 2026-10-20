// Grade boundaries for one paper: an ordered list of (grade label, minimum
// total mark), top grade first, plus the label for a total below the lowest
// boundary. Pure functions over plain values — no I/O, no reactive state — so
// the dialog, the marksheet grid and the report header share one rule.
//
// A blank row is never stored: it reads as "not used" and is dropped on save.
// Validation works on rows as typed, so a half-typed row shows its problem
// where it is rather than refusing the keystroke.

import {
	isOverMax,
	type BreakdownEntry,
	type GradeBoundary,
	type MarksheetDocument,
	type StoredStudent
} from './document.js';
import { progressOf } from './students.js';

/** One boundary row as typed: both fields are text until the dialog saves. */
export interface BoundaryRow {
	label: string;
	min: string;
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

/** A row with neither a label nor a mark: a grade in the middle of being added. */
export function isBlankRow(row: BoundaryRow): boolean {
	return row.label.trim() === '' && row.min.trim() === '';
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
		if (isBlankRow(row) || row.min.trim() === '') return;
		const label = row.label.trim();
		if (label === '') {
			issues.push({ index, field: 'label', message: 'Needs a grade label' });
		} else {
			// A blank below-lowest label saves as U, so a grade called U would
			// be indistinguishable from it.
			const below = belowLowestLabel.trim() === '' ? 'U' : belowLowestLabel.trim();
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

/** What the teacher typed, with blank and unawarded rows left out. */
export function keptRows(rows: readonly BoundaryRow[]): BoundaryRow[] {
	return rows.filter((row) => !isBlankRow(row) && row.min.trim() !== '');
}

/** A teacher's grade, and what it would take to reach the next one up. */
export interface GradeResult {
	label: string;
	/** Marks to reach the next grade up; null at the top grade. */
	toNext: number | null;
	nextLabel: string | null;
}

/**
 * From boundaries and the below-lowest label, the grade a total earns. The
 * next grade up is the boundary above the one the total cleared, so marks to
 * next is that boundary minus the total; the top grade has none to reach.
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
			label: belowLowestLabel.trim() === '' ? 'U' : belowLowestLabel.trim(),
			toNext: lowest.minimum - total,
			nextLabel: lowest.label
		};
	}
	if (at === 0) return { label: boundaries[0].label, toNext: null, nextLabel: null };
	return {
		label: boundaries[at].label,
		toNext: boundaries[at - 1].minimum - total,
		nextLabel: boundaries[at - 1].label
	};
}

/** "2 to C", the nudge toward the next grade — blank at the top grade. */
export function toNextText(grade: GradeResult): string {
	return grade.toNext === null || grade.nextLabel === null
		? ''
		: `${grade.toNext} to ${grade.nextLabel}`;
}

export type StudentGrade =
	| { kind: 'absent' }
	| { kind: 'over-max' }
	| { kind: 'complete'; total: number; grade: GradeResult | null }
	| { kind: 'partial'; total: number; grade: GradeResult | null };

/** What the marksheet knows about one student's grade: totals are live figures. */
export function studentGrade(
	document: MarksheetDocument,
	student: StoredStudent,
	entries: readonly BreakdownEntry[]
): StudentGrade {
	if (student.absent) return { kind: 'absent' };
	const marks = document.marks[student.id] ?? {};
	if (entries.some((entry) => marks[entry.id] !== undefined && isOverMax(marks[entry.id], entry))) {
		return { kind: 'over-max' };
	}
	const total = entries.reduce((sum, entry) => sum + (marks[entry.id] ?? 0), 0);
	const boundaries = document.paper.boundaries;
	const grade =
		boundaries === null || boundaries.length === 0
			? null
			: gradeOf(total, boundaries, document.paper.belowLowestLabel);
	const { marked, total: of } = progressOf(marks, entries);
	return marked === of ? { kind: 'complete', total, grade } : { kind: 'partial', total, grade };
}
