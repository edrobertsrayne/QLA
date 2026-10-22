// The steps of the report flow and which of them a paper allows: shared by the
// route guard (which redirects away from a step the paper does not allow) and
// the step navigation (which only offers those steps).

import { topicCodesOf, type MarksheetDocument } from './document.js';
import { topicNameGaps } from './report-rollup.js';

export type ReportStep = 'topics' | 'grades' | 'who' | 'writing' | 'review';

/** Every step in flow order; `label` is the navigation's, `title` the page title's. */
export const REPORT_STEPS: readonly { id: ReportStep; label: string; title: string }[] = [
	{ id: 'topics', label: 'Topic names', title: 'Topic names' },
	{ id: 'grades', label: 'Grades', title: 'Grades' },
	{ id: 'who', label: 'Who gets one', title: 'Who gets one' },
	{ id: 'writing', label: 'Writing', title: 'Writing' },
	{ id: 'review', label: 'Review and print', title: 'Review' }
];

/** The step a URL path segment names, or null when it names none. */
export function reportStepFrom(segment: string | undefined): ReportStep | null {
	return REPORT_STEPS.find((step) => step.id === segment)?.id ?? null;
}

/** The page title of a step. Total: a step with no entry is a bug, so it throws. */
export function stepTitleOf(step: ReportStep): string {
	const found = REPORT_STEPS.find((item) => item.id === step);
	if (!found) throw new Error(`Unknown report step: ${step}`);
	return found.title;
}

export type AvailableStep = { id: ReportStep; label: string; title: string; locked: boolean };

/**
 * The steps this paper has: Topic names exists only when the paper has topic
 * codes, and a blocking topic-name gap locks every step after it.
 */
export function availableSteps(document: MarksheetDocument): AvailableStep[] {
	const hasTopics = topicCodesOf(document).length > 0;
	const blocked = topicNameGaps(document).blocked;
	return REPORT_STEPS.filter((step) => hasTopics || step.id !== 'topics').map((step) => ({
		...step,
		locked: blocked && step.id !== 'topics'
	}));
}

/** The step a teacher can open: one the paper has and no gap has locked. */
export function stepAllowed(document: MarksheetDocument, step: ReportStep): boolean {
	return availableSteps(document).some((item) => item.id === step && !item.locked);
}

/**
 * The step the teacher lands on: a blocking topic-name gap means Topic names;
 * otherwise reports written means Review, otherwise the first step of the flow.
 */
export function landingStep(document: MarksheetDocument): ReportStep {
	if (topicNameGaps(document).blocked) return 'topics';
	if (Object.keys(document.reports).length > 0) return 'review';
	return availableSteps(document)[0].id;
}
