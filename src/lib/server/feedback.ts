// The in-app feedback button's server side: validate the note, title it with
// one call on the shared default model (first-line fallback), and file it as a GitHub issue.
// Feedback text and the token are never logged.

import { callStructuredModel, StructuredModelError } from './openrouter';
import { resolveModelId } from './parse/pdf';
import { isRecord } from '$lib/parse/is-breakdown.js';
import { readRecord, readString, rejectUnknownKeys } from './request-fields';

export const FEEDBACK_REPO = 'edrobertsrayne/QLA';
export const FEEDBACK_LABELS = ['feedback', 'needs-triage'];
export const FEEDBACK_MAX_CHARS = 10_000;
export const FEEDBACK_TITLE_MAX = 80;

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
		page: readString(record.page, 'page', { max: 500 })
	};
}

export function fallbackTitle(text: string): string {
	const first = text.trim().split('\n')[0].trim();
	return first.length <= 70 ? 'Feedback: ' + first : 'Feedback: ' + first.slice(0, 69) + '…';
}

export const FEEDBACK_TITLE_SYSTEM_PROMPT =
	'You write the title of a GitHub issue for a teacher\'s web app. The data is feedback the developer typed while testing the app, and the page path they were on. Write one concise, specific title in sentence case, at most 70 characters, naming the problem or the requested change. No trailing full stop, no quotation marks, no prefix such as "Bug:" or "Feedback:". Answer only with JSON matching the schema.';

export function feedbackTitleSchema(): Record<string, unknown> {
	return {
		type: 'object',
		properties: { title: { type: 'string' } },
		required: ['title'],
		additionalProperties: false
	};
}

/** The model's title, or the first-line fallback; titling never blocks filing. */
export async function feedbackTitle(input: FeedbackInput): Promise<string> {
	try {
		const result = await callStructuredModel({
			modelId: resolveModelId(),
			systemPrompt: FEEDBACK_TITLE_SYSTEM_PROMPT,
			data: { feedback: input.text.trim(), page: input.page },
			schemaName: 'feedback_title',
			schema: feedbackTitleSchema(),
			caller: { referer: 'https://qla.local/feedback', title: 'QLA Feedback title' },
			maxTokens: 200,
			timeoutMs: 20_000
		});
		const parsed: unknown = JSON.parse(result.content);
		const raw = isRecord(parsed) ? parsed.title : null;
		if (typeof raw === 'string') {
			const title = raw.trim().replace(/^["'“”]+|["'“”]+$/g, '');
			if (title !== '' && title.length <= FEEDBACK_TITLE_MAX && !title.includes('\n')) return title;
		}
		throw new Error('unusable title');
	} catch (error) {
		console.warn(
			JSON.stringify({
				scope: 'feedback-title',
				fallback: true,
				code: error instanceof StructuredModelError ? error.code : 'UNUSABLE'
			})
		);
		return fallbackTitle(input.text);
	}
}

export interface FeedbackIssue {
	title: string;
	body: string;
	labels: string[];
}

export function feedbackIssue(input: FeedbackInput, title: string): FeedbackIssue {
	return {
		title,
		body: `${input.text.trim()}\n\n---\nPage: \`${input.page}\`\nSent from the in-app feedback button.`,
		labels: [...FEEDBACK_LABELS]
	};
}

export type FeedbackFetch = (url: string, init?: RequestInit) => Promise<Response>;

let feedbackFetch: FeedbackFetch = (url, init) => fetch(url, init);

/** Test seam: replace the GitHub fetch. */
export function setFeedbackFetch(fn: FeedbackFetch): void {
	feedbackFetch = fn;
}

export function resetFeedbackFetch(): void {
	feedbackFetch = (url, init) => fetch(url, init);
}

export class FeedbackError extends Error {
	readonly code: 'GITHUB_UNREACHABLE' | 'GITHUB_REJECTED';
	constructor(message: string, code: 'GITHUB_UNREACHABLE' | 'GITHUB_REJECTED') {
		super(message);
		this.name = 'FeedbackError';
		this.code = code;
	}
}

/** One call, no retry. */
export async function createFeedbackIssue(
	token: string,
	issue: FeedbackIssue
): Promise<{ number: number; url: string }> {
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
	let body: unknown = null;
	try {
		body = await response.json();
	} catch {
		// handled below
	}
	if (!isRecord(body) || typeof body.number !== 'number' || typeof body.html_url !== 'string') {
		throw new FeedbackError('GitHub returned an unreadable response.', 'GITHUB_REJECTED');
	}
	return { number: body.number, url: body.html_url };
}
