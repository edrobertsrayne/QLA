// Validator for the v1 prototype breakdown.
//
// Warns but never blocks: every finding becomes a `ParseWarning` entry and the
// breakdown is returned intact. Only unparseable model output fails the run —
// that is handled at the route seam, not here.
//
// Rules: id non-empty + unique, marks positive int or null, summary 3–8
// words, specPoint string-or-null (exact lift, never validated), commandWord
// string-or-null, ao AO1/AO2/AO3-or-null.

import { ASSESSMENT_OBJECTIVES, type ParseWarning } from './schema';
import { isBreakdown, isRecord } from '$lib/parse/is-breakdown.js';

export { isBreakdown };

const AO_SET: ReadonlySet<string> = new Set(ASSESSMENT_OBJECTIVES);

function countWords(text: string): number {
	return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Check a parsed model-output breakdown against the v1 rules.
 * Never throws for shape problems — it reports them as warnings.
 */
export function validateBreakdown(breakdown: unknown): ParseWarning[] {
	const warnings: ParseWarning[] = [];
	const warn = (questionId: string | null, code: string, message: string): void => {
		warnings.push({ questionId, code, message });
	};

	if (!isRecord(breakdown)) {
		warn(null, 'INVALID_BREAKDOWN', 'Model output is not a JSON object.');
		return warnings;
	}

	const questions = breakdown['questions'];
	if (!Array.isArray(questions)) {
		warn(null, 'MISSING_FIELD', 'questions is missing or not an array.');
		return warnings;
	}

	const seen = new Set<string>();

	for (let index = 0; index < questions.length; index++) {
		const question = questions[index];
		const label =
			isRecord(question) && typeof question['id'] === 'string' && question['id'].trim() !== ''
				? question['id']
				: `q[${index}]`;

		if (!isRecord(question)) {
			warn(null, 'INVALID_QUESTION', `Entry ${label} is not an object.`);
			continue;
		}

		// id: non-empty, unique within the run.
		const id = question['id'];
		if (typeof id !== 'string' || id.trim() === '') {
			warn(null, 'EMPTY_ID', `Entry ${label} has an empty question id.`);
		} else {
			if (seen.has(id)) {
				warn(id, 'DUPLICATE_ID', `Duplicate question id '${id}'.`);
			}
			seen.add(id);
		}

		// marks: positive integer or null (null = unknowable from inputs).
		const marks = question['marks'];
		if (marks !== null && (!Number.isInteger(marks) || (marks as number) < 1)) {
			warn(label, 'INVALID_MARKS', `Question '${label}' marks must be a positive integer or null.`);
		}

		// summary: 3–8 words.
		const summary = question['summary'];
		if (typeof summary !== 'string' || summary.trim() === '') {
			warn(label, 'SUMMARY_MISSING', `Question '${label}' has no summary.`);
		} else {
			const words = countWords(summary);
			if (words < 3 || words > 8) {
				warn(
					label,
					'SUMMARY_LENGTH',
					`Question '${label}' summary is ${words} words; expected 3–8 words.`
				);
			}
		}

		// specPoint: string or null. Exact lift — never shape-checked.
		if (typeof question['specPoint'] !== 'string' && question['specPoint'] !== null) {
			warn(label, 'INVALID_FIELD', `Question '${label}' specPoint must be a string or null.`);
		}

		// commandWord: string or null (verbatim, no normalisation).
		if (typeof question['commandWord'] !== 'string' && question['commandWord'] !== null) {
			warn(label, 'INVALID_FIELD', `Question '${label}' commandWord must be a string or null.`);
		}

		// ao: AO1/AO2/AO3 or null.
		const ao = question['ao'];
		if (ao !== null && (typeof ao !== 'string' || !AO_SET.has(ao))) {
			warn(label, 'INVALID_AO', `Question '${label}' ao must be AO1, AO2, AO3 or null.`);
		}
	}

	return warnings;
}
