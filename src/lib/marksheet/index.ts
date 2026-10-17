// The app's marksheet store: the one instance the routes render from, wired to
// this browser's storage and clock.

import { flushOnHide } from './flush.js';
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
