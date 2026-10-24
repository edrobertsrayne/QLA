// Direct tests for `failureFrom` (issue #123): every client call reads a
// failed response through this one reader, so the envelope's code, message,
// retry flag and wait hint are decoded in exactly one place.

import { describe, expect, it } from 'vitest';
import { ApiFailure, failureFrom } from './api-error';

function failed(body: unknown): Response {
	return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
		status: 500,
		headers: { 'content-type': 'application/json' }
	});
}

interface ReadFailure {
	code: string | null;
	message: string;
	retryable: boolean;
	retryAfterSeconds: number | null;
}

async function read(body: unknown, fallback = 'The call failed.'): Promise<ReadFailure> {
	const failure = await failureFrom(failed(body), fallback);
	expect(failure).toBeInstanceOf(ApiFailure);
	return {
		code: failure.code,
		message: failure.message,
		retryable: failure.retryable,
		retryAfterSeconds: failure.retryAfterSeconds
	};
}

describe('failureFrom', () => {
	it('reads the whole envelope: code, message, retryable and retryAfter', async () => {
		await expect(
			read({
				error: {
					code: 'MODEL_RETRYABLE',
					message: 'The provider is busy.',
					retryable: true,
					retryAfter: 7
				}
			})
		).resolves.toEqual({
			code: 'MODEL_RETRYABLE',
			message: 'The provider is busy.',
			retryable: true,
			retryAfterSeconds: 7
		});
	});

	it.each([
		{ retryable: undefined, expected: false },
		{ retryable: false, expected: false },
		{ retryable: 'yes', expected: false },
		{ retryable: 1, expected: false },
		{ retryable: true, expected: true }
	])('retryable $retryable reads as $expected', async ({ retryable, expected }) => {
		await expect(
			read({ error: { code: 'MODEL_ERROR', message: 'Failed.', retryable } })
		).resolves.toMatchObject({ retryable: expected });
	});

	it.each([
		{ retryAfter: -3, expected: null },
		{ retryAfter: '5', expected: null },
		{ retryAfter: null, expected: null },
		{ retryAfter: 0, expected: 0 },
		{ retryAfter: 12, expected: 12 }
	])('retryAfter $retryAfter reads as $expected', async ({ retryAfter, expected }) => {
		await expect(
			read({ error: { code: 'MODEL_RETRYABLE', message: 'Busy.', retryAfter } })
		).resolves.toMatchObject({ retryAfterSeconds: expected });
	});

	it.each([
		{ name: 'a missing error object', body: { ok: false }, code: null },
		{ name: 'an error that is not an object', body: { error: 'boom' }, code: null },
		{ name: 'a non-JSON body', body: 'not json', code: null },
		{
			name: 'an empty message',
			body: { error: { code: 'MODEL_ERROR', message: '' } },
			code: 'MODEL_ERROR'
		},
		{ name: 'a missing message', body: { error: { code: 'MODEL_ERROR' } }, code: 'MODEL_ERROR' }
	])('$name falls back to the caller message', async ({ body, code }) => {
		await expect(read(body, 'The run could not be completed.')).resolves.toEqual({
			code,
			message: 'The run could not be completed.',
			retryable: false,
			retryAfterSeconds: null
		});
	});
});
