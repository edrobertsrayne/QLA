// The boot gate: which surface a route may render on.
//
// Every route calls this before it renders. The store reads storage
// synchronously, so a route that is not the one the stored state allows
// redirects before anything is painted.

import { redirect } from '@sveltejs/kit';
import { marksheetStore } from './index.js';
import type { BootRoute } from './store.svelte.js';

export function gateSurface(surface: BootRoute): void {
	const store = marksheetStore();
	store.load();
	const route = store.route();
	if (route !== surface) redirect(307, route);
}
