// PROTOTYPE — wipe me. Sample marksheet for the report-flow prototype (wayfinder #54).
// Seeds localStorage only when `?prototype-seed` is on the URL and nothing is stored,
// so a fresh dev origin has a confirmed marksheet to make reports from.

import {
	DOCUMENT_SCHEMA_VERSION,
	STORAGE_KEY,
	type MarksheetDocument
} from '$lib/marksheet/document.js';
import type { AssessmentObjective } from '$lib/parse/assessment-objectives.js';

type Row = [
	q: string,
	part: string,
	marks: number,
	summary: string,
	spec: string | null,
	ao: AssessmentObjective
];

// A GCSE-physics-shaped paper: comma and slash lists, and a few entries with no spec point.
const ROWS: Row[] = [
	['1', 'a', 1, 'Name the type of wave shown', '4.6.1.1', 'AO1'],
	['1', 'b', 2, 'Describe how the particles move in a longitudinal wave', '4.6.1.1', 'AO1'],
	['1', 'c', 3, 'Calculate the wave speed from frequency and wavelength', '4.6.1.2', 'AO2'],
	['2', 'a', 2, 'State two uses of microwaves', '4.6.2.4', 'AO1'],
	['2', 'b', 4, 'Explain why X-rays are hazardous to cells', '4.6.2.3, 4.6.2.4', 'AO1'],
	['3', 'a', 3, 'Draw a ray diagram for a converging lens', '4.6.2.5', 'AO2'],
	['3', 'b', 2, 'Calculate magnification', '4.6.2.5', 'AO2'],
	['3', 'c', 4, 'Evaluate two lens designs for a camera', '4.6.2.5', 'AO3'],
	['4', 'a', 2, 'Identify the dependent variable', null, 'AO3'],
	['4', 'b', 3, 'Plan a method to measure refraction in a glass block', '4.6.1.3', 'AO3'],
	['4', 'c', 2, 'Suggest an improvement to the method', null, 'AO3'],
	['5', 'a', 1, 'State what is meant by a black body', '4.6.2.6', 'AO1'],
	[
		'5',
		'b',
		3,
		'Explain how the Earth\u2019s temperature stays roughly constant',
		'4.6.2.6 / 4.6.2.3',
		'AO2'
	],
	['5', 'c', 6, 'Compare infrared emission from two surfaces using the data', '4.6.2.6', 'AO3'],
	['6', '', 4, 'Calculate the time for a sound echo to return', '4.6.1.2', 'AO2']
];

const STUDENTS: [string, string][] = [
	['Ava', 'Ahmed'],
	['Noah', 'Baker'],
	['Olivia', 'Chen'],
	['Leo', 'Davies'],
	['Amelia', 'Evans'],
	['Muhammad', 'Farah'],
	['Isla', 'Green'],
	['Oscar', 'Hughes'],
	['Freya', 'Iqbal'],
	['Arthur', 'Jones'],
	['Ivy', 'Khan'],
	['George', 'Lewis'],
	['Grace', 'Morgan'],
	['Harry', 'Nowak'],
	['Mia', 'Owusu'],
	['Jack', 'Patel'],
	['Lily', 'Quinn'],
	['Theo', 'Roberts'],
	['Ella', 'Singh'],
	['Alfie', 'Taylor'],
	['Sophia', 'Usman'],
	['Finley', 'Vance'],
	['Ruby', 'Walsh'],
	['Charlie', 'Xu'],
	['Poppy', 'Young'],
	['Henry', 'Zielinski'],
	['Evie', 'Adebayo']
];

/** Deterministic noise so every reload seeds the same class. */
function rand(seed: number): () => number {
	let s = seed;
	return () => {
		s = (s * 1664525 + 1013904223) % 4294967296;
		return s / 4294967296;
	};
}

export function sampleDocument(): MarksheetDocument {
	const now = new Date().toISOString();
	const r = rand(7);
	const entries = ROWS.map(([q, part, marks, summary, spec, ao], i) => ({
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
	const students = STUDENTS.map(([firstName, surname], i) => ({
		id: `s${i}`,
		firstName,
		surname,
		absent: i === 5 || i === 19
	}));
	const marks: Record<string, Record<string, number>> = {};
	students.forEach((student, si) => {
		const ability = 0.25 + r() * 0.7;
		const row: Record<string, number> = {};
		entries.forEach((entry, ei) => {
			// Two part-marked students, one over-max typo.
			if (si === 8 && ei >= 12) return;
			if (si === 14 && ei === 3) return;
			row[entry.id] = Math.min(
				entry.marks,
				Math.round(entry.marks * Math.min(1, ability + (r() - 0.5) * 0.6))
			);
		});
		if (si === 11) row['e6'] = 22;
		if (si === 5 || si === 19) return; // absent, unmarked
		marks[student.id] = row;
	});
	return {
		schemaVersion: DOCUMENT_SCHEMA_VERSION,
		createdAt: now,
		updatedAt: now,
		breakdownConfirmedAt: now,
		lastExportedAt: now,
		paper: {
			label: 'Physics Paper 2 — Waves (Higher)',
			className: '11P2',
			sourceFilenames: ['prototype-sample.pdf'],
			parsedAt: now
		},
		breakdown: { entries, warnings: [] },
		students,
		marks
	};
}

/** PROTOTYPE seed hook, called from the root load before the store reads storage. */
export function seedIfAsked(url: URL): void {
	if (!url.searchParams.has('prototype-seed')) return;
	if (window.localStorage.getItem(STORAGE_KEY) !== null) return;
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleDocument()));
}
