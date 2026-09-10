// Shared structural guard for a parsed breakdown payload.
//
// The server's validator (`$lib/server/parse/validate`) treats shape
// problems as warnings and returns the breakdown intact regardless. The
// client cannot render a table over arbitrary JSON, so it needs the same
// "is this even a breakdown" check before trusting the payload — this is
// that single guard, shared by both sides instead of duplicated.

import type { Breakdown } from '$lib/server/parse/schema.js';

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

/** Type-guard for a structurally complete breakdown (warnings may still apply). */
export function isBreakdown(value: unknown): value is Breakdown {
	if (!isRecord(value)) return false;
	return Array.isArray(value['questions']);
}
