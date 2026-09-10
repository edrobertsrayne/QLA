// Contract tests for `GET /api/models` — the drop-down catalogue seam.

import { afterEach, describe, expect, it } from 'vitest';
import { GET } from './+server';
import {
	clearModelsCacheForTests,
	CURATED_MODELS,
	resetModelsFetch,
	setModelsFetch
} from '$lib/server/parse/models';

describe('GET /api/models', () => {
	afterEach(() => {
		resetModelsFetch();
		clearModelsCacheForTests();
	});

	it('serves the curated set with static prices when OpenRouter is down', async () => {
		setModelsFetch(async () => new Response('bad gateway', { status: 502 }));
		const response = await GET({} as unknown as Parameters<typeof GET>[0]);
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			models: Array<{ id: string }>;
			source: string;
		};
		expect(body.source).toBe('fallback');
		expect(body.models.map((m) => m.id)).toEqual(CURATED_MODELS.map((m) => m.id));
	});

	it('serves the curated set (never the raw catalogue) when live', async () => {
		setModelsFetch(
			async () =>
				new Response(
					JSON.stringify({
						data: [
							{
								id: 'google/gemini-2.5-flash',
								name: 'Gemini 2.5 Flash',
								architecture: { input_modalities: ['text', 'file'] },
								pricing: { prompt: '0.0000003', completion: '0.0000025' }
							},
							{
								id: 'some/obscure-file-model',
								name: 'Obscure File Model',
								architecture: { input_modalities: ['text', 'file'] },
								pricing: { prompt: '0.0000001', completion: '0.0000002' }
							}
						]
					}),
					{ status: 200 }
				)
		);
		const response = await GET({} as unknown as Parameters<typeof GET>[0]);
		const body = (await response.json()) as {
			models: Array<{ id: string }>;
			source: string;
		};
		expect(body.source).toBe('live');
		expect(body.models.map((m) => m.id)).toEqual(CURATED_MODELS.map((m) => m.id));
	});
});
