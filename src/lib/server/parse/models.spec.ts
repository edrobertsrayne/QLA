// Unit tests for the compatible-model catalogue (filter, static curated set,
// live-price overlay, cache, fallback). No network: the catalogue fetch is
// mocked via `setModelsFetch`.

import { afterEach, describe, expect, it } from 'vitest';
import {
	clearModelsCacheForTests,
	CURATED_FIRST,
	CURATED_MODELS,
	filterCompatibleModels,
	getCompatibleModels,
	orderCompatibleModels,
	resetModelsFetch,
	setModelsFetch
} from './models';
import { supportsNativePdf } from './pdf';

function entry(id: string, modalities: string[], prompt = '0.0000003'): unknown {
	return {
		id,
		name: id,
		architecture: { input_modalities: modalities },
		pricing: { prompt, completion: '0.0000025' }
	};
}

describe('filterCompatibleModels', () => {
	it('keeps file-capable models and drops text-only ones', () => {
		const out = filterCompatibleModels({
			data: [
				entry('google/gemini-2.5-flash', ['text', 'image', 'file']),
				entry('deepseek/deepseek-v4.1-flash', ['text', 'image']),
				entry('meta-llama/llama-3.3-70b-instruct', ['text'])
			]
		});
		expect(out.map((m) => m.id)).toEqual(['google/gemini-2.5-flash']);
	});

	it('drops provider routing variants', () => {
		const out = filterCompatibleModels({
			data: [
				entry('google/gemini-2.5-flash', ['file', 'text']),
				entry('google/gemini-2.5-flash:batch', ['file', 'text']),
				entry('openai/gpt-4o-mini:free', ['file', 'text'])
			]
		});
		expect(out.map((m) => m.id)).toEqual(['google/gemini-2.5-flash']);
	});

	it('tolerates malformed payloads', () => {
		expect(filterCompatibleModels(null)).toEqual([]);
		expect(filterCompatibleModels({})).toEqual([]);
		expect(filterCompatibleModels({ data: 'nope' })).toEqual([]);
	});
});

describe('orderCompatibleModels', () => {
	it('pins curated models first, then alphabetical', () => {
		const out = orderCompatibleModels([
			{ id: 'x/zebra', name: 'Zebra', promptPrice: 0, completionPrice: 0 },
			{ id: 'openai/gpt-4o-mini', name: 'GPT-4o mini', promptPrice: 0, completionPrice: 0 },
			{
				id: 'google/gemini-2.5-flash',
				name: 'Gemini 2.5 Flash',
				promptPrice: 0,
				completionPrice: 0
			}
		]);
		expect(out.map((m) => m.id)).toEqual([
			'google/gemini-2.5-flash',
			'openai/gpt-4o-mini',
			'x/zebra'
		]);
		expect(CURATED_FIRST[0]).toBe('google/gemini-2.5-flash');
	});
});

describe('curated set', () => {
	it('is five cheap modern models, all passing the parse-time native-PDF gate', () => {
		expect(CURATED_MODELS).toHaveLength(5);
		for (const model of CURATED_MODELS) {
			expect(supportsNativePdf(model.id)).toBe(true);
		}
	});
});

describe('getCompatibleModels', () => {
	afterEach(() => {
		resetModelsFetch();
		clearModelsCacheForTests();
	});

	it('serves exactly the curated set with live prices overlaid', async () => {
		setModelsFetch(
			async () =>
				new Response(
					JSON.stringify({
						data: [
							entry('google/gemini-2.5-flash', ['text', 'file'], '0.0000005'),
							entry('some/obscure-file-model', ['text', 'file'], '0.0000099'),
							entry('deepseek/deepseek-v4.1-flash', ['text', 'image'])
						]
					}),
					{ status: 200 }
				)
		);
		const result = await getCompatibleModels();
		expect(result.source).toBe('live');
		expect(result.models.map((m) => m.id)).toEqual(CURATED_MODELS.map((m) => m.id));
		const flash = result.models.find((m) => m.id === 'google/gemini-2.5-flash');
		expect(flash?.promptPrice).toBe(0.0000005);
		const haiku = result.models.find((m) => m.id === 'anthropic/claude-haiku-4.5');
		expect(haiku?.promptPrice).toBe(
			CURATED_MODELS.find((m) => m.id === 'anthropic/claude-haiku-4.5')?.promptPrice
		);
	});

	it('falls back to static prices when OpenRouter is down', async () => {
		setModelsFetch(async () => new Response('bad gateway', { status: 502 }));
		const result = await getCompatibleModels();
		expect(result.source).toBe('fallback');
		expect(result.models).toEqual(CURATED_MODELS);
	});

	it('falls back when the fetch itself throws', async () => {
		setModelsFetch(async () => {
			throw new Error('socket hang up');
		});
		const result = await getCompatibleModels();
		expect(result.source).toBe('fallback');
		expect(result.models.map((m) => m.id)).toEqual(CURATED_MODELS.map((m) => m.id));
	});

	it('caches the live list within the TTL', async () => {
		let calls = 0;
		setModelsFetch(async () => {
			calls += 1;
			return new Response(JSON.stringify({ data: [entry('google/gemini-2.5-flash', ['file'])] }), {
				status: 200
			});
		});
		const first = await getCompatibleModels(1_000);
		const second = await getCompatibleModels(2_000);
		expect(calls).toBe(1);
		expect(second).toBe(first);
	});
});
