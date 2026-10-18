// The app's marksheet store: the one instance the routes render from, wired to
// this browser's storage and clock.

import { flushOnHide } from './flush.js';
import { saveFile } from './download.js';
import { MarksheetStore, type DocumentStorage } from './store.svelte.js';

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
 * is recorded — so it is written once rather than at each button.
 */
export function backUpNow(): void {
	const file = marksheetStore().takeBackup();
	if (file) saveFile(file);
}
