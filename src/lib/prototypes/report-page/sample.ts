// PROTOTYPE — wipe me. Sample long paper and four students for the report page
// prototype (wayfinder #53). Every figure is calculated here, the way the real
// report will; only the feedback prose is canned, standing in for the model.

import { questionBands } from '$lib/marksheet/breakdown.js';
import { facilityBand, type RagBand } from '$lib/marksheet/analysis.js';
import type { BreakdownEntry } from '$lib/marksheet/document.js';
import type { AssessmentObjective } from '$lib/parse/assessment-objectives.js';

type Row = [
	q: string,
	part: string,
	marks: number,
	summary: string,
	spec: string | null,
	ao: AssessmentObjective
];

// 44 entries, 100 marks: a GCSE-physics-shaped Paper 1 tagged at sub-topic depth
// (10 specification points), with comma and slash lists and entries with none.
const ROWS: Row[] = [
	['1', 'a', 1, 'Name the energy store of a stretched spring', '4.1.1', 'AO1'],
	['1', 'b', 2, 'Describe the energy transfers when a ball is dropped', '4.1.1', 'AO1'],
	['1', 'c', 3, 'Calculate the kinetic energy of the ball', '4.1.1', 'AO2'],
	['1', 'd', 2, 'Calculate the gravitational potential energy gained', '4.1.1', 'AO2'],
	[
		'1',
		'e',
		4,
		'Explain why the ball does not bounce back to its starting height',
		'4.1.1, 4.1.2',
		'AO2'
	],
	['2', 'a', 1, 'State what is meant by specific heat capacity', '4.1.1', 'AO1'],
	['2', 'b', 2, 'Identify the independent and control variables', null, 'AO3'],
	['2', 'c(i)', 2, 'Calculate the energy transferred by the heater', '4.1.1', 'AO2'],
	['2', 'c(ii)', 3, 'Calculate the specific heat capacity of the block', '4.1.1', 'AO2'],
	['2', 'd', 4, 'Explain why the value is higher than the true value', '4.1.2', 'AO3'],
	['2', 'e', 2, 'Suggest one improvement to reduce energy losses', null, 'AO3'],
	['3', 'a', 1, 'Draw the circuit symbol for a thermistor', '4.2.1', 'AO1'],
	['3', 'b', 2, 'Calculate the charge that flows in 2 minutes', '4.2.1', 'AO2'],
	['3', 'c', 3, 'Calculate the resistance of the lamp', '4.2.1', 'AO2'],
	[
		'3',
		'd',
		2,
		'Describe how resistance of the thermistor changes with temperature',
		'4.2.1',
		'AO1'
	],
	['3', 'e', 3, 'Calculate the total resistance of the series circuit', '4.2.2', 'AO2'],
	['3', 'f', 1, 'State the current in the second resistor', '4.2.2', 'AO2'],
	['4', 'a', 1, 'State the frequency of mains electricity in the UK', '4.2.3', 'AO1'],
	['4', 'b', 1, 'Name the colour of the earth wire', '4.2.3', 'AO1'],
	['4', 'c', 2, 'Explain why a person touching the live wire gets a shock', '4.2.3', 'AO1'],
	['4', 'd', 3, 'Calculate the power of the kettle', '4.2.3', 'AO2'],
	['4', 'e', 2, 'Calculate the energy transferred in kilowatt-hours', '4.2.3', 'AO2'],
	['5', 'a', 2, 'Describe the arrangement of particles in a solid', '4.3.1', 'AO1'],
	['5', 'b', 3, 'Calculate the density of the stone', '4.3.1', 'AO2'],
	['5', 'c', 2, 'Describe how to find the volume of an irregular object', '4.3.1', 'AO3'],
	['5', 'd', 4, 'Calculate the energy needed to melt the ice', '4.3.2', 'AO2'],
	[
		'5',
		'e',
		6,
		'Explain the shape of the heating curve in terms of particles',
		'4.3.2 / 4.3.1',
		'AO1'
	],
	['6', 'a', 1, 'State the charge on a neutron', '4.4.1', 'AO1'],
	['6', 'b', 1, 'Give the number of protons in the nucleus', '4.4.1', 'AO2'],
	['6', 'c', 2, 'Explain why the atom has no overall charge', '4.4.1', 'AO1'],
	[
		'6',
		'd',
		2,
		'Describe how the plum pudding model differed from the nuclear model',
		'4.4.1',
		'AO1'
	],
	['6', 'e', 3, 'Explain what the alpha scattering experiment showed', '4.4.1', 'AO2'],
	['7', 'a', 1, 'Name the type of radiation that is most ionising', '4.4.2', 'AO1'],
	['7', 'b', 2, 'Complete the nuclear equation for beta decay', '4.4.2', 'AO2'],
	['7', 'c', 3, 'Determine the half-life from the graph', '4.4.2', 'AO2'],
	['7', 'd', 2, 'Calculate the activity after three half-lives', '4.4.2', 'AO2'],
	['7', 'e', 2, 'Explain the difference between contamination and irradiation', '4.4.2', 'AO1'],
	['8', 'a', 1, 'Name the instrument used to measure the current', null, 'AO1'],
	['8', 'b', 2, 'Plot the remaining points and draw a line of best fit', null, 'AO3'],
	['8', 'c', 2, 'Use the graph to find the resistance of 40 cm of wire', '4.2.1', 'AO3'],
	['8', 'd', 3, 'Evaluate whether the results support the hypothesis', null, 'AO3'],
	['9', 'a', 2, 'Describe the motion of gas particles in the container', '4.3.3', 'AO1'],
	['9', 'b', 3, 'Explain why pressure rises when the gas is heated', '4.3.3', 'AO2'],
	['9', 'c', 4, 'Calculate the new pressure after the gas is compressed', '4.3.3', 'AO2']
];

/** Teacher-confirmed topic names, one per normalised code. */
export const TOPIC_NAMES: Record<string, string> = {
	'4.1.1': 'Energy stores and transfers',
	'4.1.2': 'Efficiency and wasted energy',
	'4.2.1': 'Current, potential difference and resistance',
	'4.2.2': 'Series and parallel circuits',
	'4.2.3': 'Mains electricity and power',
	'4.3.1': 'Density and states of matter',
	'4.3.2': 'Internal energy and changes of state',
	'4.3.3': 'Gas pressure',
	'4.4.1': 'Atomic structure',
	'4.4.2': 'Nuclear radiation and half-life'
};

const AO_NAMES: Record<AssessmentObjective, string> = {
	AO1: 'AO1 Knowledge and understanding',
	AO2: 'AO2 Applying knowledge',
	AO3: 'AO3 Analysing and evaluating'
};

/** GCSE 9–1 boundaries, typed by the teacher, lowest mark per grade. */
const BOUNDARIES: [label: string, min: number][] = [
	['9', 84],
	['8', 75],
	['7', 66],
	['6', 56],
	['5', 46],
	['4', 36],
	['3', 26],
	['2', 16],
	['1', 7]
];

export const PAPER = {
	label: 'Physics Paper 1 (Higher) — Energy, Electricity, Particles, Atomic structure',
	className: '11P2'
};

export const ENTRIES: BreakdownEntry[] = ROWS.map(([q, part, marks, summary, spec, ao], i) => ({
	id: `e${i}`,
	label: `${q}${part}`,
	questionNumber: q,
	marks,
	summary,
	specPoint: spec,
	commandWord: null,
	ao,
	original: null
}));

export interface Prose {
	strengths: string[];
	areas: string[];
}

interface StudentSeed {
	id: string;
	name: string;
	/** Ability per question 1–9, so the canned feedback roughly matches the marks. */
	ability: number[];
	generated: Prose;
	/** A teacher edit that came out longer than what was generated. */
	edited?: Prose;
}

const STUDENTS: StudentSeed[] = [
	{
		id: 's0',
		name: 'Ava Ahmed',
		ability: [0.95, 0.9, 0.95, 1, 0.8, 0.95, 0.55, 0.9, 0.85],
		generated: {
			strengths: [
				'Your calculations were set out clearly, with the equation, substitution and unit every time.',
				'You explained circuits confidently, linking current, potential difference and resistance correctly.',
				'Your evaluation of the practical results used the data to support each point you made.'
			],
			areas: [
				'Half-life questions need you to read values carefully from the graph and count each half-life step. Practise three half-life graph questions, writing down every reading before you calculate.',
				'The six-mark heating curve answer needed each flat section linked to particles and energy. Plan a six-mark answer as a bullet list first, then check every point mentions the particles.'
			]
		}
	},
	{
		id: 's1',
		name: 'Oscar Hughes-Montgomery-Whitfield',
		ability: [0.75, 0.3, 0.85, 0.6, 0.45, 0.6, 0.5, 0.55, 0.25],
		generated: {
			strengths: [
				'You worked through the circuit calculations accurately and remembered to include units.',
				'Your descriptions of energy stores and transfers used the right scientific words.'
			],
			areas: [
				'Specific heat capacity questions need the equation rearranged before you substitute the numbers. Write the equation out, rearrange it, then do five practice questions from your revision guide.',
				'Gas pressure answers need you to explain what the particles do, not just what happens to the pressure. Make a flashcard linking particle speed, collisions and pressure, and test yourself on it.'
			]
		}
	},
	{
		id: 's2',
		name: 'Lily Quinn',
		ability: [0.45, 0.2, 0.2, 0.35, 0.15, 0.65, 0.25, 0.3, 0.15],
		generated: {
			strengths: [
				'You knew the structure of the atom well, including the charges on each particle.'
			],
			areas: [
				'Most of the calculation questions were left without working, so no method marks could be given. Learn the five equations on the formula card by heart and practise writing each one before using it.',
				'Questions that ask you to explain need a reason, not just a description. Use the word "because" in every explain answer and practise on three past questions.'
			]
		}
	},
	{
		id: 's3',
		name: 'Theo Roberts',
		ability: [0.6, 0.55, 0.55, 0.8, 0.3, 0.6, 0.35, 0.9, 0.55],
		generated: {
			strengths: [
				'Your practical skills were strong: you plotted points accurately and drew a sensible line of best fit.',
				'You knew the facts about mains electricity and plug safety well.',
				'You used the power equation correctly to find the power of the kettle.'
			],
			areas: [
				'Questions on changes of state need you to link energy to what the particles are doing. Draw a heating curve and label each section with what happens to the particles.',
				'Radioactive decay questions need careful use of the graph and the nuclear equation. Practise balancing three nuclear equations and finding half-life from two different graphs.'
			]
		},
		edited: {
			strengths: [
				'Your practical skills were strong: you plotted points accurately and drew a sensible line of best fit, and your evaluation of the hypothesis in 8d referred back to the data, which is exactly what examiners look for in this kind of question.',
				'You knew the facts about mains electricity and plug safety well, including why the earth wire matters and what happens if someone touches the live wire.',
				'You used the power equation correctly to find the power of the kettle, and you converted the time into seconds without being prompted. Well done for checking your units.'
			],
			areas: [
				'Questions on changes of state need you to link energy to what the particles are doing. In 5e you described the graph but did not explain why the temperature stays the same while the ice melts. Draw a heating curve and label each section with what happens to the particles, then use your labels to write a six-mark answer and swap it with a partner to mark against the markscheme we used in class.',
				'Radioactive decay questions need careful use of the graph and the nuclear equation. You lost marks in 7b because the mass number did not balance, and in 7c because you read the half-life from the wrong point on the curve. Practise balancing three nuclear equations and finding half-life from two different graphs, and come and see me at lunchtime if you want to go through them together.'
			]
		}
	}
];

function rand(seed: number): () => number {
	let s = seed;
	return () => {
		s = (s * 1664525 + 1013904223) % 4294967296;
		return s / 4294967296;
	};
}

function marksFor(seed: StudentSeed, index: number): Record<string, number> {
	const r = rand(17 + index * 31);
	const marks: Record<string, number> = {};
	for (const entry of ENTRIES) {
		const ability = seed.ability[Number(entry.questionNumber) - 1];
		const f = Math.max(0, Math.min(1, ability + (r() - 0.5) * 0.5));
		marks[entry.id] = Math.round((entry.marks ?? 0) * f);
	}
	return marks;
}

/** Trim, split comma/slash lists: one entry counts toward each code. */
function normaliseCodes(specPoint: string | null): string[] {
	if (!specPoint) return [];
	return specPoint
		.split(/[,/]/)
		.map((c) => c.trim())
		.filter((c) => c !== '');
}

export interface Figure {
	key: string;
	name: string;
	gained: number;
	available: number;
	band: RagBand;
}

export interface EntryLine {
	id: string;
	label: string;
	summary: string;
	gained: number;
	available: number;
	band: RagBand;
}

export interface QuestionGroup {
	questionNumber: string;
	gained: number;
	available: number;
	entries: EntryLine[];
}

export interface ReportFigures {
	id: string;
	name: string;
	paper: string;
	className: string;
	total: number;
	available: number;
	percent: number;
	grade: string | null;
	/** Next boundary above the total, minus the total; null at the top grade. */
	toNext: { grade: string; marks: number } | null;
	questions: QuestionGroup[];
	topics: Figure[];
	aos: Figure[];
}

const band = (gained: number, available: number) =>
	facilityBand(available === 0 ? 0 : gained / available);

function figures(seed: StudentSeed, index: number): ReportFigures {
	const marks = marksFor(seed, index);
	const topics = new Map<string, Figure>();
	const aos = new Map<string, Figure>();
	const add = (map: Map<string, Figure>, key: string, name: string, g: number, a: number) => {
		const f = map.get(key) ?? { key, name, gained: 0, available: 0, band: 'red' as RagBand };
		f.gained += g;
		f.available += a;
		map.set(key, f);
	};
	for (const entry of ENTRIES) {
		const g = marks[entry.id];
		const a = entry.marks ?? 0;
		for (const code of normaliseCodes(entry.specPoint)) add(topics, code, TOPIC_NAMES[code], g, a);
		if (entry.ao) add(aos, entry.ao, AO_NAMES[entry.ao], g, a);
	}
	for (const f of [...topics.values(), ...aos.values()]) f.band = band(f.gained, f.available);

	const questions = questionBands(ENTRIES).map((b) => {
		const entries = b.entries.map((e) => ({
			id: e.id,
			label: e.label,
			summary: e.summary,
			gained: marks[e.id],
			available: e.marks ?? 0,
			band: band(marks[e.id], e.marks ?? 0)
		}));
		return {
			questionNumber: b.questionNumber,
			gained: entries.reduce((s, e) => s + e.gained, 0),
			available: entries.reduce((s, e) => s + e.available, 0),
			entries
		};
	});
	const total = questions.reduce((s, q) => s + q.gained, 0);
	const available = questions.reduce((s, q) => s + q.available, 0);
	const reached = BOUNDARIES.findIndex(([, min]) => total >= min);
	const grade = reached === -1 ? 'U' : BOUNDARIES[reached][0];
	const nextIndex = reached === -1 ? BOUNDARIES.length - 1 : reached - 1;
	const toNext =
		nextIndex >= 0
			? { grade: BOUNDARIES[nextIndex][0], marks: BOUNDARIES[nextIndex][1] - total }
			: null;
	return {
		id: seed.id,
		name: seed.name,
		paper: PAPER.label,
		className: PAPER.className,
		total,
		available,
		percent: Math.round((total / available) * 100),
		grade,
		toNext,
		questions,
		topics: [...topics.values()],
		aos: [...aos.values()]
	};
}

export const REPORTS: ReportFigures[] = STUDENTS.map(figures);

export function initialProse(): Record<string, Prose> {
	return Object.fromEntries(STUDENTS.map((s) => [s.id, structuredClone(s.edited ?? s.generated)]));
}

export function generatedProse(id: string): Prose {
	return structuredClone(STUDENTS.find((s) => s.id === id)!.generated);
}

export function wasEdited(id: string): boolean {
	return STUDENTS.find((s) => s.id === id)?.edited !== undefined;
}
