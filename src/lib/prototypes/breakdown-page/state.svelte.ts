// PROTOTYPE — throwaway in-memory breakdown editor state for wayfinder #29. No persistence.

import type {
	AssessmentObjective,
	ParseQuestion,
	ParseUsage,
	ParseWarning
} from '$lib/server/parse/schema.js';
import { makeSample, type SampleKey } from './sample.js';

export type NullPolicy = 'block' | 'warn' | 'silent';
export type EditableField = keyof ParseQuestion;

export interface Entry extends ParseQuestion {
	/** Generated local key (what #25 keys marks against), stable across id edits. */
	key: string;
	/** The model's original values, or null for an entry the teacher added. */
	original: ParseQuestion | null;
}

export interface QuestionGroup {
	questionNumber: string;
	entries: Entry[];
	knownMarks: number;
	nullCount: number;
}

let nextKey = 1;
const newKey = () => `e${nextKey++}`;

function toEntry(q: ParseQuestion): Entry {
	return { ...q, key: newKey(), original: { ...q } };
}

export const AO_OPTIONS: (AssessmentObjective | null)[] = ['AO1', 'AO2', 'AO3', null];

export class BreakdownEditor {
	sample = $state<SampleKey>('messy');
	entries = $state<Entry[]>([]);
	warnings = $state<ParseWarning[]>([]);
	usage = $state<ParseUsage>({ promptTokens: 0, completionTokens: 0, totalTokens: 0, estCost: 0 });
	printedTotal = $state(0);
	/** Teacher-typed total from the paper's cover (variant B reconciliation). */
	paperTotal = $state<number | null>(null);
	nullPolicy = $state<NullPolicy>('warn');
	confirmedAt = $state<string | null>(null);
	/** Questions the teacher has ticked as checked (variant C). */
	checked = $state<Record<string, boolean>>({});
	lastRemoved = $state<{ entry: Entry; index: number } | null>(null);
	log = $state<string[]>([]);

	constructor(sample: SampleKey = 'messy') {
		this.load(sample);
	}

	load(sample: SampleKey) {
		const s = makeSample(sample);
		this.sample = sample;
		this.entries = s.breakdown.questions.map(toEntry);
		this.warnings = s.warnings;
		this.usage = s.usage;
		this.printedTotal = s.printedTotal;
		this.paperTotal = null;
		this.confirmedAt = null;
		this.checked = {};
		this.lastRemoved = null;
		this.log = [`Loaded sample "${sample}"`];
	}

	private note(line: string) {
		this.log = [line, ...this.log].slice(0, 8);
	}

	// --- derived ---

	knownMarks = $derived(this.entries.reduce((s, e) => s + (e.marks ?? 0), 0));
	nullMarks = $derived(this.entries.filter((e) => e.marks === null));
	emptyIds = $derived(this.entries.filter((e) => e.id.trim() === ''));
	duplicateIds = $derived.by(() => {
		const seen = new Map<string, number>();
		for (const e of this.entries) seen.set(e.id.trim(), (seen.get(e.id.trim()) ?? 0) + 1);
		return new Set([...seen].filter(([id, n]) => id !== '' && n > 1).map(([id]) => id));
	});
	addedCount = $derived(this.entries.filter((e) => e.original === null).length);
	editedCount = $derived(
		this.entries.filter((e) => e.original !== null && this.editedFields(e).length > 0).length
	);

	/** Consecutive runs of the same questionNumber, in paper order. */
	groups = $derived.by(() => {
		const out: QuestionGroup[] = [];
		for (const e of this.entries) {
			const last = out.at(-1);
			if (last && last.questionNumber === e.questionNumber) last.entries.push(e);
			else
				out.push({ questionNumber: e.questionNumber, entries: [e], knownMarks: 0, nullCount: 0 });
		}
		for (const g of out) {
			g.knownMarks = g.entries.reduce((s, e) => s + (e.marks ?? 0), 0);
			g.nullCount = g.entries.filter((e) => e.marks === null).length;
		}
		return out;
	});

	/** Hard blockers: an entry with no label or a repeated label cannot head a marksheet column. */
	hardBlockers = $derived(this.emptyIds.length + this.duplicateIds.size);

	canConfirm = $derived(
		this.hardBlockers === 0 &&
			this.entries.length > 0 &&
			!(this.nullPolicy === 'block' && this.nullMarks.length > 0)
	);

	runWarnings = $derived(this.warnings.filter((w) => w.questionId === null));

	warningsFor(e: Entry): ParseWarning[] {
		const id = e.original?.id ?? e.id;
		return this.warnings.filter((w) => w.questionId === id);
	}

	editedFields(e: Entry): EditableField[] {
		if (!e.original) return [];
		const o = e.original;
		return (Object.keys(o) as EditableField[]).filter((k) => o[k] !== e[k]);
	}

	// --- mutations ---

	update<K extends EditableField>(key: string, field: K, value: ParseQuestion[K]) {
		const e = this.entries.find((x) => x.key === key);
		if (!e || this.confirmedAt) return;
		e[field] = value as Entry[K];
		this.note(`Edited ${e.id || '(no label)'} · ${field} → ${JSON.stringify(value)}`);
	}

	setMarks(key: string, raw: string) {
		const trimmed = raw.trim();
		const n = Number(trimmed);
		const value = trimmed === '' ? null : Number.isInteger(n) && n > 0 ? n : undefined;
		if (value === undefined) return;
		this.update(key, 'marks', value);
	}

	/** Insert a teacher-added entry after `afterKey` (or at the end). Returns its key. */
	add(afterKey: string | null, seed: Partial<ParseQuestion> = {}): string {
		if (this.confirmedAt) return '';
		const after = afterKey ? this.entries.findIndex((e) => e.key === afterKey) : -1;
		const index = after === -1 ? this.entries.length : after + 1;
		const prev = this.entries[index - 1];
		const entry: Entry = {
			key: newKey(),
			original: null,
			id: '',
			questionNumber: prev?.questionNumber ?? '',
			marks: null,
			summary: '',
			specPoint: null,
			commandWord: null,
			ao: null,
			...seed
		};
		this.entries.splice(index, 0, entry);
		this.note(`Added entry after ${prev?.id ?? 'start'}`);
		return entry.key;
	}

	remove(key: string) {
		const index = this.entries.findIndex((e) => e.key === key);
		if (index === -1 || this.confirmedAt) return;
		const [entry] = this.entries.splice(index, 1);
		this.lastRemoved = { entry, index };
		this.note(`Deleted ${entry.id || '(no label)'}`);
	}

	undoRemove() {
		if (!this.lastRemoved) return;
		this.entries.splice(this.lastRemoved.index, 0, this.lastRemoved.entry);
		this.note(`Restored ${this.lastRemoved.entry.id}`);
		this.lastRemoved = null;
	}

	move(key: string, delta: -1 | 1) {
		const i = this.entries.findIndex((e) => e.key === key);
		const j = i + delta;
		if (i === -1 || j < 0 || j >= this.entries.length || this.confirmedAt) return;
		const [e] = this.entries.splice(i, 1);
		this.entries.splice(j, 0, e);
		this.note(`Moved ${e.id} ${delta < 0 ? 'up' : 'down'}`);
	}

	toggleChecked(questionNumber: string) {
		this.checked[questionNumber] = !this.checked[questionNumber];
	}

	confirm() {
		if (!this.canConfirm) return;
		this.confirmedAt = new Date().toISOString();
		this.note('Breakdown confirmed (would write breakdownConfirmedAt and go to /marksheet)');
	}

	unconfirm() {
		this.confirmedAt = null;
		this.note('Prototype: un-confirmed');
	}

	/** What would be written to the stored document's `breakdown`. */
	snapshot() {
		return {
			breakdownConfirmedAt: this.confirmedAt,
			breakdown: {
				questions: this.entries.map(({ key: _key, original: _original, ...q }) => q)
			},
			warnings: this.warnings
		};
	}
}
