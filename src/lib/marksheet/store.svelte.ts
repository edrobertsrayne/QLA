// The marksheet document store: one client-side owner of the stored document.
//
// Load, validate, mutate, persist and derive all happen here, over an injected
// `Storage`-like dependency and clock, so every failure mode and the autosave
// debounce are testable without a browser. Routes render straight from the
// reactive state; every change goes through a command, never by poking the
// document directly.

import type { Breakdown, ParseUsage, ParseWarning } from '$lib/server/parse/schema.js';
import { SvelteDate } from 'svelte/reactivity';
import {
	CORRUPT_KEY_PREFIX,
	DOCUMENT_SCHEMA_VERSION,
	STORAGE_KEY,
	dropUnreachableMarks,
	labelFromFilename,
	parseStoredDocument
} from './document.js';
import type { BreakdownEntry, MarksheetDocument, StoredWarning } from './document.js';

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

export interface MarksheetStoreDeps {
	storage: DocumentStorage;
	now: () => Date;
	debounceMs?: number;
}

/** What `load()` found in storage. */
export type LoadResult =
	| { kind: 'empty' }
	| { kind: 'ready'; document: MarksheetDocument }
	| { kind: 'corrupt'; preservedKey: string; raw: string }
	| { kind: 'unavailable' };

/** Whether the document in hand has reached storage. */
export type SaveState =
	| { kind: 'saved'; at: Date }
	| { kind: 'saving' }
	| { kind: 'failed'; message: string }
	| { kind: 'unavailable' };

/** The surface the stored state allows. */
export type BootRoute = '/' | '/breakdown' | '/marksheet';

export interface CreateFromParseInput {
	breakdown: Breakdown;
	warnings: ParseWarning[];
	/** Shown for this session; never stored. */
	usage: ParseUsage;
	filenames: string[];
}

function newEntryId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** MDN's storage-availability probe: private browsing exposes storage that refuses writes. */
function storageAvailable(storage: DocumentStorage): boolean {
	const probeKey = 'qla:storage-probe';
	try {
		storage.setItem(probeKey, '1');
		storage.removeItem(probeKey);
		return true;
	} catch {
		return false;
	}
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

export class MarksheetStore {
	readonly #storage: DocumentStorage;
	readonly #now: () => Date;
	readonly #debounceMs: number;
	#cancelTimer: (() => void) | null = null;
	#loaded = false;
	/** Changes not yet in storage: in-memory state wins over a re-read. */
	#unsaved = false;
	/** A failed write stops autosave rather than retrying behind the teacher's back. */
	#failed = false;
	#unavailable = false;

	#loadResult: LoadResult = { kind: 'empty' };

	document = $state<MarksheetDocument | null>(null);
	saveState = $state<SaveState>({ kind: 'saved', at: new SvelteDate(0) });
	/** This session's parse cost. Absent after a reload. */
	runUsage = $state<ParseUsage | null>(null);

	constructor(deps: MarksheetStoreDeps) {
		this.#storage = deps.storage;
		this.#now = deps.now;
		this.#debounceMs = deps.debounceMs ?? AUTOSAVE_DEBOUNCE_MS;
		this.saveState = { kind: 'saved', at: this.#now() };
	}

	/**
	 * Read the stored document. Safe to call once per navigation: it re-reads
	 * storage only when the tab holds nothing unsaved, so a guard can never
	 * clobber marks typed but not yet written.
	 */
	load(): LoadResult {
		if (this.#loaded && this.#unsaved) return this.#loadResult;

		this.#loaded = true;
		this.#failed = false;

		if (!storageAvailable(this.#storage)) {
			this.#unavailable = true;
			return this.#settle({ kind: 'unavailable' }, null, { kind: 'unavailable' });
		}
		this.#unavailable = false;

		const raw = this.#storage.getItem(STORAGE_KEY);
		if (raw === null) {
			return this.#settle({ kind: 'empty' }, null, { kind: 'saved', at: this.#now() });
		}

		const document = parseStoredDocument(raw);
		if (!document) {
			// Never delete what we cannot read: a validator bug must not take the
			// teacher's only copy with it.
			let preservedKey = preservedCopyOf(this.#storage, raw);
			if (preservedKey === null) {
				preservedKey = `${CORRUPT_KEY_PREFIX}${this.#now().toISOString()}`;
				try {
					this.#storage.setItem(preservedKey, raw);
				} catch {
					// Best effort: the original is still under its own key.
				}
			}
			return this.#settle({ kind: 'corrupt', preservedKey, raw }, null, {
				kind: 'saved',
				at: this.#now()
			});
		}

		this.#unsaved = false;
		const loaded = dropUnreachableMarks(document);
		return this.#settle({ kind: 'ready', document: loaded }, loaded, {
			kind: 'saved',
			at: this.#now()
		});
	}

	/** The surface the stored state allows. */
	route(): BootRoute {
		const document = this.document;
		if (!document) return '/';
		return document.breakdownConfirmedAt === null ? '/breakdown' : '/marksheet';
	}

	/**
	 * The parse handoff: a run that validated becomes the stored document at
	 * once, unconfirmed, so a reload before the teacher has read it costs
	 * nothing. `usage` stays in memory.
	 */
	createFromParse(input: CreateFromParseInput): void {
		const at = this.#now();
		const entries: BreakdownEntry[] = input.breakdown.questions.map((question) => ({
			id: newEntryId(),
			label: question.id,
			questionNumber: question.questionNumber,
			marks: question.marks,
			summary: question.summary,
			specPoint: question.specPoint,
			commandWord: question.commandWord,
			ao: question.ao
		}));
		const entryIdFor = (label: string | null): string | null => {
			if (label === null) return null;
			const index = input.breakdown.questions.findIndex((question) => question.id === label);
			return index === -1 ? null : entries[index].id;
		};
		const warnings: StoredWarning[] = input.warnings.map((warning) => ({
			...warning,
			// A finding about an entry the parse did not emit cannot follow a row,
			// so it is kept beside the table rather than dropped.
			questionId: entryIdFor(warning.questionId)
		}));

		const document: MarksheetDocument = {
			schemaVersion: DOCUMENT_SCHEMA_VERSION,
			createdAt: at.toISOString(),
			updatedAt: at.toISOString(),
			breakdownConfirmedAt: null,
			lastExportedAt: null,
			paper: {
				label: labelFromFilename(input.filenames[0]),
				className: null,
				sourceFilenames: [...input.filenames],
				parsedAt: at.toISOString()
			},
			breakdown: { entries, warnings },
			students: [],
			marks: {}
		};
		this.runUsage = input.usage;
		this.#loaded = true;
		this.#settle({ kind: 'ready', document }, document);
		this.#write();
	}

	/** Rename the paper. Blank means no label. */
	setPaperLabel(label: string): void {
		const document = this.document;
		if (!document) return;
		const trimmed = label.trim();
		document.paper.label = trimmed === '' ? null : trimmed;
		this.#mutated();
	}

	/** Write anything pending now: a hidden or closing tab must not lose keystrokes. */
	flush(): void {
		if (this.#cancelTimer === null) return;
		this.#write();
	}

	/** New upload: discard the marksheet document and nothing else. */
	wipe(): void {
		this.#cancelPending();
		try {
			this.#storage.removeItem(STORAGE_KEY);
		} catch {
			// Nothing to do: in-memory state is gone either way.
		}
		this.#loaded = true;
		this.#unsaved = false;
		this.#failed = false;
		this.runUsage = null;
		this.#settle(
			{ kind: 'empty' },
			null,
			this.#unavailable ? { kind: 'unavailable' } : { kind: 'saved', at: this.#now() }
		);
	}

	/** Adopt the state a load or a wipe found, and hand it back to the caller. */
	#settle(
		result: LoadResult,
		document: MarksheetDocument | null,
		saveState?: SaveState
	): LoadResult {
		this.document = document;
		// A ready result carries the store's own document — the reactive proxy,
		// not the plain object it was parsed or built from.
		this.#loadResult =
			result.kind === 'ready' && this.document
				? { kind: 'ready', document: this.document }
				: result;
		if (saveState) this.saveState = saveState;
		return this.#loadResult;
	}

	/** Every command ends here: stamp the change, then save on the debounce. */
	#mutated(): void {
		const document = this.document;
		if (!document) return;
		document.updatedAt = this.#now().toISOString();
		this.#unsaved = true;
		if (this.#failed || this.#unavailable) return;
		this.saveState = { kind: 'saving' };
		this.#schedule();
	}

	#schedule(): void {
		this.#cancelPending();
		this.#cancelTimer = scheduleTimer(this.#debounceMs, () => {
			this.#cancelTimer = null;
			this.#write();
		});
	}

	#cancelPending(): void {
		this.#cancelTimer?.();
		this.#cancelTimer = null;
	}

	#write(): void {
		const document = this.document;
		if (!document) return;
		this.#cancelPending();
		document.updatedAt = this.#now().toISOString();
		// Nothing may re-read storage over this document until it has landed:
		// a refused or unavailable write leaves it only in this tab.
		this.#unsaved = true;
		if (this.#unavailable) return;
		try {
			this.#storage.setItem(STORAGE_KEY, JSON.stringify(document));
		} catch (error) {
			this.#failed = true;
			this.saveState = {
				kind: 'failed',
				message: error instanceof Error ? error.message : 'The document could not be saved.'
			};
			return;
		}
		this.#unsaved = false;
		this.#failed = false;
		this.saveState = { kind: 'saved', at: this.#now() };
	}
}
