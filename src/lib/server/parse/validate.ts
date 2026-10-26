// Validator for the v1 prototype breakdown.
//
// Warns but never blocks: every finding becomes a `ParseWarning` entry and the
// breakdown is returned intact. Only unparseable model output fails the run —
// that is handled at the route seam, not here.
//
// Rules: id non-empty + unique, questionNumber non-empty, marks positive int
// or null, summary 3–8 words, specPoint string-or-null (exact lift, never
// validated), commandWord string-or-null, ao AO1/AO2/AO3-or-null.

import { MAX_AO_DESCRIPTION_WORDS, type AoDescription, type ParseWarning } from './schema';
import { ASSESSMENT_OBJECTIVES } from '$lib/parse/assessment-objectives.js';
import { isBreakdown, isRecord } from '$lib/parse/is-breakdown.js';
import { MISSING_QUESTION_NUMBER, SPEC_POINT_PROPOSED } from '$lib/parse/parse-warnings.js';

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

		// questionNumber: non-empty. Banding metadata — soft, with an id fallback
		// applied by `applyQuestionNumberFallback`.
		const questionNumber = question['questionNumber'];
		if (typeof questionNumber !== 'string' || questionNumber.trim() === '') {
			warn(
				label,
				MISSING_QUESTION_NUMBER,
				`Entry '${label}' has no question number; grouping falls back to its own id.`
			);
		}

		// marks: positive integer or null (null = unknowable from inputs).
		const marks = question['marks'];
		if (marks !== null && (typeof marks !== 'number' || !Number.isInteger(marks) || marks < 1)) {
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

/**
 * Fill a missing or blank `questionNumber` from the entry's own `id`.
 *
 * Banding a marksheet's columns under their question is cosmetic, so a
 * breakdown that omits it still reaches the teacher (the gap is reported by
 * `validateBreakdown`). The fallback is exactly right for an undivided
 * question and bands a subquestion under itself rather than its parent.
 */
export function applyQuestionNumberFallback(breakdown: unknown): void {
	if (!isRecord(breakdown)) return;
	const questions = breakdown['questions'];
	if (!Array.isArray(questions)) return;

	for (const question of questions) {
		if (!isRecord(question)) continue;
		const questionNumber = question['questionNumber'];
		if (typeof questionNumber === 'string' && questionNumber.trim() !== '') continue;
		const id = question['id'];
		if (typeof id === 'string' && id.trim() !== '') question['questionNumber'] = id;
	}
}

/**
 * Turn the model's `specPointProposed` flag into the per-entry warning ADR 0005
 * asks for, and strip the flag so the stored breakdown keeps its v1 shape.
 *
 * A code the markscheme printed is used verbatim and unflagged; a code proposed
 * from an attached specification is kept and flagged for the teacher to check.
 * With no specification attached nothing can be proposed from, so a flagged
 * code becomes null rather than reaching a report ungrounded.
 */
export function applySpecPointProvenance(breakdown: unknown, hasSpec: boolean): ParseWarning[] {
	const warnings: ParseWarning[] = [];
	if (!isRecord(breakdown)) return warnings;
	const questions = breakdown['questions'];
	if (!Array.isArray(questions)) return warnings;

	for (const question of questions) {
		if (!isRecord(question)) continue;
		const proposed = question['specPointProposed'] === true;
		delete question['specPointProposed'];
		if (!proposed) continue;

		const specPoint = question['specPoint'];
		if (typeof specPoint !== 'string' || specPoint.trim() === '') continue;
		if (!hasSpec) {
			question['specPoint'] = null;
			continue;
		}
		const rawId = question['id'];
		const label = typeof rawId === 'string' && rawId.trim() !== '' ? rawId : null;
		warnings.push({
			questionId: label,
			code: SPEC_POINT_PROPOSED,
			message: `${label === null ? 'An entry' : `Entry '${label}'`} has no specification point in its markscheme; '${specPoint.trim()}' was proposed from the attached specification, so check it.`
		});
	}
	return warnings;
}

/**
 * Set the top-level `tierName` to the trimmed string when the model gave text
 * with content, otherwise null. Never warns: a paper with no tier printed is a
 * valid answer, and neither is a malformed one worth blocking the run.
 */
export function applyTierNameCheck(breakdown: unknown): void {
	if (!isRecord(breakdown)) return;
	const value = breakdown['tierName'];
	breakdown['tierName'] = typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** A description the model gave, or null when it is empty, over-long or not text. */
function cleanDescription(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (trimmed === '' || countWords(trimmed) > MAX_AO_DESCRIPTION_WORDS) return null;
	return trimmed;
}

/**
 * Replace the model's `aoDescriptions` with one checked entry per assessment
 * objective: empty, over-long or malformed values become null, and a run with
 * no specification attached has none whatever the model said, since only a
 * specification can ground one.
 */
export function applyAoDescriptionChecks(breakdown: unknown, hasSpec: boolean): void {
	if (!isRecord(breakdown)) return;
	const given = Array.isArray(breakdown['aoDescriptions']) ? breakdown['aoDescriptions'] : [];
	const descriptions: AoDescription[] = ASSESSMENT_OBJECTIVES.map((ao) => {
		const match = given.find((item) => isRecord(item) && item['ao'] === ao);
		return {
			ao,
			description: hasSpec && isRecord(match) ? cleanDescription(match['description']) : null
		};
	});
	breakdown['aoDescriptions'] = descriptions;
}
