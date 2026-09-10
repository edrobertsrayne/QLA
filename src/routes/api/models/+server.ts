// `GET /api/models` — compatible-model catalogue for the model override
// drop-down. Serves the static curated id + name list (no pricing), so the
// UI never depends on the browser reaching OpenRouter directly.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCompatibleModels } from '$lib/server/parse/models';

export const GET: RequestHandler = async () => {
	const result = getCompatibleModels();
	return json(result, {
		status: 200,
		headers: { 'Cache-Control': 'public, max-age=86400' }
	});
};
