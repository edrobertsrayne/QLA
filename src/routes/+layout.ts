import { redirect } from '@sveltejs/kit';
import { marksheetStore } from '$lib/marksheet/index.js';

// The stored marksheet document lives in localStorage, so every route renders
// on the client: the synchronous read is the first paint, with no loading
// skeleton and no flash of a surface the stored state does not allow.
export const ssr = false;

/** Every surface is the one the stored state allows: anything else redirects before it paints. */
export function load({ url }: { url: URL }): void {
	if (url.pathname.startsWith('/prototype/')) return; // PROTOTYPE (#53): throwaway routes skip the guard.
	const store = marksheetStore();
	store.load();
	const route = store.route();
	if (url.pathname !== route) redirect(307, route);
}
