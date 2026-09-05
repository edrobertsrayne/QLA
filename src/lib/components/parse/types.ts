import type { Breakdown, ParseUsage, ParseWarning } from '$lib/server/parse/schema.js';

export interface RunResult {
	breakdown: Breakdown;
	warnings: ParseWarning[];
	usage: ParseUsage;
}

export interface FatalError {
	code: string;
	message: string;
	retryable?: boolean;
}
