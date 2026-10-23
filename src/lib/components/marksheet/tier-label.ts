// How a tier is named on the marksheet: its number always, its printed name
// when the paper carried one. One home for the wording the tabs, the buttons,
// the toast and the export all show.

import type { MarksheetDocument, TierIndex } from '$lib/marksheet/document.js';

/** Which tab the marksheet has open: a tier, or the students still to be placed. */
export type MarksheetTab = TierIndex | 'unset';

/** The tab and toast wording: `Tier 1 · Higher`, or `Tier 1` when nothing was printed. */
export function tierLabel(document: MarksheetDocument | null, tier: TierIndex): string {
	const name = document?.tiers[tier]?.tierName ?? null;
	return name === null ? `Tier ${tier + 1}` : `Tier ${tier + 1} · ${name}`;
}

/** The word for a button or a file: the printed name, or `Tier 1` when there is none. */
export function tierNameLabel(document: MarksheetDocument | null, tier: TierIndex): string {
	return document?.tiers[tier]?.tierName ?? `Tier ${tier + 1}`;
}
