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
import { downloadReports, type ReportDownload } from './report-pdf.js';
import { toastPdfFailure } from '$lib/print-pdf.js';
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
	/** Pages the printer gets; null means not printing, so every visible page shows for measuring. */
	printing = $state<string[] | null>(null);
	/** The print copies of the visible pages, which a PDF is made from; set by the layout's `PrintRoot`. */
	printRoot = $state<HTMLElement>();
	/** The PDF being made, or null when none is. */
	downloading = $state<ReportDownload | null>(null);

	/** False once the teacher has left /reports: a run still finishing there moves no one. */
	#attached = true;

	readonly #store: MarksheetStore;

	constructor(store: MarksheetStore) {
		this.#store = store;
		// A finished run takes the teacher to Review on its own, while they are still in /reports.
		this.run = new ReportRun(store, () => {
			if (this.#attached) replaceWithStep('review');
		});
		this.roster = $derived(store.document ? reportRoster(store.document, this.run.tiles) : []);
		this.reviewIds = $derived(rowsOf(this.roster, 'review').map((row) => row.studentId));
	}

	/** The teacher has left /reports. The run keeps writing into the store, but navigates nowhere. */
	detach(): void {
		this.#attached = false;
	}

	writeNew(ids: string[]): void {
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

	async download(request: ReportDownload): Promise<void> {
		this.downloading = request;
		try {
			await toastPdfFailure(() => {
				const document = this.#store.document;
				if (!document || !this.printRoot) {
					throw new Error('The report pages are not ready to download');
				}
				// A timestamp for the file name, not reactive state.
				// eslint-disable-next-line svelte/prefer-svelte-reactivity
				return downloadReports(this.printRoot, document, request, new Date());
			});
		} finally {
			this.downloading = null;
		}
	}
}

export const [reportsFlow, provideReportsFlow] = createContext<ReportsFlow>();
