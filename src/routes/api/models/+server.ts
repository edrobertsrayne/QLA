// `GET /api/models` — compatible-model catalogue for the model override
// drop-down. Server-side proxy over OpenRouter's public catalogue, filtered
// to native-PDF (`file` input modality) models with a hardcoded fallback, so
// the UI never depends on the browser reaching OpenRouter directly.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCompatibleModels } from '$lib/server/parse/models';

export const GET: RequestHandler = async () => {
	const result = await getCompatibleModels();
	return json(result, {
		status: 200,
		headers: { 'Cache-Control': 'public, max-age=3600' }
	});
};
