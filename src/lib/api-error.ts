// Reading the API's error envelope: one reader for every client call to
// `/api/*`, so a failure carries the server's message, code and retry hint.

import { isRecord } from '$lib/parse/is-breakdown.js';

/** A failed API call: the server's message, its code, and whether to try again. */
export class ApiFailure extends Error {
	readonly code: string | null;
	readonly retryable: boolean;
	readonly retryAfterSeconds: number | null;
	constructor(
		message: string,
		options: { code?: string | null; retryable?: boolean; retryAfterSeconds?: number | null } = {}
	) {
		super(message);
		this.code = options.code ?? null;
		this.retryable = options.retryable ?? false;
		this.retryAfterSeconds = options.retryAfterSeconds ?? null;
	}
}

/** The failure a non-ok response describes; `fallback` is the message when it says none. */
export async function failureFrom(response: Response, fallback: string): Promise<ApiFailure> {
	let code: string | null = null;
	let message = fallback;
	let retryable = false;
	let retryAfterSeconds: number | null = null;
	try {
		const body: unknown = await response.json();
		const error = isRecord(body) ? body['error'] : null;
		if (isRecord(error)) {
			if (typeof error['code'] === 'string') code = error['code'];
			if (typeof error['message'] === 'string' && error['message'] !== '')
				message = error['message'];
			// Only an explicit flag retries: anything else fails the student at once.
			retryable = error['retryable'] === true;
			const wait = error['retryAfter'];
			retryAfterSeconds =
				typeof wait === 'number' && Number.isFinite(wait) && wait >= 0 ? wait : null;
		}
	} catch {
		// The fallback is all there is to say.
	}
	return new ApiFailure(message, { code, retryable, retryAfterSeconds });
}
