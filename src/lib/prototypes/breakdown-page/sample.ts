// PROTOTYPE — throwaway sample parse result for the breakdown page prototype (wayfinder #29).
// Shape mirrors src/lib/server/parse/schema.ts (ParseResponse). Deliberately messy: null marks,
// a missed subquestion (5c), a questionNumber fallback (7bii), parse warnings.

import type {
	AssessmentObjective,
	ParseResponse,
	ParseQuestion
} from '$lib/server/parse/schema.js';

type Row = [
	id: string,
	questionNumber: string,
	marks: number | null,
	summary: string,
	specPoint: string | null,
	commandWord: string | null,
	ao: AssessmentObjective | null
];

const MESSY: Row[] = [
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
	['4c', '4', null, 'Calculate rate of reaction', null, 'Calculate', 'AO2'],
	['4d', '4', 2, 'Suggest improvement to method', null, 'Suggest', 'AO3'],
	['5a', '5', 2, 'Describe role of insulin', '4.5.3.2', 'Describe', 'AO1'],
	['5b', '5', 3, 'Compare type 1 and type 2 diabetes', '4.5.3.2', 'Compare', 'AO1'],
	// 5c (4 marks, "Explain negative feedback in glucose control") missed by the model.
	['6', '6', 4, 'Explain reflex arc pathway', '4.5.2.1', 'Explain', 'AO1'],
	['7a', '7', 1, 'State where FSH is produced', '4.5.3.4', 'State', 'AO1'],
	['7bi', '7', 2, 'Describe role of oestrogen', '4.5.3.4', 'Describe', 'AO1'],
	['7bii', '7bii', 2, 'Explain how contraceptive pill works', '4.5.3.5', 'Explain', 'AO2'],
	['7c', '7', 4, 'Evaluate hormonal and barrier methods', '4.5.3.5', 'Evaluate', 'AO3'],
	['8a', '8', 1, 'Define the term allele', '4.6.1.4', 'Define', 'AO1'],
	['8b', '8', null, 'Complete Punnett square for cross', '4.6.1.4', 'Complete', 'AO2'],
	['8c', '8', 2, 'Calculate probability of offspring', '4.6.1.4', 'Calculate', 'AO2'],
	['9a', '9', 2, 'Describe evidence for evolution', '4.6.3.3', 'Describe', 'AO1'],
	['9b', '9', 3, 'Interpret fossil record diagram', '4.6.3.3', 'Interpret', null],
	['9c', '9', 4, 'Explain antibiotic resistance development', '4.6.3.5', 'Explain', 'AO2'],
	['10a', '10', 2, 'Name two abiotic factors', '4.7.1.2', 'Name', 'AO1'],
	['10b', '10', 3, 'Calculate population estimate from quadrats', '4.7.2.1', 'Calculate', 'AO2'],
	['11', '11', 6, 'Evaluate methods of reducing deforestation', '4.7.3.4', 'Evaluate', 'AO3'],
	['12a', '12', 1, 'State one use of genetic engineering', '4.6.2.4', 'State', 'AO1'],
	['12b', '12', 2, 'Describe steps in producing insulin', '4.6.2.4', 'Describe', 'AO1'],
	['12ci', '12', null, 'Give one benefit of GM crops', '4.6.2.4', 'Give', 'AO1'],
	['12cii', '12', 3, 'Discuss ethical concerns of GM crops', '4.6.2.4', 'Discuss', 'AO3']
];

/** What the paper's cover actually prints — including the missed 5c and the three null entries. */
// 76 known + nulls (4c=3, 8b=2, 12ci=1) + missed 5c (4).
export const MESSY_PRINTED_TOTAL = 86;

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

function toQuestions(rows: Row[]): ParseQuestion[] {
	return rows.map(([id, questionNumber, marks, summary, specPoint, commandWord, ao]) => ({
		id,
		questionNumber,
		marks,
		summary,
		specPoint,
		commandWord,
		ao
	}));
}

export type SampleKey = 'messy' | 'long' | 'clean';

export const SAMPLES: { key: SampleKey; label: string }[] = [
	{ key: 'messy', label: '32 entries, messy' },
	{ key: 'long', label: '40 entries, messy' },
	{ key: 'clean', label: '32 entries, clean' }
];

export function makeSample(key: SampleKey): ParseResponse & { printedTotal: number } {
	const usage = {
		promptTokens: 48210,
		completionTokens: 3120,
		totalTokens: 51330,
		estCost: 0.0061
	};
	if (key === 'clean') {
		const questions = toQuestions(MESSY).map((q) => ({
			...q,
			questionNumber: q.id.match(/^\d+/)?.[0] ?? q.id,
			marks: q.marks ?? 2,
			ao: q.ao ?? 'AO2'
		}));
		return {
			breakdown: { questions },
			warnings: [],
			usage,
			printedTotal: questions.reduce((s, q) => s + (q.marks ?? 0), 0)
		};
	}
	const rows = key === 'long' ? [...MESSY, ...EXTRA] : MESSY;
	const extraTotal = key === 'long' ? EXTRA.reduce((s, r) => s + (r[2] ?? 0), 0) : 0;
	return {
		breakdown: { questions: toQuestions(rows) },
		warnings: [
			{
				questionId: '4c',
				code: 'INVALID_MARKS',
				message: "Question '4c' marks must be a positive integer or null."
			},
			{
				questionId: '7bii',
				code: 'MISSING_QUESTION_NUMBER',
				message: "Question '7bii' has no questionNumber; fell back to its id."
			},
			{
				questionId: '9b',
				code: 'DIAGRAM_UNVERIFIED',
				message: 'Question 9b refers to a diagram the model could not read.'
			},
			{
				questionId: null,
				code: 'DIAGRAM_UNVERIFIED',
				message: 'Pages 11–12 are mostly images; entries from those pages may be incomplete.'
			}
		],
		usage,
		printedTotal: MESSY_PRINTED_TOTAL + extraTotal
	};
}
