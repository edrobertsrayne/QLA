// What the report steps share while the teacher moves between them: the run,
// the model choice, the roster and the printer. The /reports layout creates it
// and every step page reads it, so none of it is lost on a step change.

import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { createContext, tick } from 'svelte';
import { ModelList } from '$lib/components/parse/model-list.svelte.js';
import type { MarksheetStore } from '$lib/marksheet/store.svelte.js';
import type { ReportStep } from '$lib/marksheet/report-steps.js';
import { reportRoster, rowsOf, type RosterRow } from './report-roster.js';
import { ReportRun } from './report-run.svelte.js';

/**
 * Open a step. The teacher's own moves push a history entry, so Back walks
 * the steps.
 */
export function goToStep(step: ReportStep): void {
	void goto(resolve(`/reports/${step}`));
}

/** Open a step in place of the current entry, for moves the app makes on its own. */
export function replaceWithStep(step: ReportStep): void {
	void goto(resolve(`/reports/${step}`), { replaceState: true });
}

export class ReportsFlow {
	readonly models = new ModelList();
	readonly run: ReportRun;
	readonly roster: RosterRow[];
	/** Reports the teacher can see: written and still eligible. */
	readonly reviewIds: string[];

	modelOverride = $state('');
	modelCustom = $state(false);
	/** Pages the printer gets; null means not printing, so every visible page shows for measuring. */
	printing = $state<string[] | null>(null);

	constructor(store: MarksheetStore) {
		// A finished run takes the teacher to Review on its own.
		this.run = new ReportRun(store, () => replaceWithStep('review'));
		this.roster = $derived(store.document ? reportRoster(store.document, this.run.tiles) : []);
		this.reviewIds = $derived(rowsOf(this.roster, 'review').map((row) => row.studentId));
	}

	writeNew(ids: string[]): void {
		if (this.modelCustom) this.modelOverride = this.modelOverride.trim();
		goToStep('writing');
		this.run.start(ids, this.modelOverride);
	}

	writeAgain(ids: string[]): void {
		goToStep('writing');
		this.run.retry(ids, this.modelOverride);
	}

	rewriteHere(ids: string[]): void {
		if (ids.length > 0) this.run.retry(ids, this.modelOverride);
	}

	async print(ids: string[]): Promise<void> {
		this.printing = ids;
		await tick();
		window.print();
	}
}

export const [reportsFlow, provideReportsFlow] = createContext<ReportsFlow>();
