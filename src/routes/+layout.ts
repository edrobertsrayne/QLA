import { redirect } from '@sveltejs/kit';
import { marksheetStore } from '$lib/marksheet/index.js';
import { seedIfAsked } from '$lib/prototypes/report-flow/seed.js';

// The stored marksheet document lives in localStorage, so every route renders
// on the client: the synchronous read is the first paint, with no loading
// skeleton and no flash of a surface the stored state does not allow.
export const ssr = false;

/** Every surface is the one the stored state allows: anything else redirects before it paints. */
export function load({ url }: { url: URL }): void {
	seedIfAsked(url); // PROTOTYPE (#54): sample class on a fresh origin.
	const store = marksheetStore();
	store.load();
	const route = store.route();
	if (url.pathname !== route) redirect(307, route);
}
