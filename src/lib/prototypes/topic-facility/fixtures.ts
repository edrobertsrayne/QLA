// PROTOTYPE (#159) — the marksheet documents the topic-facility variants read.
// Throwaway: hand-built documents shaped exactly like the stored ones, so every
// figure in the prototype is real arithmetic over real document data. Nothing
// is stored and nothing here reaches main.
//
// Between them the three assessments carry every case the brief lists: a
// single-tier and a two-tier assessment; a part-marked class, one fully marked
// and one with nothing marked; a topic carried by one entry and by several; an
// entry carrying two specification points; an entry with no specification point
// (AO only); and a topic with no topic name yet.

import type {
	BreakdownEntry,
	MarksheetDocument,
	StoredStudent,
	StoredTier
} from '$lib/marksheet/document.js';
import { DOCUMENT_SCHEMA_VERSION } from '$lib/marksheet/document.js';

const NOW = '2026-10-27T09:00:00.000Z';

function entry(
	id: string,
	label: string,
	marks: number,
	specPoint: string | null,
	ao: BreakdownEntry['ao'],
	summary: string
): BreakdownEntry {
	const built = {
		id,
		label,
		questionNumber: label.replace(/[a-z]+$/, ''),
		marks,
		summary,
		specPoint,
		commandWord: 'Describe',
		ao,
		original: null
	};
	return built;
}

function tier(tierName: string | null, entries: BreakdownEntry[]): StoredTier {
	return {
		tierName,
		sourceFilenames: ['paper.pdf'],
		parsedAt: NOW,
		breakdown: { entries, warnings: [] },
		boundaries: null,
		belowLowestLabel: 'U'
	};
}

function student(id: string, name: string, tierIndex: 0 | 1 | null): StoredStudent {
	const [firstName, surname] = name.split(' ');
	return { id, firstName, surname, absent: false, tier: tierIndex };
}

function document(overrides: Partial<MarksheetDocument>): MarksheetDocument {
	return {
		schemaVersion: DOCUMENT_SCHEMA_VERSION,
		createdAt: NOW,
		updatedAt: NOW,
		breakdownConfirmedAt: NOW,
		lastExportedAt: null,
		firstUnbackedChangeAt: null,
		label: 'Paper',
		className: null,
		aoDescriptions: {},
		tiers: [],
		students: [],
		marks: {},
		commonQuestions: [],
		topicNames: {},
		reports: {},
		...overrides
	};
}

/** One tier, six students, every cell marked: the fully marked class. */
const singleTier = document({
	label: '8461 Chemistry Paper 1',
	className: '10 Set 1',
	tiers: [
		tier(null, [
			entry('e1', '1a', 4, '3.2.1.4', 'AO1', 'Explain how temperature affects the rate'),
			entry('e2', '2b', 6, '3.2.1.4', 'AO2', 'Interpret the rate graph'),
			entry('e3', '3a', 3, '4.1', 'AO1', 'Describe the structure of an atom'),
			entry('e4', '4c', 6, '5.2, 5.3', 'AO2', 'Evaluate the titration method'),
			entry('e5', '5a', 4, null, 'AO3', 'Evaluate the student’s method'),
			entry('e6', '6b', 3, '6.3', 'AO1', 'Explain electrolysis of molten lead bromide'),
			entry('e7', '7a', 4, '5.2', 'AO2', 'Calculate the concentration')
		])
	],
	students: [
		student('s1', 'Amara Osei', 0),
		student('s2', 'Ben Carter', 0),
		student('s3', 'Chloe Dunn', 0),
		student('s4', 'Dev Patel', 0),
		student('s5', 'Ella Shaw', 0),
		student('s6', 'Finn Gray', 0)
	],
	marks: {
		s1: { e1: 2, e2: 2, e3: 2, e4: 6, e5: 3, e6: 1, e7: 1 },
		s2: { e1: 1, e2: 3, e3: 3, e4: 5, e5: 4, e6: 2, e7: 0 },
		s3: { e1: 3, e2: 1, e3: 3, e4: 6, e5: 2, e6: 1, e7: 2 },
		s4: { e1: 2, e2: 2, e3: 2, e4: 4, e5: 3, e6: 2, e7: 1 },
		s5: { e1: 1, e2: 2, e3: 3, e4: 5, e5: 3, e6: 1, e7: 1 },
		s6: { e1: 2, e2: 2, e3: 3, e4: 6, e5: 2, e6: 2, e7: 0 }
	},
	topicNames: {
		'3.2.1.4': 'Rates of reaction',
		'4.1': 'Atomic structure',
		'5.2': 'Neutralisation',
		'5.3': 'Titration',
		'7.1': 'Electrolysis'
	}
});

/** Two tiers, some cells unmarked and one entry nothing marked: the part-marked class. */
const twoTier = document({
	label: '8463 Science Paper 1',
	className: '11 Set 2',
	tiers: [
		tier('Foundation', [
			entry('f1', 'F08.1', 4, '3.2.1.4', 'AO1', 'Explain how temperature affects the rate'),
			entry('f2', 'F09.2', 4, null, 'AO3', 'Evaluate the student’s method'),
			entry('f3', 'F10.3', 5, '7.1', 'AO2', 'Describe electrolysis of molten lead bromide')
		]),
		tier('Higher', [
			entry('h1', 'H01.1', 4, '3.2.1.4', 'AO1', 'Explain how temperature affects the rate'),
			entry('h2', 'H03.2', 6, '4.1', 'AO2', 'Interpret the rate graph'),
			entry('h3', 'H04.1', 6, '5.2, 5.3', 'AO2', 'Evaluate the titration method'),
			entry('h4', 'H05.2', 3, '6.3', 'AO1', 'Explain electrolysis of molten lead bromide'),
			entry('h5', 'H06.1', 4, '5.2', 'AO2', 'Calculate the concentration')
		])
	],
	students: [
		student('s11', 'Grace Liu', 0),
		student('s12', 'Harry Moss', 0),
		student('s13', 'Isla Reid', 0),
		student('s14', 'Jonah Webb', 0),
		student('s21', 'Kofi Adu', 1),
		student('s22', 'Lena Fox', 1),
		student('s23', 'Mia Hall', 1),
		student('s24', 'Noor Khan', 1)
	],
	marks: {
		// F08.1 is marked for half the class only.
		s11: { f1: 2, f2: 3 },
		s12: { f1: 1 },
		s13: { f2: 2 },
		// F10.3 has no mark from anyone.
		s21: { h1: 3, h2: 2, h3: 6, h4: 1, h5: 1 },
		s22: { h1: 2, h2: 3, h3: 4, h4: 2, h5: 2 },
		s23: { h1: 3, h2: 4, h3: 5, h5: 0 },
		s24: { h1: 4, h2: 2, h3: 3, h5: 1 }
	},
	commonQuestions: [{ tier1EntryId: 'f1', tier2EntryId: 'h1' }],
	topicNames: {
		'3.2.1.4': 'Rates of reaction',
		'4.1': 'Atomic structure',
		'5.2': 'Neutralisation',
		'5.3': 'Titration',
		'7.1': 'Electrolysis'
	}
});

/** One tier, nobody marked: every topic has no figure at all. */
const nothingMarked = document({
	label: '8461 Chemistry Paper 2',
	className: '10 Set 1',
	tiers: [
		tier(null, [
			entry('n1', '1a', 4, '3.2.1.4', 'AO1', 'Explain how temperature affects the rate'),
			entry('n2', '2b', 6, '3.2.1.4', 'AO2', 'Interpret the rate graph'),
			entry('n3', '3a', 4, null, 'AO3', 'Evaluate the student’s method')
		])
	],
	students: [
		student('s1', 'Amara Osei', 0),
		student('s2', 'Ben Carter', 0),
		student('s3', 'Chloe Dunn', 0)
	],
	marks: {},
	topicNames: { '3.2.1.4': 'Rates of reaction' }
});

export interface PrototypeFixture {
	key: string;
	label: string;
	/** What this assessment exists to show, in the teacher's words. */
	note: string;
	document: MarksheetDocument;
}

export const FIXTURES: PrototypeFixture[] = [
	{
		key: 'single',
		label: 'Single tier · fully marked',
		note: 'One paper, six students, every cell marked. Rates of reaction on two questions; Neutralisation split across one question carrying two spec points and one carrying one; an objectives-only question; a topic with no topic name yet (6.3).',
		document: singleTier
	},
	{
		key: 'two',
		label: 'Two tiers · part-marked',
		note: 'Foundation and Higher, eight students, some cells unmarked. Rates of reaction sits on both tiers (and is the common question); Higher alone carries Atomic structure; F10.3 has nothing marked at all.',
		document: twoTier
	},
	{
		key: 'empty',
		label: 'Nothing marked',
		note: 'One paper, nobody marked yet: every topic has no figure and must not read as a score.',
		document: nothingMarked
	}
];
