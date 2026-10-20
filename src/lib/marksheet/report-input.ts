// The exact `/api/report` request body for one student, minus `model` — and
// the same value a stored report keeps as its generation input. Shared by the
// browser (what the run sends) and the store (out-of-date comparison), so the
// comparison always means what the server saw.
//
// `topics` carries topic names, not codes: what the student reads. It carries
// no student identifier of any kind; the browser matches each response to its
// `fetch`.

import type { MarksheetDocument, ReportGenerationInput } from './document.js';
import { topicNamesFor } from './report-rollup.js';
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
			topics: topicNamesFor(document, entry.specPoint),
			gained,
			available: entry.marks ?? 0
		});
	}
	return { paperLabel: document.paper.label ?? '', entries };
}

/**
 * What a stored generation input no longer matches, in the words the Review
 * strip shows beside the marker: one phrase per changed thing. Position
 * matters — a reordered, added or removed question changes what the model
 * saw, even when every figure is otherwise the same. Null when the student
 * is blocked now — there is nothing to compare against, and Review hides
 * the report rather than marking it.
 */
export function changedInputFields(
	stored: ReportGenerationInput,
	current: ReportGenerationInput | null
): string[] | null {
	if (!current) return null;
	const changes: string[] = [];
	if (stored.paperLabel !== current.paperLabel) changes.push('the paper label');
	const longest = Math.max(stored.entries.length, current.entries.length);
	for (let index = 0; index < longest; index += 1) {
		const was = stored.entries[index];
		const is = current.entries[index];
		if (!was || !is) {
			changes.push(`question ${(was ?? is).label}`);
			continue;
		}
		if (is.label !== was.label) {
			changes.push(`question ${was.label}`);
			continue;
		}
		if (is.gained !== was.gained) changes.push(`the mark for question ${was.label}`);
		if (is.available !== was.available) changes.push(`the marks for question ${was.label}`);
		if (is.summary !== was.summary || is.commandWord !== was.commandWord || is.ao !== was.ao) {
			changes.push(`question ${was.label}`);
		}
		if (
			is.topics.length !== was.topics.length ||
			is.topics.some((topic, topicIndex) => topic !== was.topics[topicIndex])
		) {
			changes.push('the topic names');
		}
	}
	return [...new Set(changes)];
}
