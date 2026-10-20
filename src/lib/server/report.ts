// `POST /api/report`'s shared shape: the locked v5 holistic prompt, the
// strict schema, request validation and the local feedback checks.
//
// The prompt and schema are the validated decision from the feedback-prompt
// prototype (locked v5); the checks run server-side only, each with a named
// id the browser retries on. Pure: no I/O, no model calls.

import { assessmentObjectiveOf } from '$lib/parse/assessment-objectives.js';
import { isRecord } from '$lib/parse/is-breakdown.js';
import { facilityBand } from '$lib/marksheet/analysis.js';
import { MAX_LABEL_LENGTH, MAX_SUMMARY_LENGTH } from '$lib/marksheet/report-limits.js';

/** Model resolves override → env → this default. Not checked against the curated list. */
export const REPORT_DEFAULT_MODEL = 'openai/gpt-6-luna';

/** Bodies over this size are refused before parsing. */
export const REPORT_MAX_BODY_BYTES = 256 * 1024;

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

/** A validation failure: the `field` path the 400 names. */
export interface InputProblem {
	field: string;
	message: string;
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
 * spec, each with the `field` path the 400 names. Returns the problems (empty
 * when valid) rather than throwing, so the route answers them all at once.
 */
export function validateReportBody(body: unknown): {
	request: ValidReportRequest | null;
	problems: InputProblem[];
} {
	const problems: InputProblem[] = [];
	if (!isRecord(body))
		return { request: null, problems: [{ field: '', message: 'Not an object.' }] };
	for (const key of Object.keys(body)) {
		if (!KNOWN_KEYS.has(key)) problems.push({ field: key, message: 'Unknown key.' });
	}

	let model: string | undefined;
	if (body['model'] !== undefined) {
		if (typeof body['model'] !== 'string' || body['model'].trim() === '') {
			problems.push({ field: 'model', message: 'Must be a non-blank string.' });
		} else model = body['model'];
	}

	let paperLabel = '';
	if (typeof body['paperLabel'] !== 'string') {
		problems.push({ field: 'paperLabel', message: 'Must be a string.' });
	} else if (body['paperLabel'].length > MAX_LABEL_LENGTH) {
		problems.push({
			field: 'paperLabel',
			message: `Must be at most ${MAX_LABEL_LENGTH} characters.`
		});
	} else {
		paperLabel = body['paperLabel'];
	}

	const entries: ReportRequestEntry[] = [];
	const rawEntries = body['entries'];
	if (!Array.isArray(rawEntries)) {
		problems.push({ field: 'entries', message: 'Must be a list of 1–200 entries.' });
	} else if (rawEntries.length < 1 || rawEntries.length > 200) {
		problems.push({ field: 'entries', message: 'Must hold 1–200 entries.' });
	} else {
		const seen = new Set<string>();
		rawEntries.forEach((raw, index) => {
			const field = `entries[${index}]`;
			if (!isRecord(raw)) {
				problems.push({ field, message: 'Must be an object.' });
				return;
			}
			for (const key of Object.keys(raw)) {
				if (!ENTRY_KEYS.has(key))
					problems.push({ field: `${field}.${key}`, message: 'Unknown key.' });
			}
			let label = '';
			if (typeof raw['label'] !== 'string' || raw['label'].trim() === '') {
				problems.push({ field: `${field}.label`, message: 'Must be a non-blank label.' });
			} else if (raw['label'].length > MAX_LABEL_LENGTH) {
				problems.push({
					field: `${field}.label`,
					message: `Must be at most ${MAX_LABEL_LENGTH} characters.`
				});
			} else {
				label = raw['label'];
				if (seen.has(label)) problems.push({ field: `${field}.label`, message: 'Must be unique.' });
				seen.add(label);
			}
			let summary = '';
			if (typeof raw['summary'] !== 'string') {
				problems.push({ field: `${field}.summary`, message: 'Must be a string.' });
			} else if (raw['summary'].length > MAX_SUMMARY_LENGTH) {
				problems.push({
					field: `${field}.summary`,
					message: `Must be at most ${MAX_SUMMARY_LENGTH} characters.`
				});
			} else {
				summary = raw['summary'];
			}
			let commandWord: string | null = null;
			if (raw['commandWord'] === undefined || raw['commandWord'] === null) {
				if (raw['commandWord'] === undefined)
					problems.push({ field: `${field}.commandWord`, message: 'Must be a string or null.' });
			} else if (typeof raw['commandWord'] !== 'string') {
				problems.push({ field: `${field}.commandWord`, message: 'Must be a string or null.' });
			} else if (raw['commandWord'].length > MAX_LABEL_LENGTH) {
				problems.push({
					field: `${field}.commandWord`,
					message: `Must be at most ${MAX_LABEL_LENGTH} characters.`
				});
			} else {
				commandWord = raw['commandWord'];
			}
			let ao: string | null = null;
			if (raw['ao'] === undefined || raw['ao'] === null) {
				if (raw['ao'] === undefined)
					problems.push({
						field: `${field}.ao`,
						message: 'Must be an assessment objective or null.'
					});
			} else if (typeof raw['ao'] !== 'string' || assessmentObjectiveOf(raw['ao']) === null) {
				problems.push({
					field: `${field}.ao`,
					message: 'Must be an assessment objective or null.'
				});
			} else {
				ao = raw['ao'];
			}
			let topics: string[] = [];
			if (!Array.isArray(raw['topics'])) {
				problems.push({ field: `${field}.topics`, message: 'Must be a list of topic names.' });
			} else if (raw['topics'].length > 10) {
				problems.push({ field: `${field}.topics`, message: 'Must hold at most 10 topics.' });
			} else {
				let ok = true;
				for (const [topicIndex, topic] of raw['topics'].entries()) {
					if (typeof topic !== 'string' || topic.trim() === '') {
						problems.push({
							field: `${field}.topics[${topicIndex}]`,
							message: 'Must be a non-blank topic name.'
						});
						ok = false;
					} else if (topic.length > MAX_LABEL_LENGTH) {
						problems.push({
							field: `${field}.topics[${topicIndex}]`,
							message: `Must be at most ${MAX_LABEL_LENGTH} characters.`
						});
						ok = false;
					}
				}
				if (ok) topics = raw['topics'] as string[];
			}
			let available = 0;
			let availableOk = false;
			if (
				typeof raw['available'] !== 'number' ||
				!Number.isFinite(raw['available']) ||
				raw['available'] <= 0
			) {
				problems.push({
					field: `${field}.available`,
					message: 'Must be a positive number of marks.'
				});
			} else {
				available = raw['available'];
				availableOk = true;
			}
			let gained = 0;
			let gainedOk = false;
			if (typeof raw['gained'] !== 'number' || !Number.isFinite(raw['gained'])) {
				problems.push({ field: `${field}.gained`, message: 'Must be a number.' });
			} else {
				gained = raw['gained'];
				gainedOk = true;
			}
			if (availableOk && gainedOk && (gained < 0 || gained > available)) {
				problems.push({
					field: `${field}.gained`,
					message: 'Must be within 0 to the available marks.'
				});
			}
			const entryProblems = problems.filter((problem) => problem.field.startsWith(field));
			if (entryProblems.length === 0) {
				entries.push({ label, summary, commandWord, ao, topics, gained, available });
			}
		});
	}

	if (problems.length > 0) return { request: null, problems };
	return { request: { ...(model === undefined ? {} : { model }), paperLabel, entries }, problems };
}

/** One topic roll-up row the model receives, calculated locally. */
export interface TopicRollup {
	name: string;
	gained: number;
	available: number;
}

/** The topic roll-up for a validated request: entries with no topic count nowhere. */
export function topicRollup(entries: readonly ReportRequestEntry[]): TopicRollup[] {
	const totals = new Map<string, { gained: number; available: number }>();
	for (const entry of entries) {
		for (const topic of entry.topics) {
			const row = totals.get(topic) ?? { gained: 0, available: 0 };
			row.gained += entry.gained;
			row.available += entry.available;
			totals.set(topic, row);
		}
	}
	return [...totals].map(([name, value]) => ({ name, ...value }));
}

/** The fenced user payload: paper label, every entry and the topic roll-up. No identifiers. */
export function reportPayload(request: ValidReportRequest): {
	paper: string;
	questions: ReportRequestEntry[];
	topics: TopicRollup[];
} {
	return {
		paper: request.paperLabel,
		questions: request.entries,
		topics: topicRollup(request.entries)
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

/** Whether prose reaches a student: no digits, no contact hooks. */
export function proseIsClean(text: string): { id: string; message: string } | null {
	if (/\S*\d\S*/.test(text)) return { id: 'no-figures', message: 'Must not contain digits.' };
	if (text.includes('://') || text.includes('www.') || text.includes('@'))
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
			const dirty = proseIsClean(theme.text);
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
