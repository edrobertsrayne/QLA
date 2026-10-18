// The app's marksheet store: the one instance the routes render from, wired to
// this browser's storage and clock.

import { flushOnHide } from './flush.js';
import { saveFile } from './download.js';
import type { DocumentStorage } from './persistence.svelte.js';
import { MarksheetStore } from './store.svelte.js';

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

	const store = new MarksheetStore({ storage: browserStorage(), now: () => new Date() });
	flushOnHide(() => store.flush(), {
		isHidden: () => document.visibilityState === 'hidden',
		on: (type, listener) => {
			if (type === 'visibilitychange') document.addEventListener(type, listener);
			else window.addEventListener(type, listener);
		}
	});
	instance = store;
	return store;
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
	const file = marksheetStore().exportMarksCsv();
	if (file) saveFile(file);
}
