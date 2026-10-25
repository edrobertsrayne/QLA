// Fail-fast readers for request bodies: each returns the value or throws the
// first `InputError`, which the route answers as a 400 naming its field.

/** The first thing wrong with a request body: the route answers 400 with it. */
export class InputError extends Error {
	readonly field: string;
	constructor(field: string, message: string) {
		super(message);
		this.field = field;
	}
}

export function fail(field: string, message: string): never {
	throw new InputError(field, message);
}

/**
 * The body as text, or null once it passes `maxBytes`: a declared content-length
 * over the cap is refused unread, and a stream is cancelled the moment it
 * outgrows the cap, whatever the headers say. Never buffers more than the cap
 * plus one chunk.
 */
export async function readCappedText(request: Request, maxBytes: number): Promise<string | null> {
	const declared = Number(request.headers.get('content-length'));
	if (declared > maxBytes) return null;
	if (!request.body) return '';
	const reader = request.body.getReader();
	const decoder = new TextDecoder();
	let text = '';
	let received = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		received += value.byteLength;
		if (received > maxBytes) {
			await reader.cancel();
			return null;
		}
		text += decoder.decode(value, { stream: true });
	}
	return text + decoder.decode();
}

/** A plain object (not null, not an array), else `message`. */
export function readRecord(
	value: unknown,
	field: string,
	message = 'Must be an object.'
): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(field, message);
	return value as Record<string, unknown>;
}

/** Every key outside `allowed` fails as `${prefix}.${key}` (bare `key` when prefix is ''). */
export function rejectUnknownKeys(
	record: Record<string, unknown>,
	allowed: ReadonlySet<string>,
	prefix: string
): void {
	for (const key of Object.keys(record)) {
		if (!allowed.has(key)) fail(prefix === '' ? key : `${prefix}.${key}`, 'Unknown key.');
	}
}

/**
 * A string. With `nonBlank`, a non-string or blank value fails with that message;
 * otherwise a non-string fails 'Must be a string.'. With `max`, longer fails
 * `Must be at most ${max} characters.`
 */
export function readString(
	value: unknown,
	field: string,
	rule: { nonBlank?: string; max?: number }
): string {
	if (typeof value !== 'string') fail(field, rule.nonBlank ?? 'Must be a string.');
	if (rule.nonBlank !== undefined && value.trim() === '') fail(field, rule.nonBlank);
	if (rule.max !== undefined && value.length > rule.max)
		fail(field, `Must be at most ${rule.max} characters.`);
	return value;
}

/** null, or a string of at most `max`; anything else (undefined included) fails. */
export function readNullableString(value: unknown, field: string, max: number): string | null {
	if (value === null) return null;
	if (typeof value !== 'string') fail(field, 'Must be a string or null.');
	if (value.length > max) fail(field, `Must be at most ${max} characters.`);
	return value;
}

/** An array of min..max items: a non-array fails `notList`, a wrong size fails `size`. */
export function readList(
	value: unknown,
	field: string,
	rule: { min: number; max: number; notList: string; size: string }
): unknown[] {
	if (!Array.isArray(value)) fail(field, rule.notList);
	if (value.length < rule.min || value.length > rule.max) fail(field, rule.size);
	return value;
}
