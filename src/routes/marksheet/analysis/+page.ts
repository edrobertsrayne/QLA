import type { AnalysisTab } from '$lib/components/marksheet/analysis-tab.js';

/**
 * The tab and the entry the analysis was opened at. An absent or unknown tier
 * opens on Tier 1's chart; `entry` outlines that entry, or on the Common tab
 * the pair containing it. Both are checked against the document by the view,
 * so a tier this assessment does not have opens its one chart.
 */
export function load({ url }: { url: URL }): { tab: AnalysisTab | null; entry: string | null } {
	const tier = url.searchParams.get('tier');
	return {
		tab: tier === 'common' ? 'common' : tier === '1' ? 1 : tier === '0' ? 0 : null,
		entry: url.searchParams.get('entry')
	};
}
