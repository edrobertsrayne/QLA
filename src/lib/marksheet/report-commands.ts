// Report commands: pure mutations of a stored document. They know nothing of
// undo or persistence; the store wraps each in its one commit path.

import {
	sameProse,
	type MarksheetDocument,
	type ReportGenerationInput,
	type ReportProse
} from './document.js';
import { generationInputFor } from './report-input.js';

/**
 * Store one student's generated report: prose, the verbatim generation
 * input it was written from, the model used (display only) and the time.
 * A rewrite clears any teacher edit beside it: this is fresh wording.
 * False when the student is gone.
 */
export function writeReport(
	document: MarksheetDocument,
	studentId: string,
	prose: ReportProse,
	input: ReportGenerationInput,
	model: string,
	generatedAt: string
): boolean {
	if (!document.students.some((student) => student.id === studentId)) return false;
	document.reports[studentId] = {
		strengths: [...prose.strengths],
		areasForImprovement: [...prose.areasForImprovement],
		edit: null,
		input: structuredClone(input),
		model,
		generatedAt
	};
	return true;
}

/**
 * Put the teacher's edit beside one student's generated prose, or take it
 * away (`null`). The teacher's wording is stored beside the generated prose,
 * so a rewrite or a Revert restores the generated wording without a model
 * call. Wording identical to the generated prose leaves no edit behind, so
 * typing the text back clears the badge. False when that changes nothing.
 */
export function setReportEdit(
	document: MarksheetDocument,
	studentId: string,
	edit: ReportProse | null
): boolean {
	const report = document.reports[studentId];
	if (!report) return false;
	const next = edit !== null && !sameProse(edit, report) ? edit : null;
	// Wording that resolves to what is already there — the generated prose
	// when unedited, the edit beside it otherwise — changes nothing.
	const resolvesTo =
		next === null ? report.edit === null : report.edit !== null && sameProse(next, report.edit);
	if (resolvesTo) return false;
	report.edit =
		next === null
			? null
			: {
					strengths: [...next.strengths],
					areasForImprovement: [...next.areasForImprovement]
				};
	return true;
}

/**
 * Accept the generated prose as still right: the stored input becomes what
 * the document builds now, clearing the out-of-date marker with no model
 * call. The teacher's edit beside it is kept — the wording on the page does
 * not move, only what it is measured against. False when there is nothing to keep.
 */
export function keepWording(document: MarksheetDocument, studentId: string): boolean {
	const report = document.reports[studentId];
	if (!report) return false;
	const current = generationInputFor(document, studentId);
	if (!current) return false;
	report.input = structuredClone(current);
	return true;
}
