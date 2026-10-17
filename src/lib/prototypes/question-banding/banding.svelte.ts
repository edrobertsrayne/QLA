// PROTOTYPE — throwaway state for wayfinder #32 (banding marksheet columns by question).
// A *confirmed* breakdown (no null marks — #29 blocks confirmation on them) built from #29's sample
// paper, with the stored `questionNumber` from ADR 0002 driving every band. Nothing here is derived
// from the id. Sits on #27's grid engine; analysis follows #28 + #31 (over-max marks excluded).
/* eslint-disable svelte/prefer-svelte-reactivity -- Map/Set/Date here are local temporaries or
   snapshot values replaced wholesale, never mutated in place under observation. */

import type { AssessmentObjective, ParseQuestion, ParseWarning } from '$lib/server/parse/schema.js';
import {
	createGridEngine,
	type GridEngine
} from '$lib/prototypes/marksheet-grid/grid-state.svelte.js';
import { makeSampleStudents } from '$lib/prototypes/marksheet-grid/sample-data.js';

export type Band = 'red' | 'amber' | 'green';
export type SampleKey = 'standard' | 'long' | 'aqa';
export type Singleton = 'repeat' | 'merge' | 'blank';

export const SAMPLES: { key: SampleKey; label: string }[] = [
	{ key: 'standard', label: '33 entries, 1a-style labels' },
	{ key: 'long', label: '41 entries — forces horizontal scroll' },
	{ key: 'aqa', label: '41 entries, AQA-style 01.1 labels' }
];

type Row = [
	id: string,
	questionNumber: string,
	marks: number,
	summary: string,
	specPoint: string | null,
	commandWord: string | null,
	ao: AssessmentObjective | null
];

// #29's sample paper as it stands *after* review: nulls filled in, the missed 5c added.
const BASE: Row[] = [
	['1a', '1', 1, 'Name the organelle for respiration', '4.1.1.2', 'Name', 'AO1'],
	['1b', '1', 2, 'Describe function of cell membrane', '4.1.1.2', 'Describe', 'AO1'],
	['1c', '1', 3, 'Calculate magnification of image', '4.1.1.5', 'Calculate', 'AO2'],
	['2', '2', 6, 'Evaluate use of stem cells', '4.1.2.3', 'Evaluate', 'AO3'],
	['3a', '3', 2, 'State word equation for photosynthesis', '4.4.1.1', 'State', 'AO1'],
	['3bi', '3', 2, 'Read rate from graph at 20°C', '4.4.1.2', null, 'AO2'],
	['3bii', '3', 3, 'Explain limiting factor above 30°C', '4.4.1.2', 'Explain', 'AO2'],
	['3c', '3', 4, 'Plan investigation into light intensity', '4.4.1.2', 'Plan', 'AO3'],
	['4a', '4', 1, 'Identify enzyme active site', '4.2.2.1', 'Identify', 'AO1'],
	['4b', '4', 3, 'Explain effect of pH on enzyme', '4.2.2.1', 'Explain', 'AO2'],
	['4c', '4', 3, 'Calculate rate of reaction', null, 'Calculate', 'AO2'],
	['4d', '4', 2, 'Suggest improvement to method', null, 'Suggest', 'AO3'],
	['5a', '5', 2, 'Describe role of insulin', '4.5.3.2', 'Describe', 'AO1'],
	['5b', '5', 3, 'Compare type 1 and type 2 diabetes', '4.5.3.2', 'Compare', 'AO1'],
	['5c', '5', 4, 'Explain negative feedback in glucose control', '4.5.3.2', 'Explain', 'AO2'],
	['6', '6', 4, 'Explain reflex arc pathway', '4.5.2.1', 'Explain', 'AO1'],
	['7a', '7', 1, 'State where FSH is produced', '4.5.3.4', 'State', 'AO1'],
	['7bi', '7', 2, 'Describe role of oestrogen', '4.5.3.4', 'Describe', 'AO1'],
	['7bii', '7', 2, 'Explain how contraceptive pill works', '4.5.3.5', 'Explain', 'AO2'],
	['7c', '7', 4, 'Evaluate hormonal and barrier methods', '4.5.3.5', 'Evaluate', 'AO3'],
	['8a', '8', 1, 'Define the term allele', '4.6.1.4', 'Define', 'AO1'],
	['8b', '8', 2, 'Complete Punnett square for cross', '4.6.1.4', 'Complete', 'AO2'],
	['8c', '8', 2, 'Calculate probability of offspring', '4.6.1.4', 'Calculate', 'AO2'],
	['9a', '9', 2, 'Describe evidence for evolution', '4.6.3.3', 'Describe', 'AO1'],
	['9b', '9', 3, 'Interpret fossil record diagram', '4.6.3.3', 'Interpret', null],
	['9c', '9', 4, 'Explain antibiotic resistance development', '4.6.3.5', 'Explain', 'AO2'],
	['10a', '10', 2, 'Name two abiotic factors', '4.7.1.2', 'Name', 'AO1'],
	['10b', '10', 3, 'Calculate population estimate from quadrats', '4.7.2.1', 'Calculate', 'AO2'],
	['11', '11', 6, 'Evaluate methods of reducing deforestation', '4.7.3.4', 'Evaluate', 'AO3'],
	['12a', '12', 1, 'State one use of genetic engineering', '4.6.2.4', 'State', 'AO1'],
	['12b', '12', 2, 'Describe steps in producing insulin', '4.6.2.4', 'Describe', 'AO1'],
	['12ci', '12', 1, 'Give one benefit of GM crops', '4.6.2.4', 'Give', 'AO1'],
	['12cii', '12', 3, 'Discuss ethical concerns of GM crops', '4.6.2.4', 'Discuss', 'AO3']
];

const EXTRA: Row[] = [
	['13a', '13', 2, 'Describe structure of DNA', '4.6.1.5', 'Describe', 'AO1'],
	['13b', '13', 3, 'Explain how mutation affects protein', '4.6.1.5', 'Explain', 'AO2'],
	['14ai', '14', 1, 'Identify producer in food web', '4.7.2.1', 'Identify', 'AO1'],
	['14aii', '14', 2, 'Calculate energy transfer efficiency', '4.7.4.2', 'Calculate', 'AO2'],
	['14b', '14', 4, 'Explain biomass loss between levels', '4.7.4.2', 'Explain', 'AO1'],
	['15', '15', 6, 'Evaluate vaccination programme data', '4.3.1.7', 'Evaluate', 'AO3'],
	['16a', '16', 2, 'Describe how pathogens spread', '4.3.1.1', 'Describe', 'AO1'],
	['16b', '16', 3, 'Explain white blood cell response', '4.3.1.6', 'Explain', 'AO2']
];

/** Entries whose questionNumber the model "omitted" in the degraded sample. */
const DEGRADED_IDS: Record<string, true> = { '7bii': true, '12ci': true };

/** AQA prints `01.1`, `01.2`, `02` … — renumber subquestions in order within each question. */
function toAqa(rows: Row[]): Row[] {
	const counts = new Map<string, number>();
	const sizes = new Map<string, number>();
	for (const r of rows) sizes.set(r[1], (sizes.get(r[1]) ?? 0) + 1);
	return rows.map((r) => {
		const q = r[1].padStart(2, '0');
		if (sizes.get(r[1]) === 1) return [q, q, ...r.slice(2)] as Row;
		const n = (counts.get(r[1]) ?? 0) + 1;
		counts.set(r[1], n);
		return [`${q}.${n}`, q, ...r.slice(2)] as Row;
	});
}

export function makeBreakdown(
	key: SampleKey,
	degraded: boolean
): { questions: ParseQuestion[]; warnings: ParseWarning[] } {
	const base = key === 'standard' ? BASE : [...BASE, ...EXTRA];
	const fellBack = (i: number) => degraded && DEGRADED_IDS[base[i][0]] === true;
	let rows = key === 'aqa' ? toAqa(base) : base;
	// Apply the fallback after relabelling so it mirrors applyQuestionNumberFallback: qn := own id.
	rows = rows.map((r, i) => (fellBack(i) ? [r[0], r[0], ...r.slice(2)] : r) as Row);
	const questions = rows.map(
		([id, questionNumber, marks, summary, specPoint, commandWord, ao]) => ({
			id,
			questionNumber,
			marks,
			summary,
			specPoint,
			commandWord,
			ao
		})
	);
	const warnings: ParseWarning[] = rows
		.filter((_, i) => fellBack(i))
		.map((r) => ({
			questionId: r[0],
			code: 'MISSING_QUESTION_NUMBER',
			message: `Entry '${r[0]}' has no question number; grouping falls back to its own id.`
		}));
	return { questions, warnings };
}

// ---------------------------------------------------------------------------------------------
// Bands: contiguous runs of the same stored questionNumber, in paper order.

export interface QuestionBand {
	questionNumber: string;
	start: number;
	end: number;
	entries: ParseQuestion[];
	marks: number;
	/** The model omitted questionNumber for this band's entry; it fell back to the entry's own id. */
	fallback: boolean;
	/** An undivided question: one entry whose id is the question number. */
	undivided: boolean;
}

export function bandsOf(entries: ParseQuestion[], warnings: ParseWarning[]): QuestionBand[] {
	const fellBack = new Set(
		warnings.filter((w) => w.code === 'MISSING_QUESTION_NUMBER').map((w) => w.questionId)
	);
	const out: QuestionBand[] = [];
	entries.forEach((e, i) => {
		const last = out.at(-1);
		if (last && last.questionNumber === e.questionNumber) {
			last.end = i;
			last.entries.push(e);
		} else {
			out.push({
				questionNumber: e.questionNumber,
				start: i,
				end: i,
				entries: [e],
				marks: 0,
				fallback: false,
				undivided: false
			});
		}
	});
	for (const b of out) {
		b.marks = b.entries.reduce((s, e) => s + (e.marks ?? 0), 0);
		// A band is "fallback" only while the fallback still holds (qn === id); a teacher fix on the
		// breakdown page clears it even though the stored warning remains.
		b.fallback = b.entries.some((e) => fellBack.has(e.id) && e.questionNumber === e.id);
		b.undivided = !b.fallback && b.entries.length === 1 && b.entries[0].id === b.questionNumber;
	}
	return out;
}

// ---------------------------------------------------------------------------------------------
// Analysis. Entry facility as #28/#31; question facility pools a question's entries.

export interface Result {
	key: string;
	label: string;
	/** Breakdown entries this row covers (one for an entry row). */
	entries: ParseQuestion[];
	marks: number;
	facility: number | null;
	mean: number | null;
	/** Marks entered (cells), and the cells that could be entered — coverage. */
	n: number;
	of: number;
	partMarked: boolean;
	overMax: number;
	fallback: boolean;
}

export const THRESHOLDS = { red: 0.4, green: 0.7 };

export function bandFor(f: number | null): Band | null {
	if (f == null) return null;
	if (f < THRESHOLDS.red) return 'red';
	if (f < THRESHOLDS.green) return 'amber';
	return 'green';
}

function pooled(engine: GridEngine, entries: ParseQuestion[]) {
	const present = engine.students.filter((s) => !engine.isAbsent(s.id));
	let gained = 0;
	let available = 0;
	let n = 0;
	let overMax = 0;
	let perStudentSum = 0;
	for (const e of entries) {
		for (const s of present) {
			const v = engine.markAt(s.id, e.id);
			if (v == null) continue;
			n++;
			if (e.marks != null && v > e.marks) {
				overMax++;
				continue; // #31: over-max marks are excluded, not capped.
			}
			gained += v;
			available += e.marks ?? 0;
			perStudentSum += v;
		}
	}
	const of = present.length * entries.length;
	const facility = available > 0 ? gained / available : null;
	// Mean mark per student on the whole question (or entry), for the "0.9/4" read-out.
	const scale = entries.length > 0 && n - overMax > 0 ? (n - overMax) / entries.length : 0;
	return {
		facility,
		mean: scale > 0 ? perStudentSum / scale : null,
		n,
		of,
		partMarked: n > 0 && n < of,
		overMax
	};
}

export interface Snapshot {
	at: Date;
	entries: Result[];
	questions: Result[];
	present: number;
	absent: number;
}

export function computeSnapshot(engine: GridEngine, bands: QuestionBand[]): Snapshot {
	const entries: Result[] = engine.leaves.map((e) => ({
		key: e.id,
		label: e.id,
		entries: [e],
		marks: e.marks ?? 0,
		fallback: bands.some((b) => b.fallback && b.entries.includes(e)),
		...pooled(engine, [e])
	}));
	// Questions pool every entry sharing a questionNumber, contiguous or not (a fallback band
	// splits a question on screen but the stored number still says which entries belong together).
	const byQn = new Map<string, ParseQuestion[]>();
	for (const e of engine.leaves) {
		if (!byQn.has(e.questionNumber)) byQn.set(e.questionNumber, []);
		byQn.get(e.questionNumber)!.push(e);
	}
	const questions: Result[] = [...byQn].map(([qn, es]) => ({
		key: `q:${qn}`,
		label: qn,
		entries: es,
		marks: es.reduce((s, e) => s + (e.marks ?? 0), 0),
		fallback: bands.some((b) => b.fallback && b.questionNumber === qn),
		...pooled(engine, es)
	}));
	const present = engine.students.filter((s) => !engine.isAbsent(s.id)).length;
	return {
		at: new Date(),
		entries,
		questions,
		present,
		absent: engine.students.length - present
	};
}

export function worstFirst(rows: Result[]): Result[] {
	return [...rows].sort((a, b) => {
		if (a.facility == null && b.facility == null) return 0;
		if (a.facility == null) return 1;
		if (b.facility == null) return -1;
		return a.facility - b.facility;
	});
}

// ---------------------------------------------------------------------------------------------
// Sample marks: 30 students, two absent, Q12 marked for 6 students, Q11 for 15 (part-marked).

function mulberry32(seed: number) {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function fillMarks(engine: GridEngine, seed = 11) {
	const rand = mulberry32(seed);
	const marks: Record<string, number> = {};
	const absent: Record<string, boolean> = {};
	const students = engine.students;
	const ability = students.map(() => (rand() - 0.5) * 0.5);
	const difficulty = engine.leaves.map(() => 0.12 + rand() * 0.8);
	absent[students[4].id] = true;
	absent[students[17].id] = true;
	engine.leaves.forEach((e, li) => {
		const q = e.questionNumber.replace(/^0+/, '').replace(/[a-z.].*$/, '');
		const markedUpTo = q === '12' ? 6 : q === '11' ? 15 : students.length;
		students.forEach((s, si) => {
			if (absent[s.id] || si >= markedUpTo) return;
			const p = Math.max(0, Math.min(1, difficulty[li] + ability[si] + (rand() - 0.5) * 0.35));
			let score = 0;
			for (let k = 0; k < (e.marks ?? 4); k++) if (rand() < p) score++;
			marks[`${s.id}::${e.id}`] = score;
		});
	});
	engine.marks = marks;
	engine.absent = absent;
}

export class BandingState {
	sample = $state<SampleKey>('standard');
	degraded = $state(false);
	/** Give a fallback band its own look on the marksheet and in the report. */
	flagFallback = $state(true);
	singleton = $state<Singleton>('repeat');
	warnings = $state<ParseWarning[]>([]);
	engine: GridEngine;
	snapshot = $state<Snapshot | null>(null);

	constructor() {
		this.engine = createGridEngine([], makeSampleStudents(30));
		this.load();
	}

	bands = $derived.by(() => bandsOf(this.engine.leaves, this.warnings));

	load() {
		const { questions, warnings } = makeBreakdown(this.sample, this.degraded);
		this.engine.leaves = questions;
		this.engine.students = makeSampleStudents(30);
		this.engine.cursor = { row: 0, col: 0 };
		this.engine.editing = null;
		this.warnings = warnings;
		fillMarks(this.engine);
		this.generate();
	}

	generate() {
		this.snapshot = computeSnapshot(this.engine, bandsOf(this.engine.leaves, this.warnings));
	}

	entryResult(id: string) {
		return this.snapshot?.entries.find((r) => r.key === id) ?? null;
	}

	questionResult(qn: string) {
		return this.snapshot?.questions.find((r) => r.label === qn) ?? null;
	}
}
