// PROTOTYPE — throwaway sample data for the marksheet grid prototype (wayfinder #27).
// Shape mirrors src/lib/server/parse/schema.ts (Breakdown / ParseQuestion), not a fixture used elsewhere.

import type { AssessmentObjective, ParseQuestion } from '$lib/server/parse/schema.js';

export interface Student {
	id: string;
	name: string;
}

const AOS: AssessmentObjective[] = ['AO1', 'AO2', 'AO3'];
const COMMAND_WORDS = ['State', 'Describe', 'Explain', 'Calculate', 'Compare', 'Evaluate', null];

const QUESTIONS: { q: number; parts: string[]; topic: string }[] = [
	{ q: 1, parts: ['a', 'b'], topic: 'Cell structure' },
	{ q: 2, parts: ['a', 'b', 'c'], topic: 'Photosynthesis' },
	{ q: 3, parts: ['a', 'bi', 'bii'], topic: 'Respiration' },
	{ q: 4, parts: ['a', 'b'], topic: 'Enzymes' },
	{ q: 5, parts: ['a', 'b', 'c', 'd'], topic: 'Homeostasis' },
	{ q: 6, parts: ['a', 'b'], topic: 'Nervous system' },
	{ q: 7, parts: ['a', 'bi', 'bii', 'c'], topic: 'Hormones' },
	{ q: 8, parts: ['a', 'b'], topic: 'Reproduction' },
	{ q: 9, parts: ['a', 'b', 'c'], topic: 'Variation and inheritance' },
	{ q: 10, parts: ['a', 'b'], topic: 'Natural selection' },
	{ q: 11, parts: ['a', 'b', 'c'], topic: 'Ecosystems' },
	{ q: 12, parts: ['a', 'b'], topic: 'Biotechnology' }
];

const FIRST_NAMES = [
	'Ava',
	'Noah',
	'Olivia',
	'Leo',
	'Amelia',
	'Muhammad',
	'Isla',
	'Oscar',
	'Freya',
	'Arthur',
	'Ivy',
	'George',
	'Grace',
	'Jacob',
	'Poppy',
	'Charlie',
	'Elsie',
	'Jack',
	'Rosie',
	'Harry',
	'Sienna',
	'Oliver',
	'Willow',
	'Theo',
	'Millie',
	'Freddie',
	'Daisy',
	'Alfie',
	'Phoebe',
	'Henry'
];

const LAST_NAMES = [
	'Adeyemi',
	'Baker',
	'Chen',
	'Davies',
	'Evans',
	'Farooq',
	'Green',
	'Hussain',
	'Ibrahim',
	'Jones',
	'Khan',
	'Lewis',
	'Morgan',
	'Novak',
	'O’Brien',
	'Patel',
	'Quinn',
	'Roberts',
	'Singh',
	'Taylor',
	'Ullah',
	'Vaughan',
	'Wright',
	'Xu',
	'Young',
	'Zhang',
	'Bennett',
	'Clarke',
	'Dawson',
	'Foster'
];

/** Deterministic pseudo-random so the sample is stable across reloads. */
function mulberry32(seed: number) {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function makeSampleLeaves(): ParseQuestion[] {
	const rand = mulberry32(42);
	const leaves: ParseQuestion[] = [];
	for (const { q, parts, topic } of QUESTIONS) {
		for (const part of parts) {
			const marks = 1 + Math.floor(rand() * 6);
			const hasSpec = rand() > 0.15;
			const hasAo = rand() > 0.1;
			const hasCommandWord = rand() > 0.2;
			leaves.push({
				id: `${q}${part}`,
				marks,
				summary: `${topic}${part.length > 1 ? ' (cont.)' : ''} — ${
					['recall', 'apply', 'link to context', 'compare methods', 'justify conclusion'][
						Math.floor(rand() * 5)
					]
				}`,
				specPoint: hasSpec ? `4.${q}.${part.charCodeAt(0) - 96}` : null,
				commandWord: hasCommandWord
					? COMMAND_WORDS[Math.floor(rand() * (COMMAND_WORDS.length - 1))]
					: null,
				ao: hasAo ? AOS[Math.floor(rand() * AOS.length)] : null
			});
		}
	}
	return leaves;
}

export function makeSampleStudents(count = 30): Student[] {
	const rand = mulberry32(7);
	const used = new Set<string>();
	const students: Student[] = [];
	for (let i = 0; i < count; i++) {
		let name: string;
		do {
			const first = FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)];
			const last = LAST_NAMES[Math.floor(rand() * LAST_NAMES.length)];
			name = `${first} ${last}`;
		} while (used.has(name));
		used.add(name);
		students.push({ id: `s${i}`, name });
	}
	return students;
}

/** Groups leaves by their parent question number, preserving leaf order. */
export function groupByQuestion(
	leaves: ParseQuestion[]
): { question: string; leaves: ParseQuestion[] }[] {
	const groups = new Map<string, ParseQuestion[]>();
	for (const leaf of leaves) {
		const q = leaf.id.match(/^\d+/)?.[0] ?? leaf.id;
		if (!groups.has(q)) groups.set(q, []);
		groups.get(q)!.push(leaf);
	}
	return [...groups.entries()].map(([question, qLeaves]) => ({ question, leaves: qLeaves }));
}
