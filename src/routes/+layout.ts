import { redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { marksheetStore } from '$lib/marksheet/index.js';

// The stored marksheet document lives in localStorage, so every route renders
// on the client: the synchronous read is the first paint, with no loading
// skeleton and no flash of a surface the stored state does not allow.
export const ssr = false;

/** Every surface is the one the stored state allows: anything else redirects before it paints. */
export function load({ url }: { url: URL }): void {
	const store = marksheetStore();
	store.load();
	const route = store.route();
	// PROTOTYPE (#92): throwaway mockups run on dummy data, whatever is stored.
	if (dev && url.pathname.startsWith('/prototype/')) return;
	if (url.pathname === route) return;
	// The report flow is part of the marksheet surface: a confirmed breakdown
	// may write and review reports without losing the marksheet underneath.
	if (url.pathname === '/reports' && route === '/marksheet') return;
	redirect(307, route);
}
