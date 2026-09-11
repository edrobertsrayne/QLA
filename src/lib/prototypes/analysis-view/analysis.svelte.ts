// PROTOTYPE — throwaway analysis state for wayfinder #28 (analysis run button + RAG per-question view).
// Sits on top of the #27 grid engine: the grid owns marks, this owns the on-demand snapshot and the
// prototype-only knobs (thresholds, stale policy, RAG treatment, columns, colour simulation).

import type { ParseQuestion } from '$lib/server/parse/schema.js';
import type { GridEngine } from '$lib/prototypes/marksheet-grid/grid-state.svelte.js';
import { makeSampleLeaves, makeSampleStudents } from '$lib/prototypes/marksheet-grid/sample-data.js';

export type Band = 'red' | 'amber' | 'green';
export type StalePolicy = 'badge' | 'clear' | 'prompt';
export type RagTreatment = 'chip' | 'tint' | 'bar';
export type ColourSim = 'normal' | 'greyscale' | 'deuteranopia';
export type RunTrigger = 'button' | 'on-open';
export type AfterGenerate = 'stay' | 'open-report';

export const COLUMN_KEYS = ['id', 'summary', 'marks', 'specPoint', 'ao', 'facility', 'n'] as const;
export type ColumnKey = (typeof COLUMN_KEYS)[number];

export interface LeafResult {
	leaf: ParseQuestion;
	/** Mean mark ÷ max over entered, present students. null when nothing is entered or max is unknown. */
	facility: number | null;
	mean: number | null;
	/** Students with a mark entered (present only). */
	n: number;
	/** Present students — the denominator for "how much of the class is marked". */
	of: number;
	provisional: boolean;
	overMax: number;
	/** Why facility is null, when it is. */
	reason: 'unmarked' | 'no-max' | null;
}

export interface Snapshot {
	at: Date;
	fingerprint: string;
	results: LeafResult[];
	present: number;
	absent: number;
	cellsEntered: number;
}

export const THRESHOLD_PRESETS: { label: string; red: number; green: number }[] = [
	{ label: '35 / 55', red: 0.35, green: 0.55 },
	{ label: '40 / 60', red: 0.4, green: 0.6 },
	{ label: '40 / 70', red: 0.4, green: 0.7 },
	{ label: '50 / 70', red: 0.5, green: 0.7 }
];

export function bandFor(facility: number | null, t: { red: number; green: number }): Band | null {
	if (facility == null) return null;
	if (facility < t.red) return 'red';
	if (facility < t.green) return 'amber';
	return 'green';
}

export function fingerprint(engine: GridEngine): string {
	return JSON.stringify([
		engine.leaves.map((l) => [l.id, l.marks]),
		engine.students.map((s) => s.id),
		engine.marks,
		engine.absent
	]);
}

export function computeSnapshot(engine: GridEngine): Snapshot {
	const present = engine.students.filter((s) => !engine.isAbsent(s.id));
	let cellsEntered = 0;
	const results: LeafResult[] = engine.leaves.map((leaf) => {
		let sum = 0;
		let n = 0;
		let overMax = 0;
		for (const s of present) {
			const v = engine.markAt(s.id, leaf.id);
			if (v == null) continue;
			sum += v;
			n++;
			if (leaf.marks != null && v > leaf.marks) overMax++;
		}
		cellsEntered += n;
		const mean = n > 0 ? sum / n : null;
		const reason = n === 0 ? 'unmarked' : leaf.marks == null ? 'no-max' : null;
		const facility = reason ? null : Math.min(1, mean! / leaf.marks!);
		return {
			leaf,
			facility,
			mean,
			n,
			of: present.length,
			provisional: n > 0 && n < present.length,
			overMax,
			reason
		};
	});
	return {
		at: new Date(),
		fingerprint: fingerprint(engine),
		results,
		present: present.length,
		absent: engine.students.length - present.length,
		cellsEntered
	};
}

export function describeSnapshot(s: Snapshot): string {
	const time = s.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	const provisional = s.results.filter((r) => r.provisional).length;
	return [
		`Generated at ${time}`,
		`${s.present} students${s.absent ? ` (${s.absent} absent left out)` : ''}`,
		`${s.cellsEntered} marks`,
		provisional ? `${provisional} questions part-marked` : null
	]
		.filter(Boolean)
		.join(' · ');
}

/** Worst first; rows with no facility sink to the bottom in paper order. */
export function worstFirst(results: LeafResult[]): LeafResult[] {
	return [...results].sort((a, b) => {
		if (a.facility == null && b.facility == null) return 0;
		if (a.facility == null) return 1;
		if (b.facility == null) return -1;
		return a.facility - b.facility;
	});
}

export class AnalysisState {
	snapshot = $state<Snapshot | null>(null);
	thresholds = $state({ red: 0.4, green: 0.7 });
	stalePolicy = $state<StalePolicy>('badge');
	rag = $state<RagTreatment>('tint');
	colourSim = $state<ColourSim>('normal');
	trigger = $state<RunTrigger>('button');
	/** Variant D: whether Generate stays on the marksheet (facility row appears) or opens the report. */
	afterGenerate = $state<AfterGenerate>('stay');
	/** Variant D: show the "Hardest:" strip above the grid alongside the facility row. */
	hardestStrip = $state(true);
	columns = $state<Record<ColumnKey, boolean>>({
		id: true,
		summary: true,
		marks: true,
		specPoint: true,
		ao: true,
		facility: true,
		n: true
	});
	/** Brief "running" state so the button visibly does something even though arithmetic is instant. */
	running = $state(false);

	constructor(private engine: GridEngine) {}

	get current() {
		return fingerprint(this.engine);
	}

	get stale() {
		return this.snapshot != null && this.snapshot.fingerprint !== this.current;
	}

	run(then?: () => void) {
		this.running = true;
		setTimeout(() => {
			this.snapshot = computeSnapshot(this.engine);
			this.running = false;
			then?.();
		}, 250);
	}

	band(r: LeafResult) {
		return bandFor(r.facility, this.thresholds);
	}

	/** Live counts, independent of the snapshot, for the pre-run empty state. */
	get liveProgress() {
		const present = this.engine.students.filter((s) => !this.engine.isAbsent(s.id));
		let entered = 0;
		for (const s of present)
			for (const l of this.engine.leaves) if (this.engine.markAt(s.id, l.id) != null) entered++;
		return { entered, total: present.length * this.engine.leaves.length };
	}
}

// ---------------------------------------------------------------------------------------------
// Sample marksheet: 30 students, 32 leaves, realistic difficulty spread, two absentees, the last
// question half-marked (provisional), one part-marked mid-paper, one leaf with an unknown max.

function mulberry32(seed: number) {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function makeSampleLeavesForAnalysis(): ParseQuestion[] {
	const leaves = makeSampleLeaves();
	// One leaf whose max the parse couldn't read — facility can't be computed for it.
	const unknown = leaves.find((l) => l.id === '9b');
	if (unknown) unknown.marks = null;
	return leaves;
}

export function fillSampleMarks(engine: GridEngine, seed = 11) {
	const rand = mulberry32(seed);
	const marks: Record<string, number> = {};
	const absent: Record<string, boolean> = {};
	const students = engine.students;
	// Ability per student, difficulty per leaf — a spread that lands leaves across all three bands.
	const ability = students.map(() => (rand() - 0.5) * 0.5);
	const leafFacility = engine.leaves.map(() => 0.12 + rand() * 0.8);
	absent[students[4]?.id] = true;
	absent[students[17]?.id] = true;

	engine.leaves.forEach((leaf, li) => {
		const max = leaf.marks ?? 4;
		// Q12 only marked for the first 6 students; 11c for the first 15.
		const markedUpTo = leaf.id.startsWith('12') ? 6 : leaf.id === '11c' ? 15 : students.length;
		students.forEach((s, si) => {
			if (absent[s.id] || si >= markedUpTo) return;
			const p = Math.max(0, Math.min(1, leafFacility[li] + ability[si] + (rand() - 0.5) * 0.35));
			let score = 0;
			for (let k = 0; k < max; k++) if (rand() < p) score++;
			marks[`${s.id}::${leaf.id}`] = score;
		});
	});
	engine.marks = marks;
	engine.absent = absent;
}

export function resetSample(engine: GridEngine) {
	engine.leaves = makeSampleLeavesForAnalysis();
	engine.students = makeSampleStudents(30);
	fillSampleMarks(engine);
}
