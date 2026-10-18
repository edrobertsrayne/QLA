// The marksheet document store: one client-side owner of the stored document.
//
// Load, validate, mutate, persist and derive all happen here, over an injected
// `Storage`-like dependency and clock, so every failure mode and the autosave
// debounce are testable without a browser. Routes render straight from the
// reactive state; every change goes through a command, never by poking the
// document directly.

import type { Breakdown, ParseUsage, ParseWarning } from '$lib/server/parse/schema.js';
import type { AssessmentObjective } from '$lib/parse/assessment-objectives.js';
import {
	confirmationBlockers,
	needsAttention,
	questionBands,
	type AttentionItem,
	type ConfirmationBlockers,
	type QuestionBand
} from './breakdown.js';
import {
	CORRUPT_KEY_PREFIX,
	DOCUMENT_SCHEMA_VERSION,
	STORAGE_KEY,
	dropUnreachableMarks,
	entryValuesOf,
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

/**
 * The one change undo would take back, held in memory for the session. The next
 * change clears it, so a second click can never take back two things.
 */
export type Undoable = {
	/** The entry as it was, and its place among the others. */
	entry: BreakdownEntry;
	index: number;
	/** The marks its students had gained on it, by student id. */
	marks: Record<string, number>;
	/** The parse's findings about it, as the breakdown held them before. */
	findings: StoredWarning[];
};

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

/** A field the teacher has cleared means "none", not an empty string. */
function trimOrNull(value: string | null): string | null {
	const trimmed = value?.trim() ?? '';
	return trimmed === '' ? null : trimmed;
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
	// A placeholder the constructor immediately replaces: never mutated, so it
	// needs no reactive wrapper.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	saveState = $state<SaveState>({ kind: 'saved', at: new Date(0) });
	/** This session's parse cost. Absent after a reload. */
	runUsage = $state<ParseUsage | null>(null);
	/** The one change undo would take back, or nothing. */
	undoable = $state<Undoable | null>(null);

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

	/** The bands the breakdown table groups its rows under. */
	get questionBands(): QuestionBand[] {
		return questionBands(this.document?.breakdown.entries ?? []);
	}

	/** What stops the breakdown being confirmed right now. */
	get blockers(): ConfirmationBlockers {
		return confirmationBlockers(this.document?.breakdown.entries ?? []);
	}

	/** The entries worth a second look before confirming, in document order. */
	get attention(): AttentionItem[] {
		const breakdown = this.document?.breakdown;
		return breakdown ? needsAttention(breakdown) : [];
	}

	/**
	 * The parse handoff: a run that validated becomes the stored document at
	 * once, unconfirmed, so a reload before the teacher has read it costs
	 * nothing. `usage` stays in memory.
	 */
	createFromParse(input: CreateFromParseInput): void {
		const at = this.#now();
		const entries: BreakdownEntry[] = input.breakdown.questions.map((question) => {
			const entry: BreakdownEntry = {
				id: newEntryId(),
				label: question.id,
				questionNumber: question.questionNumber,
				marks: question.marks,
				summary: question.summary,
				specPoint: question.specPoint,
				commandWord: question.commandWord,
				ao: question.ao
			};
			// What the parse produced, so the review table can show what has been
			// changed since.
			entry.original = entryValuesOf(entry);
			return entry;
		});
		const entryIdFor = (label: string | null): string | null => {
			if (label === null) return null;
			const matches = input.breakdown.questions.filter((question) => question.id === label);
			// Only a label naming exactly one entry can carry a finding. A label the
			// parse repeated, or one it never emitted (`q[3]` for an entry with no
			// id), cannot be pinned to a row, so it stays beside the table.
			return matches.length === 1
				? entries[input.breakdown.questions.indexOf(matches[0])].id
				: null;
		};
		const warnings: StoredWarning[] = input.warnings.map((warning) => ({
			...warning,
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

	/** Edit a breakdown entry's label: display only, so no marks move. */
	setEntryLabel(entryId: string, label: string): void {
		this.#editEntries([entryId], (entry) => {
			entry.label = label.trim();
		});
	}

	/** Edit what the entry asks. */
	setEntrySummary(entryId: string, summary: string): void {
		this.#editEntries([entryId], (entry) => {
			entry.summary = summary;
		});
	}

	/**
	 * Re-band a whole band under one question number, or a single row when the
	 * table is not banded: the number belongs to the band rather than the row,
	 * so every entry in a run moves together.
	 */
	setBandQuestionNumber(entryIds: readonly string[], questionNumber: string): void {
		const number = questionNumber.trim();
		this.#editEntries(entryIds, (entry) => {
			entry.questionNumber = number;
		});
	}

	/**
	 * Set an entry's available marks, or null to leave it unknown. Only a
	 * positive whole number is taken: anything else is refused outright, so a
	 * typo cannot become a fractional or negative column. Marks already entered
	 * by students are never clamped to the new total.
	 */
	setEntryMarks(entryId: string, marks: number | null): void {
		if (marks !== null && (!Number.isInteger(marks) || marks < 1)) return;
		this.#editEntries([entryId], (entry) => {
			entry.marks = marks;
		});
	}

	/** Set the specification point. An empty field means none. */
	setEntrySpecPoint(entryId: string, specPoint: string | null): void {
		this.#editEntries([entryId], (entry) => {
			entry.specPoint = trimOrNull(specPoint);
		});
	}

	/** Set the command word. An empty field means none. */
	setEntryCommandWord(entryId: string, commandWord: string | null): void {
		this.#editEntries([entryId], (entry) => {
			entry.commandWord = trimOrNull(commandWord);
		});
	}

	/** Set the assessment objective, or null for none. */
	setEntryAo(entryId: string, ao: AssessmentObjective | null): void {
		this.#editEntries([entryId], (entry) => {
			entry.ao = ao;
		});
	}

	/**
	 * Insert an entry the parse missed below the entry named, and hand back its
	 * id. It joins the question of the row it follows, and carries nothing else:
	 * a blank label and no marks stop it being mistaken for something the parse
	 * found.
	 */
	insertEntryAfter(entryId: string): string | null {
		const document = this.#editable();
		if (!document) return null;

		const entries = document.breakdown.entries;
		const after = entries.findIndex((entry) => entry.id === entryId);
		if (after === -1) return null;

		const entry = this.#blankEntry(entries[after].questionNumber);
		entries.splice(after + 1, 0, entry);
		this.#mutated();
		return entry.id;
	}

	/**
	 * Add an entry at the end of the breakdown, and hand back its id. It is a
	 * question of its own for the teacher to number — the paper's last question
	 * is the one a parse most often misses — so numbering it moves no other row.
	 */
	appendEntry(): string | null {
		const document = this.#editable();
		if (!document) return null;

		const entry = this.#blankEntry('');
		document.breakdown.entries.push(entry);
		this.#mutated();
		return entry.id;
	}

	/** Delete an entry, leaving it — and what was recorded against it — one undo away. */
	deleteEntry(entryId: string): boolean {
		const document = this.#editable();
		if (!document) return false;

		const entries = document.breakdown.entries;
		const index = entries.findIndex((entry) => entry.id === entryId);
		if (index === -1) return false;
		const [entry] = entries.splice(index, 1);

		// What was recorded against the entry goes with it: nothing can reach it
		// again, so it would sit in the document unread.
		const marks: Record<string, number> = {};
		for (const [studentId, byEntry] of Object.entries(document.marks)) {
			if (byEntry[entryId] === undefined) continue;
			marks[studentId] = byEntry[entryId];
			delete byEntry[entryId];
		}
		const findings = document.breakdown.warnings;
		document.breakdown.warnings = findings.filter((warning) => warning.questionId !== entryId);

		// After the change, since the change itself clears any undo on offer.
		this.#mutated();
		this.undoable = {
			entry: $state.snapshot(entry),
			index,
			marks,
			findings: $state.snapshot(findings)
		};
		return true;
	}

	/**
	 * Take back the one change undo covers, if there is one, and say whether
	 * there was: a change the teacher does not want is then one click from gone.
	 */
	undo(): boolean {
		const document = this.#editable();
		const undoable = this.undoable;
		if (!document || !undoable) return false;

		const entries = document.breakdown.entries;
		entries.splice(Math.min(undoable.index, entries.length), 0, undoable.entry);
		for (const [studentId, mark] of Object.entries(undoable.marks)) {
			document.marks[studentId] ??= {};
			document.marks[studentId][undoable.entry.id] = mark;
		}
		// Nothing else can have touched them: any later change clears the undo.
		document.breakdown.warnings = undoable.findings;

		this.#mutated();
		return true;
	}

	/** Move an entry one place up or down, to put the columns in the paper's order. */
	moveEntry(entryId: string, offset: -1 | 1): boolean {
		const document = this.#editable();
		if (!document) return false;

		const entries = document.breakdown.entries;
		const from = entries.findIndex((entry) => entry.id === entryId);
		const to = from + offset;
		if (from === -1 || to < 0 || to >= entries.length) return false;

		const [entry] = entries.splice(from, 1);
		entries.splice(to, 0, entry);
		this.#mutated();
		return true;
	}

	/**
	 * Confirm the breakdown, unless something blocks the marksheet it would
	 * build: an entry with no marks, or a blank or repeated label. Returns
	 * whether the breakdown is confirmed, changing nothing when it is not.
	 */
	confirmBreakdown(): boolean {
		const document = this.document;
		if (!document) return false;
		if (document.breakdownConfirmedAt !== null) return true;
		if (confirmationBlockers(document.breakdown.entries).blocked) return false;

		document.breakdownConfirmedAt = this.#now().toISOString();
		this.#mutated();
		return true;
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

	/** An entry the teacher adds: nothing claimed, everything to fill in. */
	#blankEntry(questionNumber: string): BreakdownEntry {
		return {
			id: newEntryId(),
			label: '',
			questionNumber,
			marks: null,
			summary: '',
			specPoint: null,
			commandWord: null,
			ao: null,
			original: null
		};
	}

	/**
	 * The document as a command may change it. A confirmed breakdown is
	 * read-only, and the unlock that makes it editable again is an action of its
	 * own — so every breakdown edit starts here.
	 */
	#editable(): MarksheetDocument | null {
		const document = this.document;
		if (!document || document.breakdownConfirmedAt !== null) return null;
		return document;
	}

	/**
	 * Apply one edit to the entries a command targets, then autosave it. An edit
	 * naming no entry in the document changes nothing.
	 */
	#editEntries(entryIds: readonly string[], edit: (entry: BreakdownEntry) => void): void {
		const document = this.#editable();
		if (!document) return;

		let edited = false;
		for (const entryId of entryIds) {
			const entry = document.breakdown.entries.find((candidate) => candidate.id === entryId);
			if (!entry) continue;
			this.#rememberParseValues(entry);
			edit(entry);
			edited = true;
		}
		if (edited) this.#mutated();
	}

	/**
	 * Keep what an entry holds as the parse's values, for an entry imported
	 * before they were recorded: the edit about to be applied is then the
	 * difference the table shows, and later edits join it.
	 */
	#rememberParseValues(entry: BreakdownEntry): void {
		if ('original' in entry) return;
		entry.original = entryValuesOf(entry);
	}

	/** Adopt the state a load or a wipe found, and hand it back to the caller. */
	#settle(
		result: LoadResult,
		document: MarksheetDocument | null,
		saveState?: SaveState
	): LoadResult {
		this.document = document;
		// Undo covers a change to the document in hand: adopting another one
		// (a load, or a wipe) leaves nothing behind to take back.
		this.undoable = null;
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
		// Undo covers the change just made, so a later one takes its place.
		this.undoable = null;
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
