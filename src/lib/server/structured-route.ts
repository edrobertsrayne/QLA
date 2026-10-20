// Response helpers shared by the structured-output routes (`/api/report`,
// `/api/topic-names`): one error envelope, one model-error mapping.

import { json } from '@sveltejs/kit';
import { isRunStoppingCode, type RunStoppingCode } from '$lib/marksheet/report-errors';
import { StructuredModelError } from './openrouter';
import { MODEL_RETRYABLE_CODE } from './parse/model';

const INVALID_OUTPUT_CODE = 'INVALID_MODEL_OUTPUT';

const STOPPING_STATUS: Record<RunStoppingCode, number> = {
	MISSING_API_KEY: 500,
	MODEL_AUTH: 500,
	MODEL_CREDIT: 502,
	MODEL_REJECTED: 502
};

export function failure(status: number, error: Record<string, unknown>): Response {
	return json({ error }, { status });
}

export function invalidInput(code: string, status: number, message: string, field = ''): Response {
	return failure(status, { code, message, retryable: false, field });
}

export function invalidOutput(
	message: string,
	checks: { id: string; message: string }[]
): Response {
	return failure(502, { code: INVALID_OUTPUT_CODE, message, retryable: true, checks });
}

/** Map a structured model failure to the route response; unknown codes rethrow. */
export function modelErrorResponse(error: StructuredModelError): Response {
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
