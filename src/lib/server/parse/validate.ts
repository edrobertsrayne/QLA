// Validator for the lean v0.2 breakdown (issue #8).
//
// Warns but never blocks: every finding becomes a `ParseWarning` entry and the
// breakdown is returned intact. Only unparseable model output fails the run —
// that is handled at the route seam, not here.

import {
	SPEC_CODE_PATTERN,
	STUB_SPEC_CATALOGUE,
	type Breakdown,
	type ParseWarning
} from './schema';

function countWords(text: string): number {
	return text.trim().split(/\s+/).filter(Boolean).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

/**
 * Check a parsed model-output breakdown against the lean v0.2 rules and the
 * (currently fixture) exam-specification catalogue.
 * Never throws for shape problems — it reports them as warnings.
 */
export function validateBreakdown(
	breakdown: unknown,
	catalogue: ReadonlySet<string> = STUB_SPEC_CATALOGUE
): ParseWarning[] {
	const warnings: ParseWarning[] = [];
	const warn = (questionNumber: string | null, code: string, message: string): void => {
		warnings.push({ questionNumber, code, message });
	};

	if (!isRecord(breakdown)) {
		warn(null, 'INVALID_BREAKDOWN', 'Model output is not a JSON object.');
		return warnings;
	}

	if (typeof breakdown['paperId'] !== 'string' || breakdown['paperId'].trim() === '') {
		warn(null, 'MISSING_FIELD', 'paperId is missing or empty.');
	}
	if (typeof breakdown['paperTitle'] !== 'string' || breakdown['paperTitle'].trim() === '') {
		warn(null, 'MISSING_FIELD', 'paperTitle is missing or empty.');
	}
	if (!Number.isInteger(breakdown['year'])) {
		warn(null, 'MISSING_FIELD', 'year is missing or not an integer.');
	}
	if (!Number.isInteger(breakdown['totalMarks'])) {
		warn(null, 'MISSING_FIELD', 'totalMarks is missing or not an integer.');
	}

	const questions = breakdown['questions'];
	if (!Array.isArray(questions)) {
		warn(null, 'MISSING_FIELD', 'questions is missing or not an array.');
		return warnings;
	}

	const seen = new Set<string>();
	let sum = 0;
	let sumIsClean = true;

	for (let index = 0; index < questions.length; index++) {
		const question = questions[index];
		const label =
			isRecord(question) && typeof question['number'] === 'string'
				? question['number']
				: `q[${index}]`;

		if (!isRecord(question)) {
			warn(null, 'INVALID_QUESTION', `Entry ${label} is not an object.`);
			sumIsClean = false;
			continue;
		}

		// number: free string, non-empty, unique within the paper.
		const number = question['number'];
		if (typeof number !== 'string' || number.trim() === '') {
			warn(null, 'EMPTY_NUMBER', `Entry ${label} has an empty question number.`);
		} else {
			if (seen.has(number)) {
				warn(number, 'DUPLICATE_NUMBER', `Duplicate question number '${number}'.`);
			}
			seen.add(number);
		}

		// marks: positive integer.
		const marks = question['marks'];
		if (!Number.isInteger(marks) || (marks as number) < 1) {
			warn(label, 'INVALID_MARKS', `Question '${label}' marks must be a positive integer.`);
			if (typeof marks === 'number' && Number.isFinite(marks)) {
				sum += marks;
			} else {
				sumIsClean = false;
			}
		} else {
			sum += marks as number;
		}

		// specCodes: non-empty, dotted shape, known to the catalogue.
		const specCodes = question['specCodes'];
		if (!Array.isArray(specCodes) || specCodes.length === 0) {
			warn(label, 'EMPTY_SPEC_CODES', `Question '${label}' has no spec codes.`);
		} else {
			for (const code of specCodes) {
				if (typeof code !== 'string' || !SPEC_CODE_PATTERN.test(code)) {
					warn(
						label,
						'MALFORMED_SPEC_CODE',
						`Question '${label}' spec code '${String(code)}' is not a dotted content code.`
					);
				} else if (!catalogue.has(code)) {
					warn(
						label,
						'UNKNOWN_SPEC_CODE',
						`Question '${label}' spec code '${code}' is not in the pinned exam specification.`
					);
				}
			}
		}

		// ao: required, non-empty.
		const ao = question['ao'];
		if (!Array.isArray(ao) || ao.length === 0) {
			warn(label, 'EMPTY_AO', `Question '${label}' has no assessment objectives.`);
		}

		// questionText: brief 3–8 word paraphrase task label.
		const questionText = question['questionText'];
		if (typeof questionText !== 'string' || questionText.trim() === '') {
			warn(label, 'QUESTION_TEXT_MISSING', `Question '${label}' has no task label.`);
		} else {
			const words = countWords(questionText);
			if (words < 3 || words > 8) {
				warn(
					label,
					'TASK_LABEL_LENGTH',
					`Question '${label}' task label is ${words} words; expected a 3–8 word paraphrase.`
				);
			}
		}

		// commandWord: present as a string (empty when the paper gives none).
		if (typeof question['commandWord'] !== 'string') {
			warn(label, 'INVALID_FIELD', `Question '${label}' commandWord is missing or not a string.`);
		}

		// isCalculation / isWorkingScientifically: required booleans.
		for (const flag of ['isCalculation', 'isWorkingScientifically'] as const) {
			if (typeof question[flag] !== 'boolean') {
				warn(label, 'INVALID_FIELD', `Question '${label}' ${flag} is missing or not a boolean.`);
			}
		}
	}

	// totalMarks is read off the paper, never summed — a mismatch warns.
	if (Number.isInteger(breakdown['totalMarks']) && sumIsClean) {
		if (sum !== (breakdown['totalMarks'] as number)) {
			warn(
				null,
				'TOTAL_MARKS_MISMATCH',
				`totalMarks ${breakdown['totalMarks'] as number} does not match the sum of question marks (${sum}).`
			);
		}
	}

	return warnings;
}

/** Type-guard for a structurally complete breakdown (warnings may still apply). */
export function isBreakdown(value: unknown): value is Breakdown {
	if (!isRecord(value)) return false;
	return (
		typeof value['paperId'] === 'string' &&
		typeof value['paperTitle'] === 'string' &&
		Number.isInteger(value['year']) &&
		Number.isInteger(value['totalMarks']) &&
		Array.isArray(value['questions'])
	);
}
