// The exact `/api/report` request body for one student, minus `model` — and
// the same value a stored report keeps as its generation input. Shared by the
// browser (what the run sends) and the store (out-of-date comparison), so the
// comparison always means what the server saw.
//
// `topics` carries topic names, not codes: what the student reads. It carries
// no student identifier of any kind; the browser matches each response to its
// `fetch`.

import { specPointCodes, type MarksheetDocument, type ReportGenerationInput } from './document.js';
import { isEligible } from './report-eligibility.js';

/**
 * The generation input for one student: the request body minus `model`,
 * exactly as sent. Null when the student is blocked (absent, unmarked, or
 * over max) — there is nothing final to write from.
 */
export function generationInputFor(
	document: MarksheetDocument,
	studentId: string
): ReportGenerationInput | null {
	if (!isEligible(document, studentId)) return null;
	const marks = document.marks[studentId] ?? {};
	const entries: ReportGenerationInput['entries'] = [];
	for (const entry of document.breakdown.entries) {
		const gained = marks[entry.id] ?? 0;
		entries.push({
			label: entry.label,
			summary: entry.summary,
			commandWord: entry.commandWord,
			ao: entry.ao,
			topics: specPointCodes(entry.specPoint).map(
				(code) => document.topicNames[code]?.trim() || code
			),
			gained,
			available: entry.marks ?? 0
		});
	}
	return { paperLabel: document.paper.label ?? '', entries };
}

/**
 * Whether a stored generation input still matches what the document builds
 * now: any difference in any field means the report's feedback was written
 * from something else. Grade, marks to next grade and model never mark a
 * report out of date, because they never reach the input.
 */
export function sameGenerationInput(
	stored: ReportGenerationInput,
	current: ReportGenerationInput | null
): boolean {
	if (!current) return false;
	return JSON.stringify(stored) === JSON.stringify(current);
}
