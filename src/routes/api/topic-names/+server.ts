// `POST /api/topic-names` — student-readable names for specification codes.
//
// JSON in (`validateTopicNamesBody`), `{ names, model, usage }` out.
// Validation and the 256 KB cap answer before any model spend; the model call
// is one structured transport call (no internal retry). Codes that were never
// asked for are ignored; unusable names (blank, over-long, contact) are
// dropped, leaving a gap for the teacher. Request bodies and model text are
// never logged.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	TOPIC_NAMES_DEFAULT_MODEL,
	TOPIC_NAMES_MAX_BODY_BYTES,
	TOPIC_NAMES_SYSTEM_PROMPT,
	topicNamesSchema,
	usableTopicNames,
	validateTopicNamesBody
} from '$lib/server/topic-names';
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

const INVALID_INPUT_CODE = 'INVALID_TOPIC_NAMES_INPUT';
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
	if (new TextEncoder().encode(text).byteLength > TOPIC_NAMES_MAX_BODY_BYTES) {
		return invalidInput(413, 'The topic-name request is too large.');
	}

	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		return invalidInput(400, 'The topic-name request is not valid JSON.');
	}

	const { request: valid, problems } = validateTopicNamesBody(body);
	if (!valid) {
		return invalidInput(
			400,
			problems[0]?.message ?? 'The topic-name request is invalid.',
			problems
		);
	}

	const modelId = valid.model ?? (getEnvDefaultModel() || TOPIC_NAMES_DEFAULT_MODEL);

	let result;
	try {
		result = await callStructuredModel({
			modelId,
			systemPrompt: TOPIC_NAMES_SYSTEM_PROMPT,
			data: {
				paper: valid.paperLabel,
				codes: valid.codes.map((entry) => ({ code: entry.code, summaries: entry.summaries }))
			},
			schemaName: 'topic_names',
			schema: topicNamesSchema(),
			caller: { referer: 'https://qla.local/topic-names', title: 'QLA Phase 3 Topic names' }
		});
	} catch (error) {
		if (error instanceof StructuredModelError) return modelError(error);
		throw error;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(extractJsonText(result.content));
	} catch {
		return failure(502, {
			code: INVALID_OUTPUT_CODE,
			message: 'The model answer was not usable.',
			retryable: true,
			checks: [{ id: 'shape', message: 'The model answer was not valid JSON.' }]
		});
	}

	const names = usableTopicNames(valid, parsed);
	return json({ names, model: modelId, usage: result.usage });
};
