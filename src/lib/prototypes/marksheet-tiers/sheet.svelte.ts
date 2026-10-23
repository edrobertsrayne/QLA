// PROTOTYPE (#114) — throwaway in-memory stand-in for a two-tier marksheet.
// Nothing here touches the marksheet store or localStorage. Entry lists are the
// real gpt-6-luna parses of AQA 8463 Paper 1 Higher/Foundation (prototype #109 cache).
import higher from './8463-1H.json';
import foundation from './8463-1F.json';

export type TierIndex = 0 | 1;
export type Entry = {
	id: string;
	label: string;
	questionNumber: string;
	marks: number;
	summary: string;
	ao: string | null;
};
export type Boundary = { label: string; marks: number };
export type Tier = {
	name: string;
	entries: Entry[];
	/** Highest grade first; null until the teacher sets them. */
	boundaries: Boundary[] | null;
	belowLowestLabel: string;
};
export type Student = {
	id: string;
	firstName: string;
	surname: string;
	absent: boolean;
	tier: TierIndex | null;
};
export type Band = { questionNumber: string; entries: Entry[] };
export type FacilityRow = { entry: Entry; facility: number | null; band: Rag | null };
export type Rag = 'red' | 'amber' | 'green';
export type Graded =
	| { kind: 'none' }
	| {
			kind: 'complete' | 'partial';
			total: number;
			grade: string | null;
			toNext: string;
	  };

type RawEntry = {
	id: string;
	questionNumber: string;
	marks: number | null;
	summary: string;
	ao: string | null;
};

export const SCENARIOS = [
	{ key: 'fresh', label: 'Class just added: 26 students, no tier set, no marks' },
	{ key: 'midway', label: 'Marking under way: 12 H · 11 F · 3 not set, one moved H→F' },
	{ key: 'done', label: 'All marked: 15 H · 11 F, boundaries on both' }
] as const;
// PROTOTYPE (#118): `single` is forced by the one-tier comparison, not listed in the panel:
// one tier only (Higher), every student on tier 0, fully marked, 8463 1H boundaries.
export type ScenarioKey = (typeof SCENARIOS)[number]['key'] | 'single';

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

/** Which tier each student sits in the scenarios that set tiers (index into NAMES). */
const DONE_TIERS: TierIndex[] = [
	0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 1
];

function toEntries(raw: RawEntry[], prefix: string): Entry[] {
	return raw.map((e) => ({
		id: `${prefix}-${e.id}`,
		label: e.id,
		questionNumber: e.questionNumber,
		marks: e.marks ?? 1,
		summary: e.summary,
		ao: e.ao
	}));
}

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

/** Plausible marks: each entry has a difficulty, each student an ability. */
function fakeMarks(entries: Entry[], ability: number, seed: number, upTo = entries.length) {
	const r = rng(seed);
	const out: Record<string, number> = {};
	entries.slice(0, upTo).forEach((entry, i) => {
		const difficulty = ((i * 37) % 11) / 11;
		const p = Math.min(0.97, Math.max(0.03, ability - difficulty * 0.6 + (r() - 0.5) * 0.4));
		let m = 0;
		for (let k = 0; k < entry.marks; k++) if (r() < p) m++;
		out[entry.id] = m;
	});
	return out;
}

const HIGHER_BOUNDARIES: Boundary[] = [
	{ label: '9', marks: 71 },
	{ label: '8', marks: 62 },
	{ label: '7', marks: 53 },
	{ label: '6', marks: 42 },
	{ label: '5', marks: 31 },
	{ label: '4', marks: 20 }
];
const FOUNDATION_BOUNDARIES: Boundary[] = [
	{ label: '5', marks: 58 },
	{ label: '4', marks: 47 },
	{ label: '3', marks: 34 },
	{ label: '2', marks: 21 },
	{ label: '1', marks: 9 }
];

export const RED_BELOW = 0.4;
export const GREEN_FROM = 0.7;

class Sheet {
	scenario = $state<ScenarioKey>('midway');
	paperLabel = $state('8463 Paper 1 June 2024');
	className = $state('11X/Ph1');
	tiers = $state<Tier[]>([]);
	students = $state<Student[]>([]);
	/** Flat, as settled in #110: off-tier marks are kept but not counted. */
	marks = $state<Record<string, Record<string, number>>>({});
	lastChange = $state<string | null>(null);

	constructor() {
		this.load('midway');
	}

	load(key: ScenarioKey) {
		this.scenario = key;
		this.lastChange = null;
		const single = key === 'single';
		const t1 = toEntries(higher as RawEntry[], 't1');
		this.tiers = [
			{
				name: 'Higher',
				entries: t1,
				boundaries: key === 'fresh' ? null : HIGHER_BOUNDARIES,
				belowLowestLabel: 'U'
			}
		];
		if (!single) {
			this.tiers.push({
				name: 'Foundation',
				entries: toEntries(foundation as RawEntry[], 't2'),
				boundaries: key === 'done' ? FOUNDATION_BOUNDARIES : null,
				belowLowestLabel: 'U'
			});
		}
		this.students = NAMES.map((n, i) => {
			const [firstName, surname] = n.split(' ');
			let tier: TierIndex | null = null;
			if (single) tier = 0;
			else if (key === 'done') tier = DONE_TIERS[i];
			else if (key === 'midway') tier = i >= 23 ? null : i === 0 ? 1 : DONE_TIERS[i];
			return { id: `s${i}`, firstName, surname, absent: key !== 'fresh' && i === 9, tier };
		});
		const marks: Record<string, Record<string, number>> = {};
		if (key !== 'fresh') {
			this.students.forEach((s, i) => {
				if (s.tier === null || s.absent) return;
				const entries = this.tiers[s.tier].entries;
				const ability = s.tier === 0 ? 0.55 + (i % 7) * 0.06 : 0.6 + (i % 5) * 0.07;
				// Midway: marking reached about Q6 on Higher and Q12 on Foundation.
				const upTo = key === 'midway' ? (s.tier === 0 ? 24 : 34) : entries.length;
				marks[s.id] = fakeMarks(
					entries,
					ability,
					i + 1,
					i % 4 === 3 && key === 'midway' ? upTo - 10 : upTo
				);
			});
			if (key === 'midway') {
				// Ava was marked on Higher, then moved to Foundation: 12 Higher marks kept, uncounted.
				marks.s0 = fakeMarks(this.tiers[0].entries, 0.4, 99, 12);
			}
		}
		this.marks = marks;
	}

	tierLabel(t: TierIndex) {
		return `Tier ${t + 1} · ${this.tiers[t].name}`;
	}

	studentName(s: Student) {
		return `${s.firstName} ${s.surname}`;
	}

	studentsOn(t: TierIndex) {
		return this.students.filter((s) => s.tier === t);
	}

	get notSet() {
		return this.students.filter((s) => s.tier === null);
	}

	tierMarks(t: TierIndex) {
		return this.tiers[t].entries.reduce((sum, e) => sum + e.marks, 0);
	}

	bands(t: TierIndex): Band[] {
		const out: Band[] = [];
		for (const entry of this.tiers[t].entries) {
			const last = out.at(-1);
			if (last && last.questionNumber === entry.questionNumber) last.entries.push(entry);
			else out.push({ questionNumber: entry.questionNumber, entries: [entry] });
		}
		return out;
	}

	mark(studentId: string, entryId: string): number | undefined {
		return this.marks[studentId]?.[entryId];
	}

	/** Marks a student holds on a tier they are not on: kept, never counted. */
	offTierMarkCount(s: Student): { tier: TierIndex; count: number } | null {
		// One tier has no other tier's marks to hold.
		if (this.tiers.length === 1) return null;
		const row = this.marks[s.id];
		if (!row) return null;
		for (const t of [0, 1] as const) {
			if (t === s.tier) continue;
			const count = this.tiers[t].entries.filter((e) => row[e.id] !== undefined).length;
			if (count > 0) return { tier: t, count };
		}
		return null;
	}

	progress(s: Student) {
		if (s.tier === null) return null;
		const entries = this.tiers[s.tier].entries;
		const marked = entries.filter((e) => this.mark(s.id, e.id) !== undefined).length;
		return { marked, total: entries.length };
	}

	graded(s: Student): Graded {
		if (s.tier === null || s.absent) return { kind: 'none' };
		const tier = this.tiers[s.tier];
		const row = this.marks[s.id] ?? {};
		let total = 0;
		let marked = 0;
		for (const e of tier.entries) {
			if (row[e.id] !== undefined) {
				total += row[e.id];
				marked++;
			}
		}
		if (marked === 0) return { kind: 'none' };
		let grade: string | null = null;
		let toNext = '';
		if (tier.boundaries) {
			const i = tier.boundaries.findIndex((b) => total >= b.marks);
			grade = i === -1 ? tier.belowLowestLabel : tier.boundaries[i].label;
			const next = i === -1 ? tier.boundaries.at(-1) : i > 0 ? tier.boundaries[i - 1] : null;
			if (next) toNext = `${next.marks - total} to ${next.label}`;
		}
		return { kind: marked === tier.entries.length ? 'complete' : 'partial', total, grade, toNext };
	}

	facility(t: TierIndex): FacilityRow[] {
		const on = this.studentsOn(t).filter((s) => !s.absent);
		return this.tiers[t].entries.map((entry) => {
			let got = 0;
			let n = 0;
			for (const s of on) {
				const m = this.mark(s.id, entry.id);
				if (m === undefined) continue;
				got += m;
				n++;
			}
			const facility = n === 0 ? null : got / (n * entry.marks);
			const band: Rag | null =
				facility === null
					? null
					: facility < RED_BELOW
						? 'red'
						: facility >= GREEN_FROM
							? 'green'
							: 'amber';
			return { entry, facility, band };
		});
	}

	hardest(t: TierIndex) {
		return this.facility(t)
			.filter((r) => r.band === 'red')
			.sort((a, b) => (a.facility ?? 0) - (b.facility ?? 0))
			.slice(0, 8);
	}

	/** Report-ready: on a tier, present, every entry of their tier marked. Not set never is. */
	get reportable() {
		return this.students.filter((s) => {
			const p = this.progress(s);
			return p !== null && !s.absent && p.marked === p.total;
		}).length;
	}

	setTier(studentId: string, tier: TierIndex | null) {
		const s = this.students.find((x) => x.id === studentId);
		if (!s || s.tier === tier) return;
		s.tier = tier;
		this.lastChange = `${this.studentName(s)} → ${tier === null ? 'not set' : this.tierLabel(tier)}`;
	}

	setTierMany(ids: string[], tier: TierIndex) {
		for (const id of ids) {
			const s = this.students.find((x) => x.id === id);
			if (s) s.tier = tier;
		}
		this.lastChange = `${ids.length} students → ${this.tierLabel(tier)}`;
	}

	setAbsent(studentId: string, absent: boolean) {
		const s = this.students.find((x) => x.id === studentId);
		if (s) s.absent = absent;
	}

	setMark(studentId: string, entryId: string, text: string) {
		const trimmed = text.trim();
		if (trimmed === '') {
			if (this.marks[studentId]) delete this.marks[studentId][entryId];
			this.lastChange = `cleared ${entryId} for ${studentId}`;
			return;
		}
		if (!/^\d+$/.test(trimmed)) return;
		this.marks[studentId] ??= {};
		this.marks[studentId][entryId] = Number(trimmed);
		this.lastChange = `${studentId} ${entryId} = ${trimmed}`;
	}

	setBoundaries(t: TierIndex, boundaries: Boundary[] | null) {
		this.tiers[t].boundaries = boundaries;
		this.lastChange = `${this.tierLabel(t)} boundaries ${boundaries ? `(${boundaries.length})` : 'removed'}`;
	}

	exportName(kind: 'marks' | 'analysis' | 'common', t?: TierIndex) {
		const base = this.paperLabel.replace(/\s+/g, '-');
		if (kind === 'common') return `${base}-common-questions.csv`;
		return `${base}-${this.tiers[t ?? 0].name}-${kind}.csv`;
	}

	get snapshot() {
		return {
			scenario: this.scenario,
			tiers: this.tiers.map((t) => ({
				name: t.name,
				entries: t.entries.length,
				boundaries: t.boundaries
			})),
			students: this.students.map(
				(s) => `${s.id} ${this.studentName(s)} tier=${s.tier} ${s.absent ? 'absent' : ''}`
			),
			marks: Object.fromEntries(
				Object.entries(this.marks).map(([k, v]) => [k, Object.keys(v).length])
			)
		};
	}
}

let instance: Sheet | null = null;
export function tieredSheet() {
	instance ??= new Sheet();
	return instance;
}

export function facilityTint(band: Rag | null) {
	if (band === 'red') return 'bg-red-500/25';
	if (band === 'amber') return 'bg-amber-400/30';
	if (band === 'green') return 'bg-emerald-500/20';
	return '';
}
