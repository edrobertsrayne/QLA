// PROTOTYPE (#115) — throwaway in-memory two-tier analysis for the common-questions view.
// Nothing here touches the marksheet store or localStorage. Entries are the real
// gpt-6-luna parses of AQA 8463 Paper 1 Higher (Tier 1) and Foundation (Tier 2);
// the 13 pairs are the true common questions (H 01–03 = F 08–10, 31 marks). Marks are fake.
import higher from './8463-1H.json';
import foundation from './8463-1F.json';
import { singleTierDocument } from '../single-tier/seed.js';

export type TierIndex = 0 | 1;
export type Rag = 'red' | 'amber' | 'green';
export type Entry = {
	id: string;
	label: string;
	questionNumber: string;
	marks: number;
	summary: string;
	specPoint: string | null;
	ao: string | null;
};
export type Tier = { name: string; short: string; entries: Entry[] };
export type Student = { id: string; name: string; tier: TierIndex | null; absent: boolean };
export type Pair = { tier1EntryId: string; tier2EntryId: string };

/** One entry's figures over its own tier's present students, as today's analysis has them. */
export type Row = {
	entry: Entry;
	facility: number | null;
	mean: number | null;
	band: Rag | null;
	marked: number;
	of: number;
	partMarked: boolean;
};

/** One common question: each tier's own figures, the pooled figure over both tiers' students, and the gap. */
export type CommonRow = {
	a: Row;
	b: Row;
	marks: number;
	pooled: number | null;
	pooledBand: Rag | null;
	/** Tier 1 facility minus Tier 2 facility, in percentage points; null unless both are scored. */
	gap: number | null;
	marked: number;
	of: number;
	partMarked: boolean;
};

type RawEntry = {
	id: string;
	questionNumber: string;
	marks: number | null;
	summary: string;
	specPoint?: string | null;
	ao: string | null;
};

export const RED_BELOW = 0.4;
export const GREEN_FROM = 0.7;
export const band = (f: number): Rag =>
	f < RED_BELOW ? 'red' : f < GREEN_FROM ? 'amber' : 'green';
export const pct = (f: number) => Math.round(f * 100);
export const TINT: Record<Rag, string> = {
	red: 'bg-red-500/10',
	amber: 'bg-amber-400/15',
	green: 'bg-emerald-500/10'
};
export const DOT: Record<Rag, string> = {
	red: 'bg-red-500',
	amber: 'bg-amber-400',
	green: 'bg-emerald-500'
};
export const TEXT: Record<Rag, string> = {
	red: 'text-red-700 dark:text-red-300',
	amber: 'text-amber-700 dark:text-amber-300',
	green: 'text-emerald-700 dark:text-emerald-300'
};

export const SCENARIOS = [
	{ key: 'done', label: 'All marked: 15 H · 11 F (1 absent)' },
	{ key: 'partial', label: 'Foundation part-marked: 5 of 11 F not past Q07' },
	{ key: 'fnone', label: 'Foundation not marked yet' },
	{ key: 'nopairs', label: 'Two tiers, no common questions confirmed' }
] as const;
export type ScenarioKey = (typeof SCENARIOS)[number]['key'];

const NAMES = [
	'Ava Patel',
	'Ben Okafor',
	'Chloe Nguyen',
	'Daniel Price',
	'Ella Morgan',
	'Finn Walsh',
	'Grace Kim',
	'Harry Lewis',
	'Isla Brown',
	'Jack Turner',
	'Katie Shah',
	'Leo Evans',
	'Maya Hughes',
	'Noah Clarke',
	'Olivia Reid',
	'Priya Singh',
	'Quinn Hall',
	'Ruby Ward',
	'Sam Fisher',
	'Tom Baker',
	'Una Byrne',
	'Vik Rao',
	'Will Carter',
	'Xena Ellis',
	'Yusuf Ali',
	'Zoe Mills'
];
const TIERS_OF: TierIndex[] = [
	0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 1
];

function toEntries(raw: RawEntry[], prefix: string): Entry[] {
	return raw.map((e) => ({
		id: `${prefix}-${e.id}`,
		label: e.id,
		questionNumber: e.questionNumber,
		marks: e.marks ?? 1,
		summary: e.summary,
		specPoint: e.specPoint ?? null,
		ao: e.ao
	}));
}

const TIERS: Tier[] = [
	{ name: 'Higher', short: 'H', entries: toEntries(higher as RawEntry[], 't1') },
	{ name: 'Foundation', short: 'F', entries: toEntries(foundation as RawEntry[], 't2') }
];

/** H 01→F 08, 02→09, 03→10, part for part. */
const TRUE_PAIRS: Pair[] = TIERS[0].entries
	.filter((e) => Number(e.questionNumber) <= 3)
	.map((e) => {
		const fq = { '1': '08', '2': '09', '3': '10' }[e.questionNumber]!;
		return { tier1EntryId: e.id, tier2EntryId: `t2-${fq}.${e.label.split('.')[1]}` };
	});

function rng(seed: number): () => number {
	let a = seed;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Each entry's difficulty; a common question has the same difficulty on both tiers. */
function difficulty(entry: Entry): number {
	const pair = TRUE_PAIRS.find((p) => p.tier1EntryId === entry.id || p.tier2EntryId === entry.id);
	const key = pair ? pair.tier1EntryId : entry.id;
	let h = 0;
	for (const c of key) h = (h * 31 + c.charCodeAt(0)) | 0;
	// Higher's opening questions (the common ones) are its easiest.
	return ((Math.abs(h) % 100) / 100) * (pair ? 0.6 : 1);
}

/** Common questions Foundation was drilled on: their gap closes or flips. */
const FOUNDATION_DRILLED = new Set(['t2-08.4', 't2-09.1', 't2-10.2']);

function fakeMarks(entries: Entry[], ability: number, seed: number, upToQ = Infinity) {
	const r = rng(seed);
	const out: Record<string, number> = {};
	for (const entry of entries) {
		if (Number(entry.questionNumber) > upToQ) continue;
		const bonus = FOUNDATION_DRILLED.has(entry.id) ? 0.45 : 0;
		const p = Math.min(
			0.97,
			Math.max(0.03, ability + bonus - difficulty(entry) * 0.55 + (r() - 0.5) * 0.35)
		);
		let m = 0;
		for (let k = 0; k < entry.marks; k++) if (r() < p) m++;
		out[entry.id] = m;
	}
	return out;
}

class TieredAnalysis {
	readonly single: boolean;
	scenario = $state<ScenarioKey>('done');
	className = '11X/Ph1';
	paperLabel = 'AQA 8463 Paper 1 (Nov mock)';
	tiers = TIERS;
	students = $state<Student[]>([]);
	marks = $state<Record<string, Record<string, number>>>({});
	pairs = $state<Pair[]>([]);

	constructor(single = false) {
		this.single = single;
		if (single) {
			this.loadSingle();
		} else {
			this.load('done');
		}
	}

	/**
	 * PROTOTYPE (#118): one tier. The same document today's page renders on the
	 * single-tier prototypes, so the two designs show identical figures.
	 */
	loadSingle() {
		const document = singleTierDocument('/marksheet/analysis');
		this.tiers = [TIERS[0]];
		this.pairs = [];
		this.className = document.paper.className ?? '';
		this.paperLabel = document.paper.label ?? '';
		this.students = document.students.map((student): Student => ({
			id: student.id,
			name: `${student.firstName} ${student.surname}`,
			tier: 0,
			absent: student.absent
		}));
		this.marks = document.marks;
	}

	load(key: ScenarioKey) {
		this.scenario = key;
		this.tiers = TIERS;
		this.className = '11X/Ph1';
		this.paperLabel = 'AQA 8463 Paper 1 (Nov mock)';
		this.pairs = key === 'nopairs' ? [] : TRUE_PAIRS;
		this.students = NAMES.map((name, i) => ({
			id: `s${i}`,
			name,
			tier: TIERS_OF[i],
			absent: name === 'Una Byrne'
		}));
		const marks: Record<string, Record<string, number>> = {};
		let fSeen = 0;
		this.students.forEach((s, i) => {
			if (s.absent || s.tier === null) return;
			const r = rng(1000 + i);
			if (s.tier === 0) {
				marks[s.id] = fakeMarks(TIERS[0].entries, 0.65 + r() * 0.35, i + 1);
			} else {
				if (key === 'fnone') return;
				fSeen++;
				const upTo = key === 'partial' && fSeen > 5 ? 7 : Infinity;
				marks[s.id] = fakeMarks(TIERS[1].entries, 0.3 + r() * 0.35, i + 1, upTo);
			}
		});
		this.marks = marks;
	}

	present(tier: TierIndex): Student[] {
		return this.students.filter((s) => s.tier === tier && !s.absent);
	}

	absentCount(tier: TierIndex): number {
		return this.students.filter((s) => s.tier === tier && s.absent).length;
	}

	row(tier: TierIndex, entry: Entry): Row {
		const present = this.present(tier);
		let sum = 0;
		let counted = 0;
		for (const s of present) {
			const m = this.marks[s.id]?.[entry.id];
			if (m === undefined) continue;
			sum += m;
			counted++;
		}
		const mean = counted ? sum / counted : null;
		const facility = mean === null ? null : mean / entry.marks;
		return {
			entry,
			facility,
			mean,
			band: facility === null ? null : band(facility),
			marked: counted,
			of: present.length,
			partMarked: facility !== null && counted < present.length
		};
	}

	rows(tier: TierIndex): Row[] {
		return this.tiers[tier].entries.map((e) => this.row(tier, e));
	}

	entry(id: string): Entry | undefined {
		return this.tiers[id.startsWith('t1') ? 0 : 1].entries.find((e) => e.id === id);
	}

	/** The pair an entry is in, if any. */
	pairOf(entryId: string): Pair | undefined {
		return this.pairs.find((p) => p.tier1EntryId === entryId || p.tier2EntryId === entryId);
	}

	/** Pairs in Tier 1's paper order. */
	get common(): CommonRow[] {
		return this.pairs.map((p) => {
			const a = this.row(0, this.entry(p.tier1EntryId)!);
			const b = this.row(1, this.entry(p.tier2EntryId)!);
			const marks = a.entry.marks;
			const counted = a.marked + b.marked;
			const sum = (a.mean ?? 0) * a.marked + (b.mean ?? 0) * b.marked;
			const pooled = counted ? sum / counted / marks : null;
			return {
				a,
				b,
				marks,
				pooled,
				pooledBand: pooled === null ? null : band(pooled),
				gap: a.facility !== null && b.facility !== null ? pct(a.facility) - pct(b.facility) : null,
				marked: counted,
				of: a.of + b.of,
				partMarked: pooled !== null && (a.marked < a.of || b.marked < b.of)
			};
		});
	}

	get commonMarks(): number {
		return this.pairs.reduce((sum, p) => sum + (this.entry(p.tier1EntryId)?.marks ?? 0), 0);
	}

	/** The common questions CSV as proposed: one row per pair, Tier 1's paper order. */
	commonCsv(): string[][] {
		const [t1, t2] = this.tiers.map((t) => t.name);
		const f = (v: number | null) => (v === null ? '' : String(pct(v)));
		return [
			[
				`${t1} question`,
				`${t2} question`,
				'Summary',
				'Available marks',
				'Spec point',
				'AO',
				`${t1} facility %`,
				`${t1} band`,
				`${t1} marked`,
				`${t1} of`,
				`${t2} facility %`,
				`${t2} band`,
				`${t2} marked`,
				`${t2} of`,
				'Pooled facility %',
				'Pooled band',
				`Gap (${t1} − ${t2}, points)`,
				'Part-marked'
			],
			...this.common.map((c) => [
				c.a.entry.label,
				c.b.entry.label,
				c.a.entry.summary,
				String(c.marks),
				c.a.entry.specPoint ?? '',
				c.a.entry.ao ?? '',
				f(c.a.facility),
				c.a.band ?? '',
				String(c.a.marked),
				String(c.a.of),
				f(c.b.facility),
				c.b.band ?? '',
				String(c.b.marked),
				String(c.b.of),
				f(c.pooled),
				c.pooledBand ?? '',
				c.gap === null ? '' : String(c.gap),
				c.partMarked ? 'yes' : 'no'
			])
		];
	}

	/** A tier's analysis CSV in today's format (trimmed to the columns that matter here). */
	tierCsv(tier: TierIndex): string[][] {
		return [
			[
				'Question',
				'Q number',
				'Summary',
				'Available marks',
				'Spec point',
				'AO',
				'Facility %',
				'Band',
				'Marked',
				'Of',
				'Part-marked'
			],
			...this.rows(tier).map((r) => [
				r.entry.label,
				r.entry.questionNumber,
				r.entry.summary,
				String(r.entry.marks),
				r.entry.specPoint ?? '',
				r.entry.ao ?? '',
				r.facility === null ? '' : String(pct(r.facility)),
				r.band ?? '',
				String(r.marked),
				String(r.of),
				r.partMarked ? 'yes' : 'no'
			])
		];
	}

	filename(what: string, ext: string): string {
		const base = this.single
			? '8463-paper-1-june-2024-11x-ph1'
			: 'aqa-8463-paper-1-nov-mock-11x-ph1';
		return `${base}-${what}.${ext}`;
	}
}

let instance: TieredAnalysis | undefined;
export function tieredAnalysis(): TieredAnalysis {
	instance ??= new TieredAnalysis();
	return instance;
}

let singleInstance: TieredAnalysis | undefined;
/** PROTOTYPE (#118): the same design over a single tier, sharing today's seed document. */
export function singleTierAnalysis(): TieredAnalysis {
	singleInstance ??= new TieredAnalysis(true);
	return singleInstance;
}

/** Worst first by a figure; not-scored last in the order given. */
export function worstFirst<T>(rows: T[], figure: (row: T) => number | null): T[] {
	return [...rows].sort((x, y) => {
		const a = figure(x);
		const b = figure(y);
		if (a === null && b === null) return 0;
		if (a === null) return 1;
		if (b === null) return -1;
		return a - b;
	});
}

export function toCsvText(rows: string[][]): string {
	const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
	return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
