/** Errors that would fail every student alike: the run stops on the first. */
export const RUN_STOPPING_CODES = [
	'MISSING_API_KEY',
	'MODEL_AUTH',
	'MODEL_CREDIT',
	'MODEL_REJECTED'
] as const;

export type RunStoppingCode = (typeof RUN_STOPPING_CODES)[number];

export function isRunStoppingCode(code: string): code is RunStoppingCode {
	return (RUN_STOPPING_CODES as readonly string[]).includes(code);
}
