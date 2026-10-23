// The app's marksheet store: the one instance the routes render from, wired to
// this browser's storage and clock.

import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { analysisCsvFile, marksCsvFile, saveFile } from './download.js';
import type { DocumentStorage } from './persistence.svelte.js';
import { MarksheetStore } from './store.svelte.js';
import { prototypeStorage } from '$lib/prototypes/single-tier/seed.js';

/** Reaching for `localStorage` itself throws in some sandboxed and private contexts. */
function browserStorage(): DocumentStorage {
	try {
		return window.localStorage;
	} catch {
		return {
			length: 0,
			key: () => null,
			getItem: () => null,
			setItem: () => {
				throw new Error('Browser storage is unavailable.');
			},
			removeItem: () => undefined
		};
	}
}

let instance: MarksheetStore | null = null;

export function marksheetStore(): MarksheetStore {
	if (instance) return instance;

	// PROTOTYPE (#118): any ?variant= URL renders an in-memory single-tier 8463 1H document.
	const prototype = new URLSearchParams(window.location.search).has('variant');
	const store = new MarksheetStore({
		storage: prototype ? prototypeStorage(window.location.pathname) : browserStorage(),
		now: () => new Date()
	});
	// A debounced write loses the last keystrokes when the tab is hidden or closed.
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') store.flush();
	});
	window.addEventListener('pagehide', () => store.flush());
	instance = store;
	return store;
}

/** Go to the surface the document in hand allows: the store, not the caller, knows which. */
export function goToSurface(): void {
	void goto(resolve(marksheetStore().route()));
}

/**
 * Take a backup and hand it to the browser: the one action every "Back up now"
 * in the app performs. It is the mark of a backup having been taken — the moment
 * is recorded — so it is written once rather than at each button. It says
 * whether a copy was handed out, for the surfaces that report one being taken.
 */
export function backUpNow(): boolean {
	const file = marksheetStore().takeBackup();
	if (!file) return false;
	saveFile(file);
	return true;
}

/**
 * Hand the marks to the browser as a spreadsheet. The second document action,
 * and deliberately not the first: what it writes cannot be restored from, and
 * nothing it does touches the age of the backup that can.
 */
export function exportMarksNow(): void {
	const document = marksheetStore().document;
	if (document) saveFile(marksCsvFile(document));
}

/**
 * Hand the analysis figures to the browser as a spreadsheet. Like the marks
 * export it is one-way and leaves the backup's age alone.
 */
export function exportAnalysisNow(): void {
	const document = marksheetStore().document;
	if (document) saveFile(analysisCsvFile(document, new Date()));
}
