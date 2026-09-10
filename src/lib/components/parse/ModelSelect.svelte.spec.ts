import { page, userEvent } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ModelSelect, { type ModelOption } from './ModelSelect.svelte';

const models: ModelOption[] = [
	{ id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
	{ id: 'openai/gpt-4o-mini', name: 'GPT-4o mini' }
];

describe('ModelSelect.svelte', () => {
	it('lets a keyboard user open the picker, move through options, and select one with the active option announced', async () => {
		render(ModelSelect, { models });

		const trigger = page.getByRole('combobox', { name: 'Model override' });
		await trigger.click();

		const search = page.getByRole('combobox', { name: 'Search models' });
		await expect.element(search).toBeInTheDocument();

		await userEvent.keyboard('{ArrowDown}');
		await userEvent.keyboard('{ArrowDown}');

		const activeId = await search.element().getAttribute('aria-activedescendant');
		expect(activeId).not.toBeNull();
		const activeOption = document.getElementById(activeId!);
		expect(activeOption?.getAttribute('role')).toBe('option');
		expect(activeOption?.textContent).toContain('GPT-4o mini');

		await userEvent.keyboard('{Enter}');

		await expect.element(trigger).toHaveTextContent('GPT-4o mini');
		await expect.element(page.getByRole('listbox')).not.toBeInTheDocument();
	});

	it('shows an explicit empty state alongside the custom model option when a search matches nothing', async () => {
		render(ModelSelect, { models });

		await page.getByRole('combobox', { name: 'Model override' }).click();
		const search = page.getByRole('combobox', { name: 'Search models' });
		await userEvent.type(search.element() as HTMLElement, 'zzz-no-such-model');

		await expect
			.element(page.getByText('No models match “zzz-no-such-model”.'))
			.toBeInTheDocument();
		const options = page.getByRole('option');
		expect(options.elements()).toHaveLength(1);
		await expect.element(page.getByRole('option', { name: /Custom model/ })).toBeInTheDocument();
	});

	it('lets a user enter a custom model id', async () => {
		render(ModelSelect, { models });

		await page.getByRole('combobox', { name: 'Model override' }).click();
		await page.getByRole('option', { name: /Custom model/ }).click();

		const customInput = page.getByLabelText('Custom model id');
		await expect.element(customInput).toBeInTheDocument();
		await userEvent.type(customInput.element() as HTMLElement, 'vendor/my-model');
		await expect.element(customInput).toHaveValue('vendor/my-model');
	});

	it('surfaces a load error with a retry action instead of an empty listbox', async () => {
		const onretry = () => {};
		render(ModelSelect, { models: [], loadError: 'The model list could not be loaded.', onretry });

		await page.getByRole('combobox', { name: 'Model override' }).click();

		await expect.element(page.getByText('The model list could not be loaded.')).toBeInTheDocument();
		await expect.element(page.getByRole('listbox')).not.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Retry loading models' }))
			.toBeInTheDocument();
	});
});
