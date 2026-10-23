// What every analysis track shares: the text colour a band reads in, so a band
// looks the same on a tier tab and on the common-questions comparison, and the
// 0–100% scale both charts print.

import { facilityPercent, GREEN_FROM, RED_BELOW, type RagBand } from '$lib/marksheet/analysis.js';

export const BAND_TEXT: Record<RagBand, string> = {
	red: 'text-red-700 dark:text-red-300',
	amber: 'text-amber-700 dark:text-amber-300',
	green: 'text-emerald-700 dark:text-emerald-300'
};

/** The scale both analysis tracks print: the fixed thresholds among the round numbers. */
export const ANALYSIS_TICKS = [
	0,
	25,
	facilityPercent(RED_BELOW),
	50,
	facilityPercent(GREEN_FROM),
	100
];
