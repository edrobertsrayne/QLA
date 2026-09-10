// Contract tests for `GET /api/models` — the drop-down catalogue seam.

import { describe, expect, it } from 'vitest';
import { GET } from './+server';
import { CURATED_MODELS } from '$lib/server/parse/models';

describe('GET /api/models', () => {
	it('serves the curated id + name set', async () => {
		const response = await GET({} as unknown as Parameters<typeof GET>[0]);
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			models: Array<{ id: string; name: string }>;
		};
		expect(body.models).toEqual(CURATED_MODELS);
		expect(body.models.map((m) => m.id)).toEqual(CURATED_MODELS.map((m) => m.id));
	});
});
