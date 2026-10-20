// Server env access (OpenRouter key/model, GitHub feedback token).
//
// SvelteKit loads `.env` into `$env/*`, not into `process.env` under
// `vite dev`. Reading `process.env` directly therefore misses the local
// `.env` and trips the `MISSING_API_KEY` fatal even when the key is set.
// Always read through these accessors: `$env/dynamic/private` first (dev
// `.env` + prod runtime), `process.env` as a fallback (adapter-node,
// `vite preview`, external test harnesses).
//
// Tests control the value via the `*ForTests` seams (same pattern as
// `setModelTransport` / `setSpecFetchTransport`) so contract tests stay
// isolated from the developer's real `.env`.

import { env } from '$env/dynamic/private';

let apiKeyTestOverride: string | undefined;
let defaultModelTestOverride: string | undefined;
let feedbackTokenTestOverride: string | undefined;

function readServerEnv(
	name: 'OPENROUTER_API_KEY' | 'OPENROUTER_MODEL' | 'GITHUB_FEEDBACK_TOKEN'
): string {
	const fromDynamic = env[name]?.trim();
	if (fromDynamic) return fromDynamic;
	return process.env[name]?.trim() ?? '';
}

/** Trimmed server OpenRouter key, or `''` when missing. Callers treat `''` as missing. */
export function getApiKey(): string {
	if (apiKeyTestOverride !== undefined) return apiKeyTestOverride.trim();
	return readServerEnv('OPENROUTER_API_KEY');
}

/** Trimmed `OPENROUTER_MODEL` default, or `''` when unset. Callers fall back to `DEFAULT_MODEL_ID`. */
export function getEnvDefaultModel(): string {
	if (defaultModelTestOverride !== undefined) return defaultModelTestOverride.trim();
	return readServerEnv('OPENROUTER_MODEL');
}

/** Trimmed GitHub feedback token, or `''` when missing (feedback disabled). */
export function getFeedbackToken(): string {
	if (feedbackTokenTestOverride !== undefined) return feedbackTokenTestOverride.trim();
	return readServerEnv('GITHUB_FEEDBACK_TOKEN');
}

/** Test seam: pin the feedback token (use `''` to simulate missing). */
export function setFeedbackTokenForTests(token: string): void {
	feedbackTokenTestOverride = token;
}

/** Test seam: release the pinned feedback token. */
export function clearFeedbackTokenForTests(): void {
	feedbackTokenTestOverride = undefined;
}

/** Test seam: pin the API key (use `''` to simulate a missing key). */
export function setApiKeyForTests(key: string): void {
	apiKeyTestOverride = key;
}

/** Test seam: release the pinned API key back to the real environment. */
export function clearApiKeyForTests(): void {
	apiKeyTestOverride = undefined;
}

/** Test seam: pin the `OPENROUTER_MODEL` default. */
export function setDefaultModelForTests(model: string): void {
	defaultModelTestOverride = model;
}

/** Test seam: release the pinned model default back to the real environment. */
export function clearDefaultModelForTests(): void {
	defaultModelTestOverride = undefined;
}
