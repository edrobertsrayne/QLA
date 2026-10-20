// The one topic roll-up: shared by the browser (live figures on the page, the
// request body) and the server (what the model receives), so both always
// agree on what a topic row means.

import { specPointCodes, type MarksheetDocument } from './document.js';

/** Marks gained and available across the entries carrying one topic name. */
export interface TopicTotals {
	name: string;
	gained: number;
	available: number;
}

/** Topic names of one entry: each normalised code's name, or the bare code while unnamed. */
export function topicNamesFor(document: MarksheetDocument, specPoint: string | null): string[] {
	return specPointCodes(specPoint).map((code) => document.topicNames[code]?.trim() || code);
}

/**
 * Marks per topic name. An entry counts once toward each distinct name it
 * carries; entries with none count nowhere. Rows keep first-seen order.
 */
export function rollupByTopic(
	entries: readonly { topics: readonly string[]; gained: number; available: number }[]
): TopicTotals[] {
	const totals = new Map<string, TopicTotals>();
	for (const entry of entries) {
		for (const name of new Set(entry.topics)) {
			const row = totals.get(name) ?? { name, gained: 0, available: 0 };
			row.gained += entry.gained;
			row.available += entry.available;
			totals.set(name, row);
		}
	}
	return [...totals.values()];
}
