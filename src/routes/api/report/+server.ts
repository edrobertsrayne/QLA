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
	REPORT_SYSTEM_PROMPT,
	checkFeedback,
	reportPayload,
	reportSchema,
	validateReportBody
} from '$lib/server/report';
import { resolveModelId } from '$lib/server/parse/pdf';
import { askModel, invalidOutput, readRequest } from '$lib/server/structured-route';

const INVALID_INPUT_CODE = 'INVALID_REPORT_INPUT';
const CHECKS_FAILED_MESSAGE = 'The model answer failed the feedback checks. Please try again.';

export const POST: RequestHandler = async ({ request }) => {
	const valid = await readRequest(request, INVALID_INPUT_CODE, 'report', validateReportBody);
	if (valid instanceof Response) return valid;

	const modelId = resolveModelId(valid.model);
	const asked = await askModel(
		{
			modelId,
			systemPrompt: REPORT_SYSTEM_PROMPT,
			data: reportPayload(valid),
			schemaName: 'report_feedback',
			schema: reportSchema(valid.entries.map((entry) => entry.label)),
			caller: { referer: 'https://qla.local/report', title: 'QLA Phase 3 Report' }
		},
		CHECKS_FAILED_MESSAGE
	);
	if (asked instanceof Response) return asked;

	const checked = checkFeedback(valid, asked.answer);
	if ('failures' in checked) return invalidOutput(CHECKS_FAILED_MESSAGE, checked.failures);

	return json({
		strengths: checked.strengths,
		areasForImprovement: checked.areasForImprovement,
		model: modelId,
		usage: asked.usage
	});
};
