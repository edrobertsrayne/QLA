// Turning a finished upload into the marksheet document it becomes.
//
// One pure builder over the parse handoff: entry ids generated on this device,
// each tier's warnings pinned to its own entries, the assessment's label and
// shared AO descriptions resolved, and the proposed common-question labels
// mapped to entry ids. The store adopts what this returns; nothing here touches
// storage or reactive state.

import type { AssessmentObjective } from '$lib/parse/assessment-objectives.js';
import type { Breakdown, ParseUsage, ParseWarning } from '$lib/server/parse/schema.js';
import {
	DEFAULT_BELOW_LOWEST_LABEL,
	DOCUMENT_SCHEMA_VERSION,
	labelFromFilename,
	localId,
	type AoDescriptions,
	type BreakdownEntry,
	type CommonQuestion,
	type EntryValues,
	type MarksheetDocument,
	type StoredTier,
	type StoredWarning
} from './document.js';

/** One tier as the upload run parsed it: the tier name it read, and its breakdown. */
export interface TierParse {
	tierName: string | null;
	breakdown: Breakdown;
	warnings: ParseWarning[];
	filenames: string[];
}

/** A finished upload: one or two tiers' parses, the proposed pairs (parse labels) and what it spent. */
export interface CreateFromAssessmentInput {
	tiers: [TierParse] | [TierParse, TierParse];
	pairs: { tier1Id: string; tier2Id: string }[];
	/** Shown for this session; never stored. */
	usage: ParseUsage;
	/** Why matching proposed no pairs, when it failed; shown on the review page this session. */
	matchNotice?: string | null;
}

/** A field the teacher has cleared means "none", not an empty string. */
export function trimOrNull(value: string | null): string | null {
	const trimmed = value?.trim() ?? '';
	return trimmed === '' ? null : trimmed;
}

/** Sets a trimmed AO description, or removes the key when it is blank. */
export function applyAoDescription(
	descriptions: AoDescriptions,
	ao: AssessmentObjective,
	text: string | null
): void {
	const trimmed = trimOrNull(text);
	if (trimmed === null) delete descriptions[ao];
	else descriptions[ao] = trimmed;
}

/** Entry ids by parse label, for labels the parse emitted exactly once. */
function uniqueIdsByLabel(entries: readonly BreakdownEntry[]): Map<string, string> {
	const counts = new Map<string, number>();
	for (const entry of entries) counts.set(entry.label, (counts.get(entry.label) ?? 0) + 1);

	const ids = new Map<string, string>();
	for (const entry of entries) {
		if (counts.get(entry.label) === 1) ids.set(entry.label, entry.id);
	}
	return ids;
}

/**
 * The document a finished upload becomes: one tier or two, unconfirmed, with
 * the proposed pairs that survive the rules below and nothing else filled in.
 */
export function assessmentFromParses(
	input: CreateFromAssessmentInput,
	at: Date
): MarksheetDocument {
	const tiers: StoredTier[] = input.tiers.map((parse) => {
		const entries: BreakdownEntry[] = parse.breakdown.questions.map((question) => {
			const values: EntryValues = {
				label: question.id,
				questionNumber: question.questionNumber,
				marks: question.marks,
				summary: question.summary,
				specPoint: question.specPoint,
				commandWord: question.commandWord,
				ao: question.ao
			};
			// What the parse produced, so the review table can show what has been
			// changed since.
			return { id: localId(), ...values, original: { ...values } };
		});
		const entryIdFor = (label: string | null): string | null => {
			if (label === null) return null;
			const matches = parse.breakdown.questions.filter((question) => question.id === label);
			// Only a label naming exactly one entry can carry a finding. A label the
			// parse repeated, or one it never emitted (`q[3]` for an entry with no
			// id), cannot be pinned to a row, so it stays beside the table.
			return matches.length === 1
				? entries[parse.breakdown.questions.indexOf(matches[0])].id
				: null;
		};
		const warnings: StoredWarning[] = parse.warnings.map((warning) => ({
			...warning,
			questionId: entryIdFor(warning.questionId)
		}));

		return {
			tierName: trimOrNull(parse.tierName),
			sourceFilenames: [...parse.filenames],
			parsedAt: at.toISOString(),
			breakdown: { entries, warnings },
			boundaries: null,
			belowLowestLabel: DEFAULT_BELOW_LOWEST_LABEL
		};
	});

	// One shared description per objective: Tier 1's, with Tier 2 filling the
	// objectives it left blank.
	const aoDescriptions: AoDescriptions = {};
	for (const parse of input.tiers) {
		for (const { ao, description } of parse.breakdown.aoDescriptions) {
			if (aoDescriptions[ao] === undefined) applyAoDescription(aoDescriptions, ao, description);
		}
	}

	// A proposed pair becomes a stored pair only when both labels name one entry
	// each, both entries carry the same known marks, and neither entry is already
	// paired. The first claim wins.
	const firstEntries = tiers[0].breakdown.entries;
	const secondEntries = tiers[1]?.breakdown.entries ?? [];
	const ids1 = uniqueIdsByLabel(firstEntries);
	const ids2 = uniqueIdsByLabel(secondEntries);
	const entry1ById = new Map(firstEntries.map((entry) => [entry.id, entry]));
	const entry2ById = new Map(secondEntries.map((entry) => [entry.id, entry]));
	const paired1 = new Set<string>();
	const paired2 = new Set<string>();
	const commonQuestions: CommonQuestion[] = [];
	for (const proposed of input.pairs) {
		const tier1EntryId = ids1.get(proposed.tier1Id);
		const tier2EntryId = ids2.get(proposed.tier2Id);
		if (tier1EntryId === undefined || tier2EntryId === undefined) continue;
		const tier1Entry = entry1ById.get(tier1EntryId);
		const tier2Entry = entry2ById.get(tier2EntryId);
		if (tier1Entry === undefined || tier2Entry === undefined) continue;
		if (
			tier1Entry.marks === null ||
			tier2Entry.marks === null ||
			tier1Entry.marks !== tier2Entry.marks
		) {
			continue;
		}
		if (paired1.has(tier1EntryId) || paired2.has(tier2EntryId)) continue;
		paired1.add(tier1EntryId);
		paired2.add(tier2EntryId);
		commonQuestions.push({ tier1EntryId, tier2EntryId });
	}

	return {
		schemaVersion: DOCUMENT_SCHEMA_VERSION,
		createdAt: at.toISOString(),
		updatedAt: at.toISOString(),
		breakdownConfirmedAt: null,
		lastExportedAt: null,
		firstUnbackedChangeAt: null,
		label: labelFromFilename(input.tiers[0].filenames[0]),
		className: null,
		aoDescriptions,
		tiers,
		students: [],
		marks: {},
		commonQuestions,
		topicNames: {},
		reports: {}
	};
}
