// The analysis surfaces the route can open: one tier's chart, or the
// common-questions comparison when pairs exist.

import type { TierIndex } from '$lib/marksheet/document.js';

export type AnalysisTab = TierIndex | 'common';
