// The assessment objectives the prototype knows: hardcoded, shared across
// AQA/OCR GCSE and A-Level, with no board picker.
//
// Shared rather than server-side, because both sides carry an objective: the
// parse contract tags every entry with one, and the breakdown page lets the
// teacher correct it. The vocabulary exists once here so a new objective is
// added in one place.

export const ASSESSMENT_OBJECTIVES = ['AO1', 'AO2', 'AO3'] as const;

export type AssessmentObjective = (typeof ASSESSMENT_OBJECTIVES)[number];

/** The objective a string names, or null when it names none. */
export function assessmentObjectiveOf(value: string): AssessmentObjective | null {
	return ASSESSMENT_OBJECTIVES.find((objective) => objective === value) ?? null;
}
