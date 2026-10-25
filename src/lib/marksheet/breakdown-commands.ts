// The breakdown edits that change the shape of a document: adding, removing and
// moving entries, and pairing them across tiers. Plain functions over a
// `MarksheetDocument`, mutating it in place the way the store's commands do;
// the store decides whether an edit is allowed, then commits and saves it.

import { entryName } from './breakdown.js';
import {
	entryTierOf,
	localId,
	otherTier,
	pairOfEntry,
	tierEntries,
	type BreakdownEntry,
	type CommonQuestion,
	type MarksheetDocument,
	type TierIndex
} from './document.js';

/** An entry the teacher adds: nothing claimed, everything to fill in. */
function blankEntry(questionNumber: string): BreakdownEntry {
	return {
		id: localId(),
		label: '',
		questionNumber,
		marks: null,
		summary: '',
		specPoint: null,
		commandWord: null,
		ao: null,
		original: null
	};
}

/**
 * Insert an entry the parse missed below the entry named, on that entry's
 * tier. It joins the question of the row it follows. Returns its id, or null
 * when the entry named is not in the document.
 */
export function insertEntryAfter(document: MarksheetDocument, entryId: string): string | null {
	const tier = entryTierOf(document, entryId);
	if (tier === null) return null;
	const entries = document.tiers[tier].breakdown.entries;
	const after = entries.findIndex((entry) => entry.id === entryId);
	if (after === -1) return null;

	const entry = blankEntry(entries[after].questionNumber);
	entries.splice(after + 1, 0, entry);
	return entry.id;
}

/**
 * Add an entry at the end of one tier's breakdown, a question of its own for
 * the teacher to number. Returns its id, or null when the tier does not exist.
 */
export function appendEntry(document: MarksheetDocument, tier: TierIndex): string | null {
	const stored = document.tiers[tier];
	if (stored === undefined) return null;

	const entry = blankEntry('');
	stored.breakdown.entries.push(entry);
	return entry.id;
}

/**
 * Take an entry out, with what was recorded against it: its findings, the
 * marks entered on it and any common question it belonged to. Nothing can
 * reach those again, so they would sit in the document unread. Returns the
 * entry's name, or null when it is not in the document.
 */
export function removeEntry(document: MarksheetDocument, entryId: string): string | null {
	let removed: BreakdownEntry | undefined;
	for (const stored of document.tiers) {
		const entries = stored.breakdown.entries;
		const index = entries.findIndex((entry) => entry.id === entryId);
		if (index === -1) continue;
		[removed] = entries.splice(index, 1);
		stored.breakdown.warnings = stored.breakdown.warnings.filter(
			(warning) => warning.questionId !== entryId
		);
		break;
	}
	if (removed === undefined) return null;

	for (const byEntry of Object.values(document.marks)) delete byEntry[entryId];
	document.commonQuestions = document.commonQuestions.filter(
		(pair) => pair.tier1EntryId !== entryId && pair.tier2EntryId !== entryId
	);
	return entryName(removed);
}

/** Move an entry one place up or down within its tier. Says whether it moved. */
export function moveEntry(document: MarksheetDocument, entryId: string, offset: -1 | 1): boolean {
	const tier = entryTierOf(document, entryId);
	if (tier === null) return false;
	const entries = document.tiers[tier].breakdown.entries;
	const from = entries.findIndex((entry) => entry.id === entryId);
	const to = from + offset;
	if (from === -1 || to < 0 || to >= entries.length) return false;

	const [entry] = entries.splice(from, 1);
	entries.splice(to, 0, entry);
	return true;
}

/**
 * The pairs the document would hold once an entry is paired with `partnerId`
 * on the other tier, or unpaired when that is null; null when the change is
 * refused or changes nothing. Both entries must exist on different tiers and
 * carry the same known marks, and a partner already paired elsewhere is
 * refused.
 */
export function commonQuestionsAfter(
	document: MarksheetDocument,
	tier: TierIndex,
	entryId: string,
	partnerId: string | null
): CommonQuestion[] | null {
	if (entryTierOf(document, entryId) !== tier) return null;

	const current = pairOfEntry(document, tier, entryId);
	const without = document.commonQuestions.filter(
		(pair) => pair.tier1EntryId !== entryId && pair.tier2EntryId !== entryId
	);
	if (partnerId === null) return current === null ? null : without;

	const other = otherTier(tier);
	const partner = tierEntries(document, other).find((entry) => entry.id === partnerId);
	const entry = tierEntries(document, tier).find((candidate) => candidate.id === entryId);
	if (entry === undefined || partner === undefined) return null;
	if (entry.marks === null || partner.marks === null) return null;
	if (entry.marks !== partner.marks) return null;
	const partnerPair = pairOfEntry(document, other, partnerId);
	if (partnerPair !== null && partnerPair !== current) return null;

	const pairedId =
		current === null ? null : tier === 0 ? current.tier2EntryId : current.tier1EntryId;
	if (pairedId === partnerId) return null;

	return [
		...without,
		tier === 0
			? { tier1EntryId: entryId, tier2EntryId: partnerId }
			: { tier1EntryId: partnerId, tier2EntryId: entryId }
	];
}
