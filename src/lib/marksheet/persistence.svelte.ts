// Persistence: the document's one route to and from storage, with the debounced
// autosave and the save state the status bar reports. It knows nothing of what
// the document means; the store hands it whatever is in hand to write.

import {
	CORRUPT_KEY_PREFIX,
	STORAGE_KEY,
	parseStoredDocument,
	type MarksheetDocument
} from './document.js';

/** Autosave window: a burst of typing becomes one write. */
export const AUTOSAVE_DEBOUNCE_MS = 500;

/** The slice of the Web Storage API the store needs. */
export interface DocumentStorage {
	readonly length: number;
	key(index: number): string | null;
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

/** Whether the document in hand has reached storage. */
export type SaveState =
	| { kind: 'saved'; at: Date }
	| { kind: 'saving' }
	/**
	 * A refused write stops autosave. `since` is when the document last reached
	 * storage: everything after that moment lives only in this tab.
	 */
	| { kind: 'failed'; since: Date }
	/**
	 * Another tab has written the marksheet since this one last read it, so this
	 * tab's copy is out of date. It never writes again, whatever the teacher
	 * does: the next page load shows the other tab's version.
	 */
	| { kind: 'stale' }
	| { kind: 'unavailable' };

/** A stored document that could not be read, and where a copy of it was kept. */
export interface Unreadable {
	preservedKey: string | null;
	raw: string;
}

/** What storage held. */
export type StoredRead =
	/** Nothing stored, or no storage (`saveState` says which). */
	| { kind: 'empty' }
	| { kind: 'ready'; document: MarksheetDocument }
	| { kind: 'corrupt'; unreadable: Unreadable };

export interface PersistenceDeps {
	storage: DocumentStorage;
	now: () => Date;
	debounceMs: number;
	/** The document in hand: what every write writes. */
	current: () => MarksheetDocument | null;
}

/**
 * MDN's storage-availability probe: private browsing exposes storage that
 * refuses writes. A write refused for quota on a storage that already holds
 * data is a full store, not an absent one — the stored document must still be read.
 */
function storageAvailable(storage: DocumentStorage): boolean {
	const probeKey = 'qla:storage-probe';
	try {
		storage.setItem(probeKey, '1');
		storage.removeItem(probeKey);
		return true;
	} catch (error) {
		return isQuotaError(error) && storage.length !== 0;
	}
}

function isQuotaError(error: unknown): boolean {
	return (
		error instanceof DOMException &&
		(error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
	);
}

/**
 * An existing preserved copy of this payload, if there is one. Every route
 * visits the gate and every page load starts a fresh store, so without this a
 * single unreadable document would leave a copy behind per visit.
 */
function preservedCopyOf(storage: DocumentStorage, raw: string): string | null {
	for (let index = 0; index < storage.length; index++) {
		const key = storage.key(index);
		if (key === null || !key.startsWith(CORRUPT_KEY_PREFIX)) continue;
		if (storage.getItem(key) === raw) return key;
	}
	return null;
}

/** Run `run` after `ms`, returning a cancel function. Keeps the timer handle's type local. */
function scheduleTimer(ms: number, run: () => void): () => void {
	const handle = setTimeout(run, ms);
	return () => clearTimeout(handle);
}

/**
 * Ask the browser to keep this origin's storage rather than evict it under
 * pressure. Best-effort and silent: the backup control is the real safety net,
 * and a browser without the API (or one that says no) changes nothing here.
 */
export function requestPersistentStorage(): void {
	if (typeof navigator === 'undefined' || navigator.storage?.persist === undefined) return;
	void navigator.storage.persist().catch(() => undefined);
}

export class DocumentPersistence {
	readonly #deps: PersistenceDeps;
	#cancelTimer: (() => void) | null = null;
	/**
	 * When the document last reached storage. A plain moment, never mutated in
	 * place, so it needs no reactive wrapper.
	 */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	#savedAt: Date = new Date(0);

	// A placeholder the constructor immediately replaces: never mutated, so it
	// needs no reactive wrapper.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	saveState = $state<SaveState>({ kind: 'saved', at: new Date(0) });

	constructor(deps: PersistenceDeps) {
		this.#deps = deps;
		this.#markSaved();
	}

	/** Read what storage holds, and settle the save state to match. */
	read(): StoredRead {
		const { storage, now } = this.#deps;
		if (!storageAvailable(storage)) {
			this.saveState = { kind: 'unavailable' };
			return { kind: 'empty' };
		}
		this.#markSaved();

		const raw = storage.getItem(STORAGE_KEY);
		if (raw === null) return { kind: 'empty' };

		const document = parseStoredDocument(raw);
		if (document) return { kind: 'ready', document };

		// Never delete what we cannot read: a validator bug must not take the
		// teacher's only copy with it.
		let preservedKey: string | null = preservedCopyOf(storage, raw);
		if (preservedKey === null) {
			const key = `${CORRUPT_KEY_PREFIX}${now().toISOString()}`;
			try {
				storage.setItem(key, raw);
				preservedKey = key;
			} catch {
				// No copy was made: the original is still under its own key, and
				// the alert says so rather than naming a key that does not exist.
			}
		}
		return { kind: 'corrupt', unreadable: { preservedKey, raw } };
	}

	/** The document changed: save it on the debounce, unless saving has stopped. */
	changed(): void {
		// A failed write stops autosave rather than retrying behind the teacher's back.
		if (this.#writesStopped()) return;
		this.saveState = { kind: 'saving' };
		this.#cancelPending();
		this.#cancelTimer = scheduleTimer(this.#deps.debounceMs, () => {
			this.#cancelTimer = null;
			this.writeNow();
		});
	}

	/** Write the document in hand now, on the teacher's say rather than the debounce. */
	writeNow(): void {
		this.#cancelPending();
		const document = this.#deps.current();
		if (!document || this.saveState.kind === 'unavailable' || this.saveState.kind === 'stale') {
			return;
		}
		try {
			this.#deps.storage.setItem(STORAGE_KEY, JSON.stringify(document));
		} catch {
			this.saveState = { kind: 'failed', since: this.#savedAt };
			return;
		}
		this.#markSaved();
	}

	/**
	 * Try the refused write again, on the teacher's say. On success the document
	 * is saved and autosave resumes; on another refusal the state stays failed.
	 * Only a refused write is retried: no storage and a stale tab are not fixed
	 * by writing again.
	 */
	retry(): void {
		if (this.saveState.kind !== 'failed') return;
		this.writeNow();
	}

	/**
	 * Another tab changed storage. A write to, or removal of, the marksheet key
	 * leaves this tab's copy stale; any other key is none of this tab's business.
	 * A `null` key is the whole storage being cleared.
	 */
	changedElsewhere(key: string | null): void {
		if (key !== null && key !== STORAGE_KEY) return;
		if (this.saveState.kind === 'unavailable') return;
		this.#cancelPending();
		this.saveState = { kind: 'stale' };
	}

	/** Write anything pending now: a hidden or closing tab must not lose keystrokes. */
	flush(): void {
		if (this.#cancelTimer !== null) this.writeNow();
	}

	/** Remove the stored document. */
	clear(): void {
		this.#cancelPending();
		// A stale tab leaves the other tab's document alone.
		if (this.saveState.kind === 'stale') return;
		try {
			this.#deps.storage.removeItem(STORAGE_KEY);
		} catch {
			// Nothing to do: in-memory state is gone either way.
		}
		if (this.saveState.kind !== 'unavailable') this.#markSaved();
	}

	/** A refused write, no storage and a stale tab each stop autosave for good. */
	#writesStopped(): boolean {
		const { kind } = this.saveState;
		return kind === 'failed' || kind === 'unavailable' || kind === 'stale';
	}

	#cancelPending(): void {
		this.#cancelTimer?.();
		this.#cancelTimer = null;
	}

	/** The document is in storage as of now: nothing after this moment is only in this tab. */
	#markSaved(): void {
		this.#savedAt = this.#deps.now();
		this.saveState = { kind: 'saved', at: this.#savedAt };
	}
}
