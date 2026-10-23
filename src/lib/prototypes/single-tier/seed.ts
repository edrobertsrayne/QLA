// PROTOTYPE (#118) — throwaway. A version 2 document for AQA 8463 Paper 1 Higher
// alone, so "today's page" variants render the same single-tier assessment the
// stubbed two-tier designs show with one tier. Loaded into an in-memory store by
// `marksheetStore()` whenever the URL carries `?variant=`; localStorage is never read or written.
import higher from '../two-tier-review/8463-1H.json';
import { DOCUMENT_SCHEMA_VERSION, STORAGE_KEY } from '$lib/marksheet/document.js';
import type {
	BreakdownEntry,
	EntryValues,
	MarksheetDocument,
	StoredStudent
} from '$lib/marksheet/document.js';
import type { DocumentStorage } from '$lib/marksheet/persistence.svelte.js';

type RawEntry = {
	id: string;
	questionNumber: string;
	marks: number | null;
	summary: string;
	specPoint: string | null;
	commandWord: string | null;
	ao: string | null;
};

const NOW = '2026-10-23T09:00:00.000Z';

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

function entries(): BreakdownEntry[] {
	return (higher as RawEntry[]).map((raw) => {
		const values: EntryValues = {
			label: raw.id,
			questionNumber: raw.questionNumber,
			marks: raw.marks,
			summary: raw.summary,
			specPoint: raw.specPoint,
			commandWord: raw.commandWord,
			ao: raw.ao as EntryValues['ao']
		};
		return { id: `t1-${raw.id}`, ...values, original: { ...values } };
	});
}

function students(): StoredStudent[] {
	return NAMES.map((name, i) => {
		const [firstName, surname] = name.split(' ');
		return { id: `s${i}`, firstName, surname, absent: i === 9 };
	});
}

/** Plausible marks: each entry has a difficulty, each student an ability. */
function marks(list: BreakdownEntry[], people: StoredStudent[]) {
	const out: Record<string, Record<string, number>> = {};
	people.forEach((student, i) => {
		if (student.absent) return;
		const r = rng(i + 1);
		const ability = 0.55 + (i % 7) * 0.06;
		const row: Record<string, number> = {};
		list.forEach((entry, k) => {
			const difficulty = ((k * 37) % 11) / 11;
			const p = Math.min(0.97, Math.max(0.03, ability - difficulty * 0.6 + (r() - 0.5) * 0.4));
			let m = 0;
			for (let n = 0; n < (entry.marks ?? 1); n++) if (r() < p) m++;
			row[entry.id] = m;
		});
		out[student.id] = row;
	});
	return out;
}

/** Under review on `/breakdown`, confirmed and fully marked everywhere else. */
export function singleTierDocument(pathname: string): MarksheetDocument {
	const list = entries();
	const underReview = pathname.startsWith('/breakdown');
	const people = underReview ? [] : students();
	return {
		schemaVersion: DOCUMENT_SCHEMA_VERSION,
		createdAt: NOW,
		updatedAt: NOW,
		breakdownConfirmedAt: underReview ? null : NOW,
		lastExportedAt: NOW,
		paper: {
			label: '8463 Paper 1 June 2024',
			className: '11X/Ph1',
			sourceFilenames: ['8463-1H-QP-JUN24.pdf', '8463-1H-MS-JUN24.pdf'],
			parsedAt: NOW,
			boundaries: underReview
				? null
				: [
						{ label: '9', minimum: 71 },
						{ label: '8', minimum: 62 },
						{ label: '7', minimum: 53 },
						{ label: '6', minimum: 42 },
						{ label: '5', minimum: 31 },
						{ label: '4', minimum: 20 }
					],
			belowLowestLabel: 'U'
		},
		breakdown: {
			entries: list,
			warnings: [],
			aoDescriptions: {
				AO1: 'Remember and understand ideas and methods',
				AO2: 'Apply ideas and methods',
				AO3: 'Analyse, interpret and evaluate'
			}
		},
		students: people,
		marks: underReview ? {} : marks(list, people),
		topicNames: {},
		reports: {}
	};
}

/** An in-memory storage holding the prototype document: nothing reaches the browser's own. */
export function prototypeStorage(pathname: string): DocumentStorage {
	const items = new Map<string, string>([
		[STORAGE_KEY, JSON.stringify(singleTierDocument(pathname))]
	]);
	return {
		get length() {
			return items.size;
		},
		key: (index) => [...items.keys()][index] ?? null,
		getItem: (key) => items.get(key) ?? null,
		setItem: (key, value) => void items.set(key, value),
		removeItem: (key) => void items.delete(key)
	};
}
