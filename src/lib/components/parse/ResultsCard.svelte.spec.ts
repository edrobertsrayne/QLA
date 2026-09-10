import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ResultsCard from './ResultsCard.svelte';
import type { RunResult } from './types.js';

function question(overrides: Partial<RunResult['breakdown']['questions'][number]> = {}) {
	return {
		id: '1a',
		marks: 2,
		summary: 'Explain the process shown',
		specPoint: null,
		commandWord: 'Explain',
		ao: 'AO1' as const,
		...overrides
	};
}

describe('ResultsCard.svelte', () => {
	it('renders every row and surfaces the warning when question ids repeat', async () => {
		const result: RunResult = {
			breakdown: {
				questions: [
					question({ id: '1a', summary: 'First take on this question' }),
					question({ id: '1a', summary: 'Second take on this question' })
				]
			},
			warnings: [
				{ questionId: '1a', code: 'DUPLICATE_ID', message: "Duplicate question id '1a'." }
			],
			usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estCost: 0 }
		};

		render(ResultsCard, {
			result,
			breakdownJson: '{}',
			running: false,
			onCopy: () => {},
			onDownload: () => {}
		});

		await expect.element(page.getByText('First take on this question')).toBeInTheDocument();
		await expect.element(page.getByText('Second take on this question')).toBeInTheDocument();
		await expect.element(page.getByTestId('warning-panel')).toHaveTextContent('DUPLICATE_ID');
	});

	it('renders a normal successful run without warnings', async () => {
		const result: RunResult = {
			breakdown: { questions: [question({ id: '1a' }), question({ id: '1b' })] },
			warnings: [],
			usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estCost: 0 }
		};

		render(ResultsCard, {
			result,
			breakdownJson: '{}',
			running: false,
			onCopy: () => {},
			onDownload: () => {}
		});

		await expect.element(page.getByText('No warnings')).toBeInTheDocument();
		await expect.element(page.getByTestId('warning-panel')).not.toBeInTheDocument();
	});
});
