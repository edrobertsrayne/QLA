// `POST /api/report` — one student's holistic feedback from marks alone.
//
// JSON in (`validateReportBody`), `{ strengths, areasForImprovement, model,
// usage }` out. Validation and the 256 KB cap answer before any model spend;
// the model call is one structured transport call (no internal retry — the
// browser run loop owns retries, keyed on the check ids); every model answer
// passes the local checks before it reaches the caller. Request bodies and
// model prose are never logged.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	REPORT_DEFAULT_MODEL,
	REPORT_MAX_BODY_BYTES,
	REPORT_SYSTEM_PROMPT,
	checkFeedback,
	reportPayload,
	reportSchema,
	validateReportBody,
	type CheckFailure
} from '$lib/server/report';
import {
	MISSING_API_KEY_CODE,
	STRUCTURED_AUTH_CODE,
	STRUCTURED_CREDIT_CODE,
	STRUCTURED_REJECTED_CODE,
	StructuredModelError,
	callStructuredModel
} from '$lib/server/openrouter';
import { MODEL_RETRYABLE_CODE, extractJsonText } from '$lib/server/parse/model';
import { getEnvDefaultModel } from '$lib/server/parse/env';

const INVALID_INPUT_CODE = 'INVALID_REPORT_INPUT';
const INVALID_OUTPUT_CODE = 'INVALID_MODEL_OUTPUT';

function failure(status: number, error: Record<string, unknown>): Response {
	return json({ error }, { status });
}

function invalidInput(
	status: number,
	message: string,
	problems?: { field: string; message: string }[]
): Response {
	return failure(status, {
		code: INVALID_INPUT_CODE,
		message,
		retryable: false,
		field: problems?.[0]?.field ?? '',
		...(problems ? { problems } : {})
	});
}

function invalidOutput(checks: CheckFailure[]): Response {
	return failure(502, {
		code: INVALID_OUTPUT_CODE,
		message: 'The model answer failed the feedback checks. Please try again.',
		retryable: true,
		checks
	});
}

function modelError(error: StructuredModelError): Response {
	switch (error.code) {
		case MISSING_API_KEY_CODE:
			return failure(500, { code: MISSING_API_KEY_CODE, message: error.message, retryable: false });
		case STRUCTURED_AUTH_CODE:
			return failure(500, { code: STRUCTURED_AUTH_CODE, message: error.message, retryable: false });
		case STRUCTURED_CREDIT_CODE:
			return failure(502, {
				code: STRUCTURED_CREDIT_CODE,
				message: error.message,
				retryable: false
			});
		case STRUCTURED_REJECTED_CODE:
			return failure(502, {
				code: STRUCTURED_REJECTED_CODE,
				message: error.message,
				retryable: false
			});
		case MODEL_RETRYABLE_CODE:
			return failure(502, {
				code: MODEL_RETRYABLE_CODE,
				message: error.message,
				retryable: true,
				...(error.retryAfter === undefined ? {} : { retryAfter: error.retryAfter })
			});
		default:
			throw error;
	}
}

export const POST: RequestHandler = async ({ request }) => {
	const text = await request.text();
	if (new TextEncoder().encode(text).byteLength > REPORT_MAX_BODY_BYTES) {
		return invalidInput(413, 'The report request is too large.');
	}

	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		return invalidInput(400, 'The report request is not valid JSON.');
	}

	const { request: valid, problems } = validateReportBody(body);
	if (!valid) {
		return invalidInput(400, problems[0]?.message ?? 'The report request is invalid.', problems);
	}

	const modelId = valid.model ?? (getEnvDefaultModel() || REPORT_DEFAULT_MODEL);
	const payload = reportPayload(valid);

	let result;
	try {
		result = await callStructuredModel({
			modelId,
			systemPrompt: REPORT_SYSTEM_PROMPT,
			data: payload,
			schemaName: 'report_feedback',
			schema: reportSchema(valid.entries.map((entry) => entry.label)),
			caller: { referer: 'https://qla.local/report', title: 'QLA Phase 3 Report' }
		});
	} catch (error) {
		if (error instanceof StructuredModelError) return modelError(error);
		throw error;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(extractJsonText(result.content));
	} catch {
		return invalidOutput([{ id: 'shape', message: 'The model answer was not valid JSON.' }]);
	}

	const checked = checkFeedback(valid, parsed);
	if ('failures' in checked) return invalidOutput(checked.failures);

	return json({
		strengths: checked.strengths,
		areasForImprovement: checked.areasForImprovement,
		model: modelId,
		usage: result.usage
	});
};
