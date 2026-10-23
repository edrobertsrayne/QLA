// What the breakdown adds up to for the teacher reviewing it: the question
// bands its entries fall into, what blocks confirmation, and which entries
// need a look.
//
// Pure functions over a stored document's breakdown — no I/O and no reactive
// state — so the rules are testable on their own and every surface that shows
// a breakdown derives them the same way.

import type {
	BreakdownEntry,
	CommonQuestion,
	EditableField,
	MarksheetDocument,
	StoredBreakdown,
	StoredWarning,
	TierIndex
} from './document.js';
import { EDITABLE_FIELDS, tierEntries } from './document.js';
import {
	ASSESSMENT_OBJECTIVES,
	type AssessmentObjective
} from '$lib/parse/assessment-objectives.js';
import { MISSING_QUESTION_NUMBER } from '$lib/parse/parse-warnings.js';

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
	const questionNumber = band.questionNumber.trim();
	return (
		questionNumber !== '' &&
		band.entries.length === 1 &&
		band.entries[0].label.trim() === questionNumber
	);
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

/**
 * Why a whole assessment cannot be confirmed: what stops each tier's own
 * breakdown, plus the rules that only exist when two papers are reviewed
 * together. A tier name is what tells the marksheet, analysis and reports
 * apart, and a pair whose marks differ cannot compare like with like.
 */
export interface AssessmentBlockers {
	blocked: boolean;
	/** Each tier's own blockers, in tier order. */
	tiers: ConfirmationBlockers[];
	/** Tiers with no name; empty on a single tier, where there is nothing to tell apart. */
	blankTierNames: TierIndex[];
	/** Both tiers carry the same name, trimmed and ignoring case. False on a single tier. */
	sameTierNames: boolean;
	/** Confirmed pairs whose marks are unknown or differ between the two tiers. */
	unequalPairs: CommonQuestion[];
}

/** What stops confirming the assessment, naming every offender (empty when nothing does). */
export function assessmentBlockers(document: MarksheetDocument): AssessmentBlockers {
	const tiers = document.tiers.map((stored) => confirmationBlockers(stored.breakdown.entries));

	const twoTiers = document.tiers.length === 2;
	const firstName = (document.tiers[0]?.tierName ?? '').trim();
	const secondName = (document.tiers[1]?.tierName ?? '').trim();

	const blankTierNames: TierIndex[] = [];
	if (twoTiers) {
		if (firstName === '') blankTierNames.push(0);
		if (secondName === '') blankTierNames.push(1);
	}

	const sameTierNames = twoTiers && firstName.toLowerCase() === secondName.toLowerCase();

	const unequalPairs = document.commonQuestions.filter((pair) => {
		const tier1 = tierEntries(document, 0).find((entry) => entry.id === pair.tier1EntryId);
		const tier2 = tierEntries(document, 1).find((entry) => entry.id === pair.tier2EntryId);
		return (
			tier1 === undefined ||
			tier2 === undefined ||
			tier1.marks === null ||
			tier2.marks === null ||
			tier1.marks !== tier2.marks
		);
	});

	return {
		blocked:
			tiers.some((blocker) => blocker.blocked) ||
			blankTierNames.length > 0 ||
			sameTierNames ||
			unequalPairs.length > 0,
		tiers,
		blankTierNames,
		sameTierNames,
		unequalPairs
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

/** How an entry differs from what the parse produced. */
export interface EntryEdits {
	/** The teacher supplied this entry; the parse never emitted it. */
	added: boolean;
	/** The fields changed since the parse, in `EDITABLE_FIELDS` order. */
	fields: EditableField[];
}

/**
 * What a teacher has changed about an entry, so the review table can mark it.
 * An entry imported before its parse values were recorded reports nothing:
 * there is nothing left to compare it against.
 */
export function entryEdits(entry: BreakdownEntry): EntryEdits {
	const original = entry.original;
	if (original === null) return { added: true, fields: [] };
	return {
		added: false,
		fields: EDITABLE_FIELDS.filter((field) => original[field] !== entry[field])
	};
}

/** What to call a band in prose: its question number, or a stand-in while it has none. */
export function bandName(band: QuestionBand): string {
	return band.questionNumber === '' ? '(none)' : band.questionNumber;
}

/**
 * Whether a band's question number came from the parse's fallback rather than
 * from the paper: an entry that still carries the finding and still bands under
 * its own label. Correcting the number on the breakdown page clears it, so the
 * flag always describes the breakdown as it stands.
 */
export function isFallbackBand(band: QuestionBand, warnings: readonly StoredWarning[]): boolean {
	return band.entries.some(
		(entry) =>
			entry.questionNumber.trim() === entry.label.trim() &&
			warningsForEntry(warnings, entry.id).some(
				(warning) => warning.code === MISSING_QUESTION_NUMBER
			)
	);
}

/** The bands whose question number the parse could not read. */
export function fallbackBands(
	bands: readonly QuestionBand[],
	warnings: readonly StoredWarning[]
): QuestionBand[] {
	return bands.filter((band) => isFallbackBand(band, warnings));
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

/**
 * Why the band is flagged: the findings that say the parse could not read its
 * question number, rather than anything else the parse said about its rows.
 */
export function fallbackExplanation(
	band: QuestionBand,
	warnings: readonly StoredWarning[]
): string {
	return band.entries
		.flatMap((entry) => warningsForEntry(warnings, entry.id))
		.filter((warning) => warning.code === MISSING_QUESTION_NUMBER)
		.map((warning) => warning.message)
		.join(' ');
}

/** The assessment objectives any entry carries, in AO order: the ones a description is worth having for. */
export function usedAssessmentObjectives(
	entries: readonly BreakdownEntry[]
): AssessmentObjective[] {
	return ASSESSMENT_OBJECTIVES.filter((ao) => entries.some((entry) => entry.ao === ao));
}
