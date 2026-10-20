// The request pipeline shared by the structured-output routes (`/api/report`,
// `/api/topic-names`): read and validate the body, ask the model once, and
// answer every failure through one error envelope and one model-error mapping.

import { json } from '@sveltejs/kit';
import { isRunStoppingCode, type RunStoppingCode } from '$lib/marksheet/report-errors';
import {
	StructuredModelError,
	callStructuredModel,
	type StructuredModelInput,
	type StructuredModelResult
} from './openrouter';
import { InputError } from './request-fields';
import { MODEL_RETRYABLE_CODE } from './parse/model';

const INVALID_OUTPUT_CODE = 'INVALID_MODEL_OUTPUT';

/** Request bodies over this size are refused before parsing. */
export const STRUCTURED_MAX_BODY_BYTES = 256 * 1024;

const STOPPING_STATUS: Record<RunStoppingCode, number> = {
	MISSING_API_KEY: 500,
	MODEL_AUTH: 500,
	MODEL_CREDIT: 502,
	MODEL_REJECTED: 502
};

/** The API error envelope: `{ error }` at `status`. */
export function failure(status: number, error: Record<string, unknown>): Response {
	return json({ error }, { status });
}

function invalidInput(code: string, status: number, message: string, field = ''): Response {
	return failure(status, { code, message, retryable: false, field });
}

export function invalidOutput(
	message: string,
	checks: { id: string; message: string }[]
): Response {
	return failure(502, { code: INVALID_OUTPUT_CODE, message, retryable: true, checks });
}

/** Map a structured model failure to the route response; unknown codes rethrow. */
function modelErrorResponse(error: StructuredModelError): Response {
	if (isRunStoppingCode(error.code)) {
		return failure(STOPPING_STATUS[error.code], {
			code: error.code,
			message: error.message,
			retryable: false
		});
	}
	if (error.code === MODEL_RETRYABLE_CODE) {
		return failure(502, {
			code: MODEL_RETRYABLE_CODE,
			message: error.message,
			retryable: true,
			...(error.retryAfter === undefined ? {} : { retryAfter: error.retryAfter })
		});
	}
	throw error;
}

/**
 * The validated body, or the 4xx answer: over the cap → 413, not JSON → 400,
 * first InputError → 400 with its field. `noun` names the request in messages
 * (`The ${noun} request is too large.` / `The ${noun} request is not valid JSON.`).
 */
export async function readRequest<T>(
	request: Request,
	code: string,
	noun: string,
	validate: (body: unknown) => T
): Promise<T | Response> {
	const text = await request.text();
	if (new TextEncoder().encode(text).byteLength > STRUCTURED_MAX_BODY_BYTES) {
		return invalidInput(code, 413, `The ${noun} request is too large.`);
	}
	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		return invalidInput(code, 400, `The ${noun} request is not valid JSON.`);
	}
	try {
		return validate(body);
	} catch (error) {
		if (error instanceof InputError) return invalidInput(code, 400, error.message, error.field);
		throw error;
	}
}

/**
 * One structured model call, parsed: a StructuredModelError → its mapped answer,
 * unparseable content → invalidOutput(unusable, [{ id: 'shape', ... }]). Anything
 * else is rethrown. The transport has already stripped any code fence.
 */
export async function askModel(
	input: StructuredModelInput,
	unusable: string
): Promise<{ answer: unknown; usage: StructuredModelResult['usage'] } | Response> {
	let result: StructuredModelResult;
	try {
		result = await callStructuredModel(input);
	} catch (error) {
		if (error instanceof StructuredModelError) return modelErrorResponse(error);
		throw error;
	}
	try {
		return { answer: JSON.parse(result.content), usage: result.usage };
	} catch {
		return invalidOutput(unusable, [
			{ id: 'shape', message: 'The model answer was not valid JSON.' }
		]);
	}
}
