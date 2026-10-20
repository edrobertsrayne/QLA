// `POST /api/report`'s shared shape: the locked v5 holistic prompt, the
// strict schema, request validation and the local feedback checks.
//
// The prompt and schema are the validated decision from the feedback-prompt
// prototype (locked v5); the checks run server-side only, each with a named
// id the browser retries on. Pure: no I/O, no model calls.

import { assessmentObjectiveOf } from '$lib/parse/assessment-objectives.js';
import { isRecord } from '$lib/parse/is-breakdown.js';
import { facilityBand } from '$lib/marksheet/analysis.js';
import {
	MAX_ENTRIES,
	MAX_LABEL_LENGTH,
	MAX_SUMMARY_LENGTH,
	MAX_TOPICS_PER_ENTRY
} from '$lib/marksheet/report-limits.js';
import { rollupByTopic, type TopicTotals } from '$lib/marksheet/report-rollup.js';
import {
	fail,
	readList,
	readNullableString,
	readRecord,
	readString,
	rejectUnknownKeys
} from './request-fields.js';

/** Model resolves override → env → this default. Not checked against the curated list. */
export const REPORT_DEFAULT_MODEL = 'openai/gpt-6-luna';

/** One entry as the request carries it. */
export interface ReportRequestEntry {
	label: string;
	summary: string;
	commandWord: string | null;
	ao: string | null;
	topics: string[];
	gained: number;
	available: number;
}

/** The validated request: what the server works from. */
export interface ValidReportRequest {
	model?: string;
	paperLabel: string;
	entries: ReportRequestEntry[];
}

/** One failed feedback check, by its id. */
export interface CheckFailure {
	id: string;
	message: string;
}

/** The locked v5 holistic prompt: the model writes feedback from whole-paper marks. */
export const REPORT_SYSTEM_PROMPT = `You write the feedback section of a student's report on a test they have just sat. The student reads it with their marked paper and a question-by-question table of their marks in front of them, so do not repeat that table: your job is to see the patterns in it.

You are given the paper's title, every question on it with its question summary, command word, assessment objective and topic(s) where known, the student's marks on each, and their marks per topic.

Look across the whole paper for what kinds of question, skill or topic the student handles well and where they lose marks: for example multi-step calculations, explaining a process, recalling definitions, graph work, or a particular topic. A theme can span several questions and topics; a single question is only a theme when nothing broader fits. Each theme must be one kind of question or skill the student would recognise: never bundle unrelated questions to fill a slot. Fewer themes is better than a muddled one.

Write:
- "strengths": up to three themes the student did well on. Only use questions where they gained at least two fifths of the marks; prefer full marks.
- "areasForImprovement": up to two themes where the student has the most marks to win back. Only use questions where they dropped at least one mark. If they dropped no marks, return an empty list.
For each theme, list the labels of the questions it is based on in "questions".

The student will not see which questions you based a theme on, so name the kind of question or skill clearly in words.

Each strength: one short sentence, at most 20 words, naming the kind of question or skill and what doing it well shows they can do. Match the praise to the marks.

Each area for improvement: two sentences, at most 40 words in total. First, what that kind of question needs. Second, one concrete revision action the student can do on their own (a specific thing to learn, practise or rewrite), not "revise this topic" or "review the equations". Use your subject knowledge to make the action specific.

Address the student as "you". Plain, warm and direct, like a good teacher's written comment. No gushing, no exclamation marks.

You only have the student's marks, never their answers. Marks tell you whether they got something right, not how. So never describe their answer: not their method, working, clarity, reasoning, detail or explanations, and never "you struggled", "your answer lacked" or "your explanation".

Never:
- write any figures or question labels in the prose: no marks, scores, percentages, grades, counts, question numbers or numbers of any kind. The labels go in "questions" only.
- compare the student to the class, classmates or anyone else.
- name or address anyone by name.
- predict or mention grades or results.`;

/**
 * The strict output schema, with the label enum built from the request: the
 * model can only cite questions it was given.
 */
export function reportSchema(labels: string[]): Record<string, unknown> {
	const theme = (max: number) => ({
		type: 'array',
		maxItems: max,
		items: {
			type: 'object',
			additionalProperties: false,
			required: ['text', 'questions'],
			properties: {
				text: { type: 'string' },
				questions: { type: 'array', items: { type: 'string', enum: labels } }
			}
		}
	});
	return {
		type: 'object',
		additionalProperties: false,
		required: ['strengths', 'areasForImprovement'],
		properties: { strengths: theme(3), areasForImprovement: theme(2) }
	};
}

const KNOWN_KEYS = new Set(['model', 'paperLabel', 'entries']);
const ENTRY_KEYS = new Set([
	'label',
	'summary',
	'commandWord',
	'ao',
	'topics',
	'gained',
	'available'
]);

/**
 * Validate a parsed request body before any model spend. Every rule in the
 * spec; the first one broken throws an `InputError` naming its `field`.
 */
export function validateReportBody(body: unknown): ValidReportRequest {
	const record = readRecord(body, '', 'Not an object.');
	rejectUnknownKeys(record, KNOWN_KEYS, '');

	const model =
		record['model'] === undefined
			? undefined
			: readString(record['model'], 'model', { nonBlank: 'Must be a non-blank string.' });
	const paperLabel = readString(record['paperLabel'], 'paperLabel', { max: MAX_LABEL_LENGTH });
	const rawEntries = readList(record['entries'], 'entries', {
		min: 1,
		max: MAX_ENTRIES,
		notList: `Must be a list of 1–${MAX_ENTRIES} entries.`,
		size: `Must hold 1–${MAX_ENTRIES} entries.`
	});

	const seen = new Set<string>();
	const entries = rawEntries.map((value, index): ReportRequestEntry => {
		const field = `entries[${index}]`;
		const raw = readRecord(value, field);
		rejectUnknownKeys(raw, ENTRY_KEYS, field);
		const label = readString(raw['label'], `${field}.label`, {
			nonBlank: 'Must be a non-blank label.',
			max: MAX_LABEL_LENGTH
		});
		if (seen.has(label)) fail(`${field}.label`, 'Must be unique.');
		seen.add(label);
		const summary = readString(raw['summary'], `${field}.summary`, { max: MAX_SUMMARY_LENGTH });
		const commandWord = readNullableString(
			raw['commandWord'],
			`${field}.commandWord`,
			MAX_LABEL_LENGTH
		);
		const ao = raw['ao'];
		if (ao !== null && (typeof ao !== 'string' || assessmentObjectiveOf(ao) === null))
			fail(`${field}.ao`, 'Must be an assessment objective or null.');
		const topics = readList(raw['topics'], `${field}.topics`, {
			min: 0,
			max: MAX_TOPICS_PER_ENTRY,
			notList: 'Must be a list of topic names.',
			size: `Must hold at most ${MAX_TOPICS_PER_ENTRY} topics.`
		}).map((topic, topicIndex) =>
			readString(topic, `${field}.topics[${topicIndex}]`, {
				nonBlank: 'Must be a non-blank topic name.',
				max: MAX_LABEL_LENGTH
			})
		);
		const available = raw['available'];
		if (typeof available !== 'number' || !Number.isFinite(available) || available <= 0)
			fail(`${field}.available`, 'Must be a positive number of marks.');
		const gained = raw['gained'];
		if (typeof gained !== 'number' || !Number.isFinite(gained))
			fail(`${field}.gained`, 'Must be a number.');
		if (gained < 0 || gained > available)
			fail(`${field}.gained`, 'Must be within 0 to the available marks.');
		return { label, summary, commandWord, ao, topics, gained, available };
	});

	return { ...(model === undefined ? {} : { model }), paperLabel, entries };
}

/** The fenced user payload: paper label, every entry and the topic roll-up. No identifiers. */
export function reportPayload(request: ValidReportRequest): {
	paper: string;
	questions: ReportRequestEntry[];
	topics: TopicTotals[];
} {
	return {
		paper: request.paperLabel,
		questions: request.entries,
		topics: rollupByTopic(request.entries)
	};
}

interface Theme {
	text: string;
	questions: string[];
}

function isTheme(value: unknown): value is Theme {
	return (
		isRecord(value) &&
		typeof value['text'] === 'string' &&
		Array.isArray(value['questions']) &&
		value['questions'].every((question) => typeof question === 'string')
	);
}

/** Links and email addresses: never shown to a student. */
export function hasContactHook(text: string): boolean {
	return text.includes('://') || text.includes('www.') || text.includes('@');
}

/** Whether prose reaches a student: no digits, no contact hooks. */
function proseFailure(text: string): { id: string; message: string } | null {
	if (/\d/.test(text)) return { id: 'no-figures', message: 'Must not contain digits.' };
	if (hasContactHook(text))
		return { id: 'no-contact', message: 'Must not contain links or email addresses.' };
	return null;
}

/**
 * Check parsed model output against the guard-rails: shape and caps, every
 * theme citing a question it was given, no red-band strength, no full-marks
 * area, no question in both sections, areas empty only when nothing was
 * dropped, no digits, no contact hooks. Each failure carries its check id.
 */
export function checkFeedback(
	request: ValidReportRequest,
	output: unknown
): { strengths: string[]; areasForImprovement: string[] } | { failures: CheckFailure[] } {
	const failures: CheckFailure[] = [];
	if (
		!isRecord(output) ||
		!Array.isArray(output['strengths']) ||
		!Array.isArray(output['areasForImprovement']) ||
		!output['strengths'].every(isTheme) ||
		!output['areasForImprovement'].every(isTheme)
	) {
		return { failures: [{ id: 'shape', message: 'Must hold strengths and areasForImprovement.' }] };
	}
	const strengths = output['strengths'] as Theme[];
	const areas = output['areasForImprovement'] as Theme[];
	if (strengths.length > 3)
		failures.push({ id: 'strength-cap', message: 'Must hold at most 3 strengths.' });
	if (areas.length > 2)
		failures.push({ id: 'area-cap', message: 'Must hold at most 2 areas for improvement.' });

	const byLabel = new Map(request.entries.map((entry) => [entry.label, entry]));
	const anyDropped = request.entries.some((entry) => entry.gained < entry.available);
	if (anyDropped && areas.length === 0)
		failures.push({ id: 'areas-required', message: 'Must name an area when marks were dropped.' });

	const inStrength = new Set<string>();
	const inArea = new Set<string>();
	const checkThemes = (kind: 'strength' | 'area', themes: Theme[]) => {
		themes.forEach((theme, index) => {
			const ref = `${kind}-${index + 1}`;
			if (typeof theme.text !== 'string' || theme.text.trim() === '') {
				failures.push({ id: 'shape', message: `${ref} must hold prose.` });
				return;
			}
			if (theme.questions.length === 0)
				failures.push({ id: 'cited-question', message: `${ref} must cite a question.` });
			for (const label of theme.questions) {
				const cited = byLabel.get(label);
				if (!cited) {
					failures.push({ id: 'known-label', message: `${ref} cites an unknown question.` });
					continue;
				}
				if (kind === 'strength') {
					if (facilityBand(cited.gained / cited.available) === 'red')
						failures.push({
							id: 'no-red-strength',
							message: `${ref} must not praise a red-band question.`
						});
					inStrength.add(label);
				} else {
					if (cited.gained === cited.available)
						failures.push({
							id: 'no-full-marks-area',
							message: `${ref} must not target a full-marks question.`
						});
					inArea.add(label);
				}
			}
			const dirty = proseFailure(theme.text);
			if (dirty) failures.push({ id: dirty.id, message: `${ref} ${dirty.message}` });
		});
	};
	checkThemes('strength', strengths);
	checkThemes('area', areas);
	for (const label of inStrength) {
		if (inArea.has(label))
			failures.push({
				id: 'no-shared-question',
				message: 'Must not put one question in both sections.'
			});
	}

	if (failures.length > 0) return { failures };
	return {
		strengths: strengths.map((theme) => theme.text),
		areasForImprovement: areas.map((theme) => theme.text)
	};
}
