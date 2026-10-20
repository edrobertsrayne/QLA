// The feedback contract shared by the button and `/api/feedback`.

import { isRecord } from '$lib/parse/is-breakdown.js';

/** Longest note the button accepts and the server files. */
export const FEEDBACK_MAX_CHARS = 10_000;

/** The issue `POST /api/feedback` filed. */
export interface FiledIssue {
	number: number;
	url: string;
}

export function isFiledIssue(value: unknown): value is FiledIssue {
	return isRecord(value) && typeof value.number === 'number' && typeof value.url === 'string';
}
