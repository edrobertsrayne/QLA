import { redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { demoDocument } from '$lib/components/shell/backup-prototype/demo-document.js';
import { marksheetStore } from '$lib/marksheet/index.js';

// The stored marksheet document lives in localStorage, so every route renders
// on the client: the synchronous read is the first paint, with no loading
// skeleton and no flash of a surface the stored state does not allow.
export const ssr = false;

/** Whether a path is part of the marksheet surface: the grid, its analysis, or a report step. */
function onMarksheetSurface(pathname: string): boolean {
	return (
		pathname === '/marksheet' ||
		pathname === '/marksheet/analysis' ||
		pathname === '/reports' ||
		pathname.startsWith('/reports/')
	);
}

/** Every surface is the one the stored state allows: anything else redirects before it paints. */
export function load({ url }: { url: URL }): void {
	const store = marksheetStore();
	store.load();
	// PROTOTYPE (#93): an empty browser gets a demo marksheet for the variants.
	if (dev && url.pathname === '/marksheet' && url.searchParams.has('variant'))
		if (store.route() === '/') store.restoreBackup(demoDocument());
	const route = store.route();
	if (url.pathname === route) return;
	// The analysis and the report flow are part of the marksheet surface: a
	// confirmed breakdown may analyse, write and review reports without losing
	// the marksheet underneath.
	if (route === '/marksheet' && onMarksheetSurface(url.pathname)) return;
	redirect(307, route);
}
