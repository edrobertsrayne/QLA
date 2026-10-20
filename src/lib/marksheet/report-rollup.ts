// The one roll-up (by topic name, by assessment objective): shared by the browser (live figures on the page, the
// request body) and the server (what the model receives), so both always
// agree on what a topic row means.

import { specPointCodes, topicCodesOf, type MarksheetDocument } from './document.js';
import { MAX_LABEL_LENGTH } from './report-limits.js';

/** Marks gained and available across the entries carrying one name. */
export interface RollupTotals {
	name: string;
	gained: number;
	available: number;
}

/** Topic names of one entry: each normalised code's name, or the bare code while unnamed. */
export function topicNamesFor(document: MarksheetDocument, specPoint: string | null): string[] {
	return specPointCodes(specPoint).map((code) => document.topicNames[code]?.trim() || code);
}

/**
 * Marks per name. An entry counts once toward each distinct name `namesOf`
 * gives it; none counts nowhere. Rows keep first-seen order.
 */
export function rollupBy<T extends { gained: number; available: number }>(
	entries: readonly T[],
	namesOf: (entry: T) => readonly string[]
): RollupTotals[] {
	const totals = new Map<string, RollupTotals>();
	for (const entry of entries) {
		for (const name of new Set(namesOf(entry))) {
			const row = totals.get(name) ?? { name, gained: 0, available: 0 };
			row.gained += entry.gained;
			row.available += entry.available;
			totals.set(name, row);
		}
	}
	return [...totals.values()];
}

/** Codes the reports cannot be written or printed with yet: unnamed, or named past MAX_LABEL_LENGTH. */
export interface TopicNameGaps {
	missing: string[];
	overLong: string[];
	blocked: boolean;
}

export function topicNameGaps(document: MarksheetDocument): TopicNameGaps {
	const codes = topicCodesOf(document);
	const nameOf = (code: string): string => (document.topicNames[code] ?? '').trim();
	const missing = codes.filter((code) => nameOf(code) === '');
	const overLong = codes.filter((code) => nameOf(code).length > MAX_LABEL_LENGTH);
	return { missing, overLong, blocked: missing.length > 0 || overLong.length > 0 };
}
