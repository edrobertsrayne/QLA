// The curated model list behind `ModelSelect`: one loader for every page that
// offers a model override.
import type { ModelOption } from './ModelSelect.svelte';

export class ModelList {
	options = $state<ModelOption[]>([]);
	loading = $state(false);
	error = $state<string | null>(null);

	/** Fetch the curated list; true when it arrived. On failure the server default still works. */
	async load(): Promise<boolean> {
		this.loading = true;
		this.error = null;
		try {
			const response = await fetch('/api/models');
			if (!response.ok) throw new Error(`status ${response.status}`);
			const body = (await response.json()) as { models?: ModelOption[] };
			this.options = Array.isArray(body.models) ? body.models : [];
			return true;
		} catch {
			this.error = 'The model list could not be loaded. Server default still works.';
			this.options = [];
			return false;
		} finally {
			this.loading = false;
		}
	}
}
