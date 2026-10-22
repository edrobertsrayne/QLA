// What the route specs share: the page or shell a test opens, the way a route
// opens it. Test-only: nothing in the app imports this.

import { createRawSnippet, type Component } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { marksheetStore } from '$lib/marksheet/index.js';
import Layout from './+layout.svelte';

/** A page, rendered after the gate has read storage, as a route renders it. */
export function openPage<P extends Record<string, unknown>>(component: Component<P>, props?: P) {
	marksheetStore().load();
	return render(component, props);
}

/** A stand-in for whichever surface the route would render inside the shell. */
const surface = createRawSnippet(() => ({
	render: () => '<p data-testid="surface">a surface</p>'
}));

/** The shell as a route renders it: the layout, around a surface. */
export function openShell() {
	marksheetStore().load();
	return render(Layout, { children: surface });
}
