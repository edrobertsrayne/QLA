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
	TOPIC_NAMES_SYSTEM_PROMPT,
	topicNamesSchema,
	usableTopicNames,
	validateTopicNamesBody
} from '$lib/server/topic-names';
import { resolveModelId } from '$lib/server/parse/pdf';
import { askModel, readRequest } from '$lib/server/structured-route';

const INVALID_INPUT_CODE = 'INVALID_TOPIC_NAMES_INPUT';

export const POST: RequestHandler = async ({ request }) => {
	const valid = await readRequest(
		request,
		INVALID_INPUT_CODE,
		'topic-name',
		validateTopicNamesBody
	);
	if (valid instanceof Response) return valid;

	const modelId = resolveModelId(valid.model);
	const asked = await askModel(
		{
			modelId,
			systemPrompt: TOPIC_NAMES_SYSTEM_PROMPT,
			data: {
				paper: valid.paperLabel,
				codes: valid.codes.map((entry) => ({ code: entry.code, summaries: entry.summaries }))
			},
			schemaName: 'topic_names',
			schema: topicNamesSchema(),
			caller: { referer: 'https://qla.local/topic-names', title: 'QLA Phase 3 Topic names' }
		},
		'The model answer was not usable.'
	);
	if (asked instanceof Response) return asked;

	return json({ names: usableTopicNames(valid, asked.answer), model: modelId, usage: asked.usage });
};
