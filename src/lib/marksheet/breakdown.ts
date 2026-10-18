// What the breakdown adds up to for the teacher reviewing it: the question
// bands its entries fall into, what blocks confirmation, and which entries
// need a look.
//
// Pure functions over a stored document's breakdown — no I/O and no reactive
// state — so the rules are testable on their own and every surface that shows
// a breakdown derives them the same way.

import type { BreakdownEntry, StoredBreakdown, StoredWarning } from './document.js';

/** A contiguous run of entries belonging to one question: one band of the table. */
export interface QuestionBand {
	questionNumber: string;
	entries: BreakdownEntry[];
}

/**
 * Group entries into question bands. Only contiguous runs band together: a
 * breakdown lists questions in paper order, so a question number that comes
 * back after another belongs to a later band rather than reaching across the
 * paper.
 */
export function questionBands(entries: readonly BreakdownEntry[]): QuestionBand[] {
	const bands: QuestionBand[] = [];
	for (const entry of entries) {
		const questionNumber = entry.questionNumber.trim();
		const current = bands.at(-1);
		if (current && current.questionNumber === questionNumber) current.entries.push(entry);
		else bands.push({ questionNumber, entries: [entry] });
	}
	return bands;
}

/**
 * Whether a band is one undivided question: a single entry labelled with its
 * own question number (`3`), rather than subquestions under a stem.
 */
export function isUndivided(band: QuestionBand): boolean {
	return band.entries.length === 1 && band.entries[0].label.trim() === band.questionNumber;
}

/**
 * How many questions a breakdown covers: the distinct question numbers in it,
 * not the runs they form, so a paper whose questions repeat out of order is not
 * counted twice.
 */
export function questionCount(entries: readonly BreakdownEntry[]): number {
	const numbers = new Set<string>();
	for (const entry of entries) {
		const questionNumber = entry.questionNumber.trim();
		if (questionNumber !== '') numbers.add(questionNumber);
	}
	return numbers.size;
}

/**
 * Why a breakdown cannot be confirmed: an entry whose available marks are
 * unknown would be a column the teacher can neither mark nor analyse, and an
 * entry with an empty or repeated label leaves a marksheet column without a
 * unique heading.
 */
export interface ConfirmationBlockers {
	blocked: boolean;
	noAvailableMarks: BreakdownEntry[];
	emptyLabels: BreakdownEntry[];
	duplicateLabels: BreakdownEntry[];
}

/** What stops confirmation, naming every offender (empty when nothing does). */
export function confirmationBlockers(entries: readonly BreakdownEntry[]): ConfirmationBlockers {
	const labelCounts = new Map<string, number>();
	for (const entry of entries) {
		const label = entry.label.trim();
		if (label === '') continue;
		labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
	}

	const noAvailableMarks: BreakdownEntry[] = [];
	const emptyLabels: BreakdownEntry[] = [];
	const duplicateLabels: BreakdownEntry[] = [];
	for (const entry of entries) {
		const label = entry.label.trim();
		if (entry.marks === null) noAvailableMarks.push(entry);
		if (label === '') emptyLabels.push(entry);
		else if ((labelCounts.get(label) ?? 0) > 1) duplicateLabels.push(entry);
	}

	return {
		blocked: noAvailableMarks.length > 0 || emptyLabels.length > 0 || duplicateLabels.length > 0,
		noAvailableMarks,
		emptyLabels,
		duplicateLabels
	};
}

/** What an entry is missing, in the order worth fixing it. */
export type AttentionReason = 'no-available-marks' | 'empty-label' | 'duplicate-label';

export interface AttentionItem {
	entry: BreakdownEntry;
	/** What the entry itself is missing; the parse's own findings ride along in `warnings`. */
	reasons: AttentionReason[];
	warnings: StoredWarning[];
}

/** The entries worth a second look before confirming, in document order. */
export function needsAttention(breakdown: StoredBreakdown): AttentionItem[] {
	const { entries, warnings } = breakdown;
	const blockers = confirmationBlockers(entries);
	const unmarked = new Set(blockers.noAvailableMarks);
	const unlabelled = new Set(blockers.emptyLabels);
	const duplicated = new Set(blockers.duplicateLabels);

	const items: AttentionItem[] = [];
	for (const entry of entries) {
		const reasons: AttentionReason[] = [];
		if (unmarked.has(entry)) reasons.push('no-available-marks');
		if (unlabelled.has(entry)) reasons.push('empty-label');
		else if (duplicated.has(entry)) reasons.push('duplicate-label');

		const own = warningsForEntry(warnings, entry.id);
		if (reasons.length > 0 || own.length > 0) items.push({ entry, reasons, warnings: own });
	}
	return items;
}

/** The findings that are not about one entry, so they stay beside the table. */
export function runWarnings(warnings: readonly StoredWarning[]): StoredWarning[] {
	return warnings.filter((warning) => warning.questionId === null);
}

/** What to call an entry in prose: its label, or a stand-in while it has none. */
export function entryName(entry: BreakdownEntry): string {
	const label = entry.label.trim();
	return label === '' ? '(no label)' : label;
}

/** The findings about one entry, shown on its row. */
export function warningsForEntry(
	warnings: readonly StoredWarning[],
	entryId: string
): StoredWarning[] {
	return warnings.filter((warning) => warning.questionId === entryId);
}
