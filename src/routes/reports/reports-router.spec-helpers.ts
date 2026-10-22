// A stand-in for the SvelteKit router over the /reports routes, so a spec can
// follow the steps the way the browser does: the real layout load runs on every
// navigation (redirecting replaces the entry), `goto` pushes or replaces, and
// `back()` is the browser's Back button. Test-only: nothing in the app imports this.

import { isRedirect } from '@sveltejs/kit';
import { vi } from 'vitest';
import { goto } from '$app/navigation';
import type { ReportStep } from '$lib/marksheet/report-steps.js';
import { load } from './+layout.js';

export class TestRouter {
	history: string[];
	index = 0;
	/** What the layout load last returned: the step the page shows. */
	step: ReportStep | null = null;
	onchange: () => void = () => {};

	constructor(initial: string) {
		this.history = [initial];
	}

	get path(): string {
		return this.history[this.index];
	}

	/** The history entries the teacher could walk back through, oldest first. */
	get entries(): string[] {
		return this.history.slice(0, this.index + 1);
	}

	/** Run the layout load for the current entry, replacing it for as long as the load redirects. */
	async settle(): Promise<void> {
		for (;;) {
			try {
				const data = await load({
					url: new URL(this.path, 'http://localhost'),
					parent: async () => ({})
				});
				this.step = data.step;
				this.onchange();
				return;
			} catch (thrown) {
				if (!isRedirect(thrown)) throw thrown;
				this.history[this.index] = thrown.location;
			}
		}
	}

	/** Install this router as `goto`: a call pushes, or replaces with `replaceState`. */
	install(): void {
		vi.mocked(goto).mockImplementation(async (url, options) => {
			const next = String(url);
			if (options?.replaceState) this.history[this.index] = next;
			else {
				this.history = [...this.entries, next];
				this.index += 1;
			}
			await this.settle();
		});
	}

	async back(): Promise<void> {
		this.index -= 1;
		await this.settle();
	}
}
