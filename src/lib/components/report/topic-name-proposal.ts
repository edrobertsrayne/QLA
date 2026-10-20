// The browser's side of `POST /api/topic-names`.

import { specPointCodes, type MarksheetDocument } from '$lib/marksheet/document.js';
import { MAX_SUMMARIES_PER_CODE } from '$lib/marksheet/report-limits.js';
import { isRecord } from '$lib/parse/is-breakdown.js';
import { ApiFailure, failureFrom } from '$lib/api-error.js';

/**
 * Ask `/api/topic-names` to name these codes. Resolves to the names the server
 * returned (string values only); rejects with an ApiFailure carrying the
 * server's message, or `Proposal failed (status N).`
 */
export async function proposeTopicNames(
	document: MarksheetDocument,
	codes: readonly string[],
	model: string
): Promise<Record<string, string>> {
	const summariesOf = (wanted: string): string[] =>
		document.breakdown.entries
			.filter((entry) => specPointCodes(entry.specPoint).includes(wanted))
			.map((entry) => entry.summary || entry.label)
			.slice(0, MAX_SUMMARIES_PER_CODE);
	const response = await fetch('/api/topic-names', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			...(model.trim() === '' ? {} : { model: model.trim() }),
			paperLabel: document.paper.label ?? '',
			codes: codes.map((code) => ({ code, summaries: summariesOf(code) }))
		})
	});
	const failed = `Proposal failed (status ${response.status}).`;
	if (!response.ok) throw await failureFrom(response, failed);
	const body: unknown = await response.json().catch(() => null);
	if (!isRecord(body) || !isRecord(body['names'])) throw new ApiFailure(failed);
	return Object.fromEntries(
		Object.entries(body['names']).filter(
			(entry): entry is [string, string] => typeof entry[1] === 'string'
		)
	);
}
