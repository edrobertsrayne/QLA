// Shared shape for `POST /api/topic-names`: the prompt, strict schema,
// request validation and local name checks. Pure: no I/O, no model calls.
//
// Mirrors `report.ts` deliberately rather than abstracting over it: two
// call sites is not a shared validation framework, and the two routes answer
// with different codes and fields.

/** Model resolves override → env → this default. Not checked against the curated list. */
export const TOPIC_NAMES_DEFAULT_MODEL = 'openai/gpt-6-luna';

/** Bodies over this size are refused before parsing. */
export const TOPIC_NAMES_MAX_BODY_BYTES = 256 * 1024;

/** One code needing a name: the normalised code and the summaries carrying it. */
export interface TopicNameRequest {
	code: string;
	summaries: string[];
}

/** The validated request: what the server works from. */
export interface ValidTopicNameRequest {
	model?: string;
	paperLabel: string;
	codes: TopicNameRequest[];
}

/** A validation failure: the `field` path the 400 names. */
export interface TopicNameInputProblem {
	field: string;
	message: string;
}

/** The style the model writes: short student-readable topic names. */
export const TOPIC_NAMES_SYSTEM_PROMPT = `You name specification topics for a student's report on a test they have just sat. Each name appears beside the student's marks for that topic, so write for the student: plain words they know from class, never a bare syllabus code. One name per code, three to eight words.`;

/**
 * The strict output schema: a list of `{ code, name }` pairs. Bare JSON
 * Schema, since the transport wraps it in the `json_schema` response format.
 */
export function topicNamesSchema(): Record<string, unknown> {
	return {
		type: 'object',
		properties: {
			names: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						code: { type: 'string' },
						name: { type: 'string' }
					},
					required: ['code', 'name'],
					additionalProperties: false
				}
			}
		},
		required: ['names'],
		additionalProperties: false
	};
}

const KNOWN_KEYS = new Set(['model', 'paperLabel', 'codes']);

/**
 * Validate a parsed request body before any model spend. Returns the problems
 * (empty when valid) rather than throwing, so the route answers them all at once.
 */
export function validateTopicNamesBody(body: unknown): {
	request: ValidTopicNameRequest | null;
	problems: TopicNameInputProblem[];
} {
	const problems: TopicNameInputProblem[] = [];
	if (body === null || typeof body !== 'object' || Array.isArray(body))
		return { request: null, problems: [{ field: '', message: 'Not an object.' }] };
	for (const key of Object.keys(body)) {
		if (!KNOWN_KEYS.has(key)) problems.push({ field: key, message: 'Unknown key.' });
	}
	const record = body as Record<string, unknown>;

	let model: string | undefined;
	if (record['model'] !== undefined) {
		if (typeof record['model'] !== 'string' || record['model'].trim() === '') {
			problems.push({ field: 'model', message: 'Must be a non-blank string.' });
		} else model = record['model'];
	}

	let paperLabel = '';
	if (typeof record['paperLabel'] !== 'string') {
		problems.push({ field: 'paperLabel', message: 'Must be a string.' });
	} else if (record['paperLabel'].length > 120) {
		problems.push({ field: 'paperLabel', message: 'Must be at most 120 characters.' });
	} else {
		paperLabel = record['paperLabel'];
	}

	const codes: TopicNameRequest[] = [];
	const rawCodes = record['codes'];
	if (!Array.isArray(rawCodes)) {
		problems.push({ field: 'codes', message: 'Must be a list of 1–200 codes.' });
	} else if (rawCodes.length < 1 || rawCodes.length > 200) {
		problems.push({ field: 'codes', message: 'Must hold 1–200 codes.' });
	} else {
		const seen = new Set<string>();
		rawCodes.forEach((raw, index) => {
			const field = `codes[${index}]`;
			if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
				problems.push({ field, message: 'Must be an object.' });
				return;
			}
			const entry = raw as Record<string, unknown>;
			for (const key of Object.keys(entry)) {
				if (key !== 'code' && key !== 'summaries')
					problems.push({ field: `${field}.${key}`, message: 'Unknown key.' });
			}
			let code = '';
			if (typeof entry['code'] !== 'string' || entry['code'].trim() === '') {
				problems.push({ field: `${field}.code`, message: 'Must be a non-blank code.' });
			} else if (entry['code'].length > 120) {
				problems.push({ field: `${field}.code`, message: 'Must be at most 120 characters.' });
			} else {
				code = entry['code'];
				if (seen.has(code)) problems.push({ field: `${field}.code`, message: 'Must be unique.' });
				seen.add(code);
			}
			let summaries: string[] = [];
			if (!Array.isArray(entry['summaries'])) {
				problems.push({ field: `${field}.summaries`, message: 'Must be a list of summaries.' });
			} else if (entry['summaries'].length < 1 || entry['summaries'].length > 200) {
				problems.push({ field: `${field}.summaries`, message: 'Must hold 1–200 summaries.' });
			} else {
				let ok = true;
				for (const [summaryIndex, summary] of entry['summaries'].entries()) {
					if (typeof summary !== 'string') {
						problems.push({
							field: `${field}.summaries[${summaryIndex}]`,
							message: 'Must be a string.'
						});
						ok = false;
					} else if (summary.length > 300) {
						problems.push({
							field: `${field}.summaries[${summaryIndex}]`,
							message: 'Must be at most 300 characters.'
						});
						ok = false;
					}
				}
				if (ok) summaries = entry['summaries'] as string[];
			}
			const entryProblems = problems.filter((problem) => problem.field.startsWith(field));
			if (entryProblems.length === 0) {
				codes.push({ code, summaries });
			}
		});
	}

	if (problems.length > 0) return { request: null, problems };
	return { request: { ...(model === undefined ? {} : { model }), paperLabel, codes }, problems };
}

/**
 * Whether a proposed name may reach a printed page: non-blank, at most 120
 * characters, with no link or email address (`no-contact`).
 */
export function topicNameIsUsable(name: unknown): boolean {
	if (typeof name !== 'string') return false;
	const trimmed = name.trim();
	if (trimmed === '' || name.length > 120) return false;
	if (trimmed.includes('://') || trimmed.includes('www.') || trimmed.includes('@')) return false;
	return true;
}

/**
 * Keep only the usable names for codes the request asked for. A code that was
 * never asked for is ignored; a blank, over-long or contact name is dropped,
 * leaving a gap for the teacher to fill.
 */
export function usableTopicNames(
	request: ValidTopicNameRequest,
	output: unknown
): Record<string, string> {
	const names: Record<string, string> = {};
	if (output === null || typeof output !== 'object' || Array.isArray(output)) return names;
	const list = (output as Record<string, unknown>)['names'];
	if (!Array.isArray(list)) return names;
	const wanted = new Set(request.codes.map((entry) => entry.code));
	for (const raw of list) {
		if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue;
		const row = raw as Record<string, unknown>;
		if (typeof row['code'] !== 'string' || !wanted.has(row['code'])) continue;
		if (!(row['code'] in names) && topicNameIsUsable(row['name'])) {
			names[row['code']] = row['name'] as string;
		}
	}
	return names;
}
