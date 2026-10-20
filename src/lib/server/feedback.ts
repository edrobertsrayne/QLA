// The in-app feedback button's server side: validate the note, title it with
// one call on the shared default model (first-line fallback), and file it as a
// GitHub issue. Feedback text and the token are never logged.

import { callStructuredModel, StructuredModelError } from './openrouter';
import { resolveModelId } from './parse/pdf';
import { isRecord } from '$lib/parse/is-breakdown.js';
import { FEEDBACK_MAX_CHARS, type FiledIssue } from '$lib/feedback';
import { readRecord, readString, rejectUnknownKeys } from './request-fields';

const FEEDBACK_REPO = 'edrobertsrayne/QLA';
const FEEDBACK_LABELS = ['feedback', 'needs-triage'];
const PAGE_MAX_CHARS = 500;
const TITLE_MAX_CHARS = 80;
const FALLBACK_PREFIX = 'Feedback: ';

export interface FeedbackInput {
	text: string;
	page: string;
}

export function validateFeedbackBody(body: unknown): FeedbackInput {
	const record = readRecord(body, '', 'The feedback request must be an object.');
	rejectUnknownKeys(record, new Set(['text', 'page']), '');
	return {
		text: readString(record.text, 'text', {
			nonBlank: 'Write some feedback first.',
			max: FEEDBACK_MAX_CHARS
		}),
		page: readString(record.page, 'page', { max: PAGE_MAX_CHARS })
	};
}

const FEEDBACK_TITLE_SYSTEM_PROMPT = `You write the title of a GitHub issue for a teacher's web app. The data is feedback the developer typed while testing the app, and the page path they were on. Write one concise, specific title in sentence case, at most ${TITLE_MAX_CHARS - FALLBACK_PREFIX.length} characters, naming the problem or the requested change. No trailing full stop, no quotation marks, no prefix such as "Bug:" or "Feedback:". Answer only with JSON matching the schema.`;

const FEEDBACK_TITLE_SCHEMA = {
	type: 'object',
	properties: { title: { type: 'string' } },
	required: ['title'],
	additionalProperties: false
};

/** `Feedback: <first line>`, cut with an ellipsis to fit the title cap. */
function fallbackTitle(text: string): string {
	const first = text.trim().split('\n')[0].trim();
	const room = TITLE_MAX_CHARS - FALLBACK_PREFIX.length;
	return FALLBACK_PREFIX + (first.length <= room ? first : first.slice(0, room - 1) + '…');
}

/** The model's title when it is one line, non-blank and within the cap; else null. */
function usableTitle(content: string): string | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch {
		return null;
	}
	if (!isRecord(parsed) || typeof parsed.title !== 'string') return null;
	const title = parsed.title.trim().replace(/^["'“”]+|["'“”]+$/g, '');
	return title !== '' && title.length <= TITLE_MAX_CHARS && !title.includes('\n') ? title : null;
}

/** The model's title, or the first-line fallback; titling never blocks filing. */
async function feedbackTitle(input: FeedbackInput): Promise<string> {
	let content: string;
	try {
		({ content } = await callStructuredModel({
			modelId: resolveModelId(),
			systemPrompt: FEEDBACK_TITLE_SYSTEM_PROMPT,
			data: { feedback: input.text.trim(), page: input.page },
			schemaName: 'feedback_title',
			schema: FEEDBACK_TITLE_SCHEMA,
			caller: { referer: 'https://qla.local/feedback', title: 'QLA Feedback title' },
			maxTokens: 200,
			timeoutMs: 20_000
		}));
	} catch (error) {
		if (!(error instanceof StructuredModelError)) throw error;
		return titleFallback(input, error.code);
	}
	return usableTitle(content) ?? titleFallback(input, 'UNUSABLE');
}

function titleFallback(input: FeedbackInput, code: string): string {
	console.warn(JSON.stringify({ scope: 'feedback-title', fallback: true, code }));
	return fallbackTitle(input.text);
}

export type FeedbackFetch = (url: string, init?: RequestInit) => Promise<Response>;

const liveFetch: FeedbackFetch = (url, init) => fetch(url, init);
let feedbackFetch = liveFetch;

/** Test seam: replace the GitHub fetch. */
export function setFeedbackFetch(fn: FeedbackFetch): void {
	feedbackFetch = fn;
}

export function resetFeedbackFetch(): void {
	feedbackFetch = liveFetch;
}

/** GitHub could not file the issue; `retryable` when it was never reached. */
export class FeedbackError extends Error {
	readonly code: 'GITHUB_UNREACHABLE' | 'GITHUB_REJECTED';
	readonly retryable: boolean;
	constructor(message: string, code: FeedbackError['code']) {
		super(message);
		this.name = 'FeedbackError';
		this.code = code;
		this.retryable = code === 'GITHUB_UNREACHABLE';
	}
}

/** Title the note and file it as one GitHub issue (no retry). Throws FeedbackError. */
export async function fileFeedback(token: string, input: FeedbackInput): Promise<FiledIssue> {
	const issue = {
		title: await feedbackTitle(input),
		body: `${input.text.trim()}\n\n---\nPage: \`${input.page}\`\nSent from the in-app feedback button.`,
		labels: FEEDBACK_LABELS
	};
	let response: Response;
	try {
		response = await feedbackFetch(`https://api.github.com/repos/${FEEDBACK_REPO}/issues`, {
			method: 'POST',
			headers: {
				Accept: 'application/vnd.github+json',
				Authorization: `Bearer ${token}`,
				'X-GitHub-Api-Version': '2022-11-28',
				'Content-Type': 'application/json',
				'User-Agent': 'qla-feedback'
			},
			body: JSON.stringify(issue),
			signal: AbortSignal.timeout(15_000)
		});
	} catch {
		throw new FeedbackError('GitHub could not be reached. Please try again.', 'GITHUB_UNREACHABLE');
	}
	if (!response.ok) {
		throw new FeedbackError(
			`GitHub refused the issue (status ${response.status}).`,
			'GITHUB_REJECTED'
		);
	}
	const body: unknown = await response.json().catch(() => null);
	if (!isRecord(body) || typeof body.number !== 'number' || typeof body.html_url !== 'string') {
		throw new FeedbackError('GitHub returned an unreadable response.', 'GITHUB_REJECTED');
	}
	return { number: body.number, url: body.html_url };
}
