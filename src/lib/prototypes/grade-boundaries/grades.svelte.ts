// PROTOTYPE — wipe me. Grade boundaries for one paper (wayfinder #55), in memory only.
//
// An ordered list of (grade label, minimum total mark), highest grade first, plus the
// label for a total below the lowest boundary (default `U`). Every boundary is
// optional: an empty list means no grades anywhere. Rows are kept as typed text so
// the editors can show a half-typed or wrong row with its problem beside it.

import { isOverMax } from '$lib/marksheet/document.js';
import { marksheetStore } from '$lib/marksheet/index.js';

export interface BoundaryRow {
	label: string;
	min: string;
}

export const grades = $state<{ rows: BoundaryRow[]; below: string }>({ rows: [], below: 'U' });

/** The paper's total, which no boundary may exceed. */
export function paperTotal(): number {
	return marksheetStore().entries.reduce((sum, e) => sum + (e.marks ?? 0), 0);
}

export interface RowIssue {
	index: number;
	field: 'label' | 'min';
	message: string;
}

function isBlank(row: BoundaryRow): boolean {
	return row.label.trim() === '' && row.min.trim() === '';
}

/** Every problem with the rows as typed. Blank rows are ignored (a row being added). */
export function issuesOf(rows: BoundaryRow[], below: string, total: number): RowIssue[] {
	const issues: RowIssue[] = [];
	const seen = new Map<string, number>();
	let previous: number | null = null;
	rows.forEach((row, index) => {
		if (isBlank(row)) return;
		const label = row.label.trim();
		if (label === '') issues.push({ index, field: 'label', message: 'Needs a grade label' });
		else {
			const key = label.toLowerCase();
			if (seen.has(key))
				issues.push({ index, field: 'label', message: `“${label}” is listed twice` });
			else if (key === below.trim().toLowerCase())
				issues.push({ index, field: 'label', message: `“${label}” is the below-lowest label` });
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
		if (min > total)
			issues.push({ index, field: 'min', message: `Above the paper total (${total})` });
		if (previous !== null && min >= previous)
			issues.push({
				index,
				field: 'min',
				message: `Must be below the grade above (${previous})`
			});
		previous = min;
	});
	return issues;
}

export interface Boundary {
	label: string;
	min: number;
}

/** The boundaries in force: none at all while any row has a problem. */
export function boundaries(): Boundary[] {
	if (issuesOf(grades.rows, grades.below, paperTotal()).length > 0) return [];
	return grades.rows
		.filter((row) => !isBlank(row))
		.map((row) => ({ label: row.label.trim(), min: Number(row.min.trim()) }));
}

export interface GradeResult {
	label: string;
	/** Marks to reach the next grade up; null at the top grade. */
	toNext: number | null;
	nextLabel: string | null;
}

export function gradeOf(total: number, list: Boundary[] = boundaries()): GradeResult | null {
	if (list.length === 0) return null;
	const i = list.findIndex((b) => total >= b.min);
	if (i === -1) {
		const lowest = list[list.length - 1];
		return {
			label: grades.below.trim() || 'U',
			toNext: lowest.min - total,
			nextLabel: lowest.label
		};
	}
	if (i === 0) return { label: list[0].label, toNext: null, nextLabel: null };
	return { label: list[i].label, toNext: list[i - 1].min - total, nextLabel: list[i - 1].label };
}

export type StudentGrade =
	| { kind: 'absent' }
	| { kind: 'over-max' }
	| { kind: 'complete'; total: number; grade: GradeResult | null }
	| { kind: 'partial'; total: number; marked: number; of: number; grade: GradeResult | null };

/** What the marksheet knows about one student's grade. */
export function studentGrade(studentId: string): StudentGrade {
	const store = marksheetStore();
	const student = store.students.find((s) => s.id === studentId);
	if (student?.absent) return { kind: 'absent' };
	const marks = store.document?.marks[studentId] ?? {};
	const entries = store.entries;
	if (entries.some((e) => marks[e.id] !== undefined && isOverMax(marks[e.id], e)))
		return { kind: 'over-max' };
	const marked = entries.filter((e) => marks[e.id] !== undefined).length;
	const total = entries.reduce((sum, e) => sum + (marks[e.id] ?? 0), 0);
	const grade = gradeOf(total);
	return marked === entries.length
		? { kind: 'complete', total, grade }
		: { kind: 'partial', total, marked, of: entries.length, grade };
}

export type PasteResult =
	{ ok: true; rows: BoundaryRow[]; note: string } | { ok: false; error: string };

const isInt = (cell: string) => /^\d+$/.test(cell);

/**
 * Read a boundary table copied from a board's PDF or spreadsheet. Takes:
 * - two rows, grades across then marks across (an optional leading caption cell
 *   like "Grade" / "Mark" on each is dropped, and a "Max" column is dropped);
 * - a column of `label mark` pairs, one per line;
 * - a single row of marks, filled into the labels already there.
 * Ascending tables are flipped so the top grade comes first.
 */
export function readPaste(text: string, existing: BoundaryRow[]): PasteResult {
	const lines = text
		.split(/\r?\n/)
		.map((line) =>
			line
				.split(/\t|,|\s{2,}|\s/)
				.map((c) => c.trim())
				.filter(Boolean)
		)
		.filter((cells) => cells.length > 0);
	if (lines.length === 0) return { ok: false, error: 'Nothing to read in the paste.' };

	let pairs: { label: string; min: string }[] | null = null;

	if (lines.length === 1) {
		const cells = lines[0].filter(isInt);
		const labels = existing.filter((r) => r.label.trim() !== '').map((r) => r.label.trim());
		if (cells.length !== lines[0].length)
			return { ok: false, error: 'One row pasted, but it is not all marks.' };
		if (labels.length !== cells.length)
			return {
				ok: false,
				error: `${cells.length} marks pasted, but there are ${labels.length} grade labels to fill. Paste the grade row as well.`
			};
		pairs = labels.map((label, i) => ({ label, min: cells[i] }));
	} else if (lines.length === 2 && lines[0].length === lines[1].length && lines[0].length > 2) {
		let [labels, marks] = lines;
		if (!marks.every(isInt) && labels.every(isInt)) [labels, marks] = [marks, labels];
		if (!isInt(marks[0])) {
			labels = labels.slice(1);
			marks = marks.slice(1);
		}
		const maxAt = labels.findIndex((l) => /^max/i.test(l));
		if (maxAt !== -1) {
			labels = labels.filter((_, i) => i !== maxAt);
			marks = marks.filter((_, i) => i !== maxAt);
		}
		pairs = labels.map((label, i) => ({ label, min: marks[i] }));
	} else if (lines.every((cells) => cells.length === 2)) {
		pairs = lines
			.filter(([, m]) => isInt(m))
			.filter(([l]) => !/^max/i.test(l))
			.map(([label, min]) => ({ label, min }));
	}

	if (!pairs || pairs.length === 0)
		return {
			ok: false,
			error:
				'Could not read that as a boundary table. Paste a row of grades and a row of marks, or one grade and mark per line.'
		};

	let note = `Read ${pairs.length} boundaries.`;
	const nums = pairs.map((p) => Number(p.min));
	if (nums.length > 1 && nums.every((n, i) => i === 0 || n >= nums[i - 1])) {
		pairs.reverse();
		note += ' Flipped so the top grade is first.';
	}
	return { ok: true, rows: pairs, note };
}

/** PROTOTYPE sample pastes, for the sample panel. The paper is out of 42. */
export const SAMPLES: { name: string; text: string }[] = [
	{
		name: 'Board table (grade row, mark row)',
		text: 'Grade\t9\t8\t7\t6\t5\t4\t3\nMark\t36\t32\t28\t24\t20\t16\t12'
	},
	{
		name: 'Ascending with Max column',
		text: 'Max\t3\t4\t5\t6\t7\t8\t9\n42\t12\t16\t20\t24\t28\t32\t36'
	},
	{ name: 'Pairs, one per line', text: 'A*\t38\nA\t33\nB\t27\nC\t21\nD\t15\nE\t10' },
	{ name: 'Marks row only', text: '35\t31\t27\t23\t19\t15\t11' },
	{ name: 'Broken: above total, out of order', text: '9\t8\t7\t6\t5\n45\t32\t34\t24\t20' },
	{ name: 'Broken: duplicate label', text: '9\t8\t8\t6\n36\t32\t28\t24' }
];

export function loadSample(): void {
	const read = readPaste(SAMPLES[0].text, []);
	if (read.ok) grades.rows = read.rows;
}

/** Grade scales a teacher can start from; the labels are only a starting point. */
export const SCALES: { name: string; labels: string[] }[] = [
	{ name: 'GCSE 9–1', labels: ['9', '8', '7', '6', '5', '4', '3', '2', '1'] },
	{
		name: 'GCSE Combined Science 9-9–1-1',
		labels: [9, 8, 7, 6, 5, 4, 3, 2, 1].flatMap((n) =>
			n === 1 ? ['1-1'] : [`${n}-${n}`, `${n}-${n - 1}`]
		)
	},
	{ name: 'A level A*–E', labels: ['A*', 'A', 'B', 'C', 'D', 'E'] },
	{ name: 'Distinction / Merit / Pass', labels: ['Distinction', 'Merit', 'Pass'] },
	{ name: 'Working at (school)', labels: ['Greater depth', 'Expected', 'Working towards'] }
];

/** A dialog's working copy: nothing reaches the marksheet until it is saved. */
export interface Draft {
	rows: BoundaryRow[];
	below: string;
}

export function draftFromGrades(): Draft {
	return { rows: grades.rows.map((r) => ({ ...r })), below: grades.below };
}

/**
 * The rows a draft would save. With `dropUnmarked`, a grade with no minimum is one
 * this paper doesn't award (a higher-tier paper has no 1 or 2), so it is left out.
 */
export function draftRows(draft: Draft, dropUnmarked = false): BoundaryRow[] {
	return draft.rows.filter(
		(r) => !(r.label.trim() === '' && r.min.trim() === '') && !(dropUnmarked && r.min.trim() === '')
	);
}

export function saveDraft(draft: Draft, dropUnmarked = false): void {
	grades.rows = draftRows(draft, dropUnmarked).map((r) => ({
		label: r.label.trim(),
		min: r.min.trim()
	}));
	grades.below = draft.below.trim() || 'U';
}

/** Problems with a draft, indexed against the draft's own rows. */
export function draftIssues(draft: Draft, dropUnmarked = false): RowIssue[] {
	const kept = draft.rows.flatMap((r, i) =>
		(r.label.trim() === '' && r.min.trim() === '') || (dropUnmarked && r.min.trim() === '')
			? []
			: [i]
	);
	return issuesOf(
		kept.map((i) => draft.rows[i]),
		draft.below,
		paperTotal()
	).map((issue) => ({ ...issue, index: kept[issue.index] }));
}

/** Totals of fully-marked students, for editors that show the class against the marks. */
export function classTotals(): { name: string; total: number }[] {
	const store = marksheetStore();
	return store.students.flatMap((s) => {
		const g = studentGrade(s.id);
		return g.kind === 'complete' ? [{ name: `${s.firstName} ${s.surname}`, total: g.total }] : [];
	});
}
