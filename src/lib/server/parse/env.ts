// Server env access (OpenRouter key/model, GitHub feedback token).
//
// SvelteKit loads `.env` into `$env/*`, not into `process.env` under
// `vite dev`. Reading `process.env` directly therefore misses the local
// `.env` and trips the `MISSING_API_KEY` fatal even when the key is set.
// Always read through `getServerEnv`: `$env/dynamic/private` first (dev
// `.env` + prod runtime), `process.env` as a fallback (adapter-node,
// `vite preview`, external test harnesses).
//
// Tests pin values with `setEnvForTests` / `clearEnvForTests` (same pattern as
// `setModelTransport` / `setSpecFetchTransport`) so contract tests stay
// isolated from the developer's real `.env`.

import { env } from '$env/dynamic/private';

/**
 * The server env values the app reads. Each is trimmed, and `''` means unset:
 * no OpenRouter key is fatal, no `OPENROUTER_MODEL` falls back to
 * `DEFAULT_MODEL_ID`, no feedback token disables the feedback button.
 */
export type ServerEnvName = 'OPENROUTER_API_KEY' | 'OPENROUTER_MODEL' | 'GITHUB_FEEDBACK_TOKEN';

let testOverrides: Partial<Record<ServerEnvName, string>> = {};

/** Trimmed value of `name`, or `''` when unset. */
export function getServerEnv(name: ServerEnvName): string {
	const pinned = testOverrides[name];
	if (pinned !== undefined) return pinned.trim();
	const fromDynamic = env[name]?.trim();
	if (fromDynamic) return fromDynamic;
	return process.env[name]?.trim() ?? '';
}

/** Test seam: pin `name` (use `''` to simulate unset). */
export function setEnvForTests(name: ServerEnvName, value: string): void {
	testOverrides[name] = value;
}

/** Test seam: release every pinned value back to the real environment. */
export function clearEnvForTests(): void {
	testOverrides = {};
}
