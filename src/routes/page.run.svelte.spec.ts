import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

function pdfFile(): File {
	return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])], 'paper.pdf', {
		type: 'application/pdf'
	});
}

function stubFetch(parseBody: unknown, parseStatus = 200) {
	return vi.fn(async (input: string | URL | Request) => {
		const url = typeof input === 'string' ? input : input.toString();
		if (url.includes('/api/models')) {
			return new Response(JSON.stringify({ models: [] }), { status: 200 });
		}
		if (url.includes('/api/parse')) {
			return new Response(JSON.stringify(parseBody), { status: parseStatus });
		}
		throw new Error(`unexpected fetch: ${url}`);
	});
}

describe('+page.svelte run handler', () => {
	beforeEach(() => {
		vi.stubGlobal(
			'fetch',
			stubFetch({
				breakdown: [],
				warnings: [],
				usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estCost: 0 }
			})
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('shows a fatal error naming malformed model output instead of crashing', async () => {
		render(Page);

		await page.getByLabelText('Assessment paper (PDF)').upload(pdfFile());
		await page.getByRole('button', { name: 'Run' }).click();

		await expect
			.element(page.getByTestId('fatal-panel'))
			.toHaveTextContent('MALFORMED_MODEL_OUTPUT');
		await expect.element(page.getByRole('button', { name: 'Run' })).toBeInTheDocument();
	});

	it('renders a normal successful run unaffected', async () => {
		vi.stubGlobal(
			'fetch',
			stubFetch({
				breakdown: {
					questions: [
						{
							id: '1a',
							marks: 2,
							summary: 'Explain the process shown',
							specPoint: null,
							commandWord: 'Explain',
							ao: 'AO1'
						}
					]
				},
				warnings: [],
				usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estCost: 0 }
			})
		);

		render(Page);

		await page.getByLabelText('Assessment paper (PDF)').upload(pdfFile());
		await page.getByRole('button', { name: 'Run' }).click();

		await expect
			.element(page.getByRole('cell', { name: 'Explain the process shown' }))
			.toBeInTheDocument();
		await expect.element(page.getByTestId('fatal-panel')).not.toBeInTheDocument();
	});
});
