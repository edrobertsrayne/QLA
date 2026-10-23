// PROTOTYPE (#116): in-memory report scenarios for the tier-name header. Wipe me.
// One document per tier (its own breakdown and boundaries), built from the real
// AQA 8463 Paper 1 Higher/Foundation parses.
import type {
	BreakdownEntry,
	GradeBoundary,
	MarksheetDocument,
	StoredReport
} from '$lib/marksheet/document.js';
import { generationInputFor } from '$lib/marksheet/report-input.js';
import type { AssessmentObjective } from '$lib/parse/assessment-objectives.js';
import higher from './8463-1H.json';
import foundation from './8463-1F.json';

const NOW = '2026-10-23T10:00:00.000Z';

const TOPIC_NAMES: Record<string, string> = {
	'4.1.1.1': 'Energy stores and systems',
	'4.1.1.2': 'Changes in energy',
	'4.1.1.3': 'Energy changes in systems',
	'4.1.1.4': 'Power',
	'4.1.2.1': 'Energy transfers in a system',
	'4.1.2.2': 'Efficiency',
	'4.1.3': 'Energy resources',
	'4.2.1.1': 'Circuit symbols',
	'4.2.1.2': 'Charge and current',
	'4.2.1.3': 'Current, resistance and potential difference',
	'4.2.1.4': 'Resistors',
	'4.2.2': 'Series and parallel circuits',
	'4.2.3.1': 'Direct and alternating potential difference',
	'4.2.4.1': 'Power in circuits',
	'4.2.4.2': 'Energy transfers in appliances',
	'4.2.4.3': 'The National Grid',
	'4.2.5.1': 'Static charge',
	'4.2.5.2': 'Electric fields',
	'4.3.1.1': 'Density',
	'4.3.2.1': 'Changes of state',
	'4.3.2.3': 'Specific latent heat',
	'4.3.3.1': 'Particle motion in gases',
	'4.3.3.2': 'Pressure in gases',
	'4.4.1.1': 'Structure of an atom',
	'4.4.1.2': 'Isotopes',
	'4.4.1.3': 'Models of the atom',
	'4.4.2.1': 'Radioactive decay',
	'4.4.2.3': 'Nuclear equations',
	'4.4.2.4': 'Half-lives',
	'4.4.3.1': 'Contamination and irradiation',
	'4.4.3.3': 'Uses and hazards of radiation',
	'4.4.4.1': 'Nuclear fission',
	'4.4.4.2': 'Nuclear fusion',
	RPA1: 'Specific heat capacity practical',
	RPA2: 'Thermal insulation practical',
	RPA4: 'Resistance practical'
};

const HIGHER_BOUNDARIES: GradeBoundary[] = [
	{ label: '9', minimum: 78 },
	{ label: '8', minimum: 68 },
	{ label: '7', minimum: 58 },
	{ label: '6', minimum: 48 },
	{ label: '5', minimum: 38 },
	{ label: '4', minimum: 28 }
];

const FOUNDATION_BOUNDARIES: GradeBoundary[] = [
	{ label: '5', minimum: 72 },
	{ label: '4', minimum: 58 },
	{ label: '3', minimum: 44 },
	{ label: '2', minimum: 30 },
	{ label: '1', minimum: 16 }
];

interface ParsedRow {
	id: string;
	questionNumber: string;
	marks: number;
	summary: string;
	specPoint: string | null;
	commandWord: string | null;
	ao: string | null;
}

function entriesOf(rows: ParsedRow[]): BreakdownEntry[] {
	return rows.map((row) => {
		const values = {
			label: row.id,
			questionNumber: row.questionNumber,
			marks: row.marks,
			summary: row.summary,
			specPoint: row.specPoint?.replaceAll(';', ', ') ?? null,
			commandWord: row.commandWord,
			ao: row.ao as AssessmentObjective | null
		};
		return { id: `e-${row.id}`, ...values, original: values };
	});
}

/** Deterministic marks: a share of each entry, wobbling per entry so bands mix. */
function marksFor(entries: BreakdownEntry[], share: number): Record<string, number> {
	return Object.fromEntries(
		entries.map((entry, i) => {
			const wobble = ((i * 37) % 10) / 10 - 0.45;
			const marks = entry.marks ?? 0;
			return [entry.id, Math.max(0, Math.min(marks, Math.round(marks * (share + wobble))))];
		})
	);
}

export interface Scenario {
	caption: string;
	document: MarksheetDocument;
	studentId: string;
	report: StoredReport;
	tierName: string | null;
}

let nextId = 0;

function scenario(options: {
	caption: string;
	rows: ParsedRow[];
	boundaries: GradeBoundary[] | null;
	tierName: string | null;
	label: string;
	className: string;
	first: string;
	surname: string;
	share: number;
	strengths: string[];
	areas: string[];
}): Scenario {
	const id = `stub-${nextId++}`;
	const entries = entriesOf(options.rows);
	const document: MarksheetDocument = {
		schemaVersion: 2,
		createdAt: NOW,
		updatedAt: NOW,
		breakdownConfirmedAt: NOW,
		lastExportedAt: null,
		paper: {
			label: options.label,
			className: options.className,
			sourceFilenames: [],
			parsedAt: NOW,
			boundaries: options.boundaries,
			belowLowestLabel: 'U'
		},
		breakdown: {
			entries,
			warnings: [],
			aoDescriptions: {
				AO1: 'Knowledge and understanding',
				AO2: 'Applying knowledge',
				AO3: 'Analysing and evaluating'
			}
		},
		students: [{ id, firstName: options.first, surname: options.surname, absent: false }],
		marks: { [id]: marksFor(entries, options.share) },
		topicNames: TOPIC_NAMES,
		reports: {}
	};
	const report: StoredReport = {
		strengths: options.strengths,
		areasForImprovement: options.areas,
		edit: null,
		input: generationInputFor(document, id) ?? { paperLabel: '', entries: [] },
		model: 'openai/gpt-6-luna',
		generatedAt: NOW
	};
	document.reports = { [id]: report };
	return { caption: options.caption, document, studentId: id, report, tierName: options.tierName };
}

const HIGHER_PROSE = {
	strengths: [
		'You calculated the resistance of the transmission cable accurately, rearranging P = I²R and showing every step.',
		'Your explanation of why the National Grid uses step-up transformers linked high potential difference to lower current and smaller energy losses.',
		'You described the plum pudding and nuclear models clearly and said which experimental evidence changed the model.'
	],
	areas: [
		'In the specific latent heat question you used the temperature change instead of the mass and energy: when there is no change in temperature, use E = mL.',
		'When you plan the resistance practical, name the independent and dependent variables and say how you would keep the temperature of the wire constant.'
	]
};

const FOUNDATION_PROSE = {
	strengths: [
		'You chose the right equation for efficiency and put the numbers in correctly.',
		'You named the energy stores in the kettle and the car questions without any mistakes.',
		'You read the current and potential difference from the circuit diagram carefully.'
	],
	areas: [
		'Learn the units for energy (J), power (W) and charge (C), and write them after every answer.',
		'In the half-life question, count how many half-lives have passed before you halve the number.'
	]
};

// The full Foundation paper (53 entries) runs over A4 today with or without a
// tier name; the first 40 keep the comparison about the header alone.
const FOUNDATION_ROWS = (foundation as ParsedRow[]).slice(0, 40);

const LABEL = 'AQA GCSE Physics Paper 1 — November mock';

export const SCENARIOS: Scenario[] = [
	scenario({
		caption: 'Two tiers · Higher Tier · grades',
		rows: higher as ParsedRow[],
		boundaries: HIGHER_BOUNDARIES,
		tierName: 'Higher Tier',
		label: LABEL,
		className: '11X2',
		first: 'Maya',
		surname: 'Patel',
		share: 0.6,
		...HIGHER_PROSE
	}),
	scenario({
		caption: 'Two tiers · Foundation Tier · long name, class and label',
		rows: FOUNDATION_ROWS,
		boundaries: FOUNDATION_BOUNDARIES,
		tierName: 'Foundation Tier',
		label: 'AQA GCSE Combined Science Trilogy Physics Paper 1 — Year 11 November mock examination',
		className: '11Y4 Combined Science (Mr Okonkwo-Fitzgerald)',
		first: 'Alexandria',
		surname: 'Okonkwo-Fitzgerald',
		share: 0.55,
		...FOUNDATION_PROSE
	}),
	scenario({
		caption: 'Two tiers · Foundation Tier · no grade boundaries',
		rows: FOUNDATION_ROWS,
		boundaries: null,
		tierName: 'Foundation Tier',
		label: LABEL,
		className: '11X3',
		first: 'Tom',
		surname: 'Hughes',
		share: 0.4,
		...FOUNDATION_PROSE
	}),
	scenario({
		caption: 'Single tier · blank tier name (today)',
		rows: higher as ParsedRow[],
		boundaries: HIGHER_BOUNDARIES,
		tierName: null,
		label: LABEL,
		className: '11X2',
		first: 'Maya',
		surname: 'Patel',
		share: 0.6,
		...HIGHER_PROSE
	})
];
