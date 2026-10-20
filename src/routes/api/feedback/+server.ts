// `GET|POST /api/feedback` — the in-app feedback button.
//
// GET answers `{ enabled }` (a GitHub token is configured). POST takes JSON
// (`validateFeedbackBody`) and answers `{ number, url }` of the new issue
// (`fileFeedback`: titled on the shared default model, first-line fallback).
// Request bodies and the token are never logged.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { FeedbackError, fileFeedback, validateFeedbackBody } from '$lib/server/feedback';
import { getServerEnv } from '$lib/server/parse/env';
import { failure, readRequest } from '$lib/server/structured-route';

export const GET: RequestHandler = () =>
	json(
		{ enabled: getServerEnv('GITHUB_FEEDBACK_TOKEN') !== '' },
		{ headers: { 'Cache-Control': 'no-store' } }
	);

export const POST: RequestHandler = async ({ request }) => {
	const token = getServerEnv('GITHUB_FEEDBACK_TOKEN');
	if (token === '') {
		return failure(500, {
			code: 'MISSING_GITHUB_TOKEN',
			message: 'Feedback is not configured on the server.',
			retryable: false
		});
	}
	const valid = await readRequest(
		request,
		'INVALID_FEEDBACK_INPUT',
		'feedback',
		validateFeedbackBody
	);
	if (valid instanceof Response) return valid;
	try {
		return json(await fileFeedback(token, valid), { status: 201 });
	} catch (e) {
		if (!(e instanceof FeedbackError)) throw e;
		return failure(502, { code: e.code, message: e.message, retryable: e.retryable });
	}
};
