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
	validateReportBody
} from '$lib/server/report';
import { StructuredModelError, callStructuredModel } from '$lib/server/openrouter';
import { extractJsonText } from '$lib/server/parse/model';
import { resolveModelId } from '$lib/server/parse/pdf';
import { invalidInput, invalidOutput, modelErrorResponse } from '$lib/server/structured-route';

const INVALID_INPUT_CODE = 'INVALID_REPORT_INPUT';
const CHECKS_FAILED_MESSAGE = 'The model answer failed the feedback checks. Please try again.';

export const POST: RequestHandler = async ({ request }) => {
	const text = await request.text();
	if (new TextEncoder().encode(text).byteLength > REPORT_MAX_BODY_BYTES) {
		return invalidInput(INVALID_INPUT_CODE, 413, 'The report request is too large.');
	}

	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		return invalidInput(INVALID_INPUT_CODE, 400, 'The report request is not valid JSON.');
	}

	const { request: valid, problems } = validateReportBody(body);
	if (!valid) {
		return invalidInput(
			INVALID_INPUT_CODE,
			400,
			problems[0]?.message ?? 'The report request is invalid.',
			problems[0]?.field ?? ''
		);
	}

	const modelId = resolveModelId(valid.model, REPORT_DEFAULT_MODEL);
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
		if (error instanceof StructuredModelError) return modelErrorResponse(error);
		throw error;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(extractJsonText(result.content));
	} catch {
		return invalidOutput(CHECKS_FAILED_MESSAGE, [
			{ id: 'shape', message: 'The model answer was not valid JSON.' }
		]);
	}

	const checked = checkFeedback(valid, parsed);
	if ('failures' in checked) return invalidOutput(CHECKS_FAILED_MESSAGE, checked.failures);

	return json({
		strengths: checked.strengths,
		areasForImprovement: checked.areasForImprovement,
		model: modelId,
		usage: result.usage
	});
};
