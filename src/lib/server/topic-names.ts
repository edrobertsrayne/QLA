// Shared shape for `POST /api/topic-names`: the prompt, strict schema,
// request validation and local name checks. Pure: no I/O, no model calls.
//

// call sites is not a shared validation framework, and the two routes answer
// with different codes and fields.

import {
	MAX_CODES,
	MAX_LABEL_LENGTH,
	MAX_SUMMARIES_PER_CODE,
	MAX_SUMMARY_LENGTH
} from '$lib/marksheet/report-limits.js';
import { hasContactHook } from './report.js';
import { fail, readList, readRecord, readString, rejectUnknownKeys } from './request-fields.js';

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
const ENTRY_KEYS = new Set(['code', 'summaries']);

/**
 * Validate a parsed request body before any model spend; the first rule
 * broken throws an `InputError` naming its `field`.
 */
export function validateTopicNamesBody(body: unknown): ValidTopicNameRequest {
	const record = readRecord(body, '', 'Not an object.');
	rejectUnknownKeys(record, KNOWN_KEYS, '');

	const model =
		record['model'] === undefined
			? undefined
			: readString(record['model'], 'model', { nonBlank: 'Must be a non-blank string.' });
	const paperLabel = readString(record['paperLabel'], 'paperLabel', { max: MAX_LABEL_LENGTH });
	const rawCodes = readList(record['codes'], 'codes', {
		min: 1,
		max: MAX_CODES,
		notList: `Must be a list of 1–${MAX_CODES} codes.`,
		size: `Must hold 1–${MAX_CODES} codes.`
	});

	const seen = new Set<string>();
	const codes = rawCodes.map((value, index): TopicNameRequest => {
		const field = `codes[${index}]`;
		const entry = readRecord(value, field);
		rejectUnknownKeys(entry, ENTRY_KEYS, field);
		const code = readString(entry['code'], `${field}.code`, {
			nonBlank: 'Must be a non-blank code.',
			max: MAX_LABEL_LENGTH
		});
		if (seen.has(code)) fail(`${field}.code`, 'Must be unique.');
		seen.add(code);
		const summaries = readList(entry['summaries'], `${field}.summaries`, {
			min: 1,
			max: MAX_SUMMARIES_PER_CODE,
			notList: 'Must be a list of summaries.',
			size: `Must hold 1–${MAX_SUMMARIES_PER_CODE} summaries.`
		}).map((summary, summaryIndex) =>
			readString(summary, `${field}.summaries[${summaryIndex}]`, { max: MAX_SUMMARY_LENGTH })
		);
		return { code, summaries };
	});

	return { ...(model === undefined ? {} : { model }), paperLabel, codes };
}

/**
 * Whether a proposed name may reach a printed page: non-blank, at most
 * `MAX_LABEL_LENGTH` characters, with no link or email address (`no-contact`).
 */
function topicNameIsUsable(name: unknown): boolean {
	if (typeof name !== 'string') return false;
	const trimmed = name.trim();
	if (trimmed === '' || name.length > MAX_LABEL_LENGTH) return false;
	return !hasContactHook(trimmed);
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
