// The rules a set of grade boundaries must satisfy, shared by the boundary
// dialog (rows as typed) and the document parser (rows as stored), so a backup
// cannot hold boundaries the dialog would have refused. Pure functions.

import type { GradeBoundary } from './document.js';
import { DEFAULT_BELOW_LOWEST_LABEL } from './document-values.js';

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

/** The below-lowest label as saved: trimmed, or the default when left blank. */
export function belowLabelOf(raw: string): string {
	return raw.trim() === '' ? DEFAULT_BELOW_LOWEST_LABEL : raw.trim();
}

/** A grade with no minimum: one this paper doesn't award. */
export function isUnused(row: BoundaryRow): boolean {
	return row.min.trim() === '';
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

/**
 * Whether stored boundaries keep the dialog's ordering and label rules: minimums
 * strictly descending whole marks, no label listed twice or equal to the
 * below-lowest label. The paper total is not checked: marks can be reduced
 * after boundaries are set, and a saved document must stay readable.
 */
export function boundariesAreValid(
	boundaries: readonly GradeBoundary[],
	belowLowestLabel: string
): boolean {
	const rows = boundaries.map(({ label, minimum }) => ({ label, min: String(minimum) }));
	return boundaryIssues(rows, belowLowestLabel, Infinity).length === 0;
}
