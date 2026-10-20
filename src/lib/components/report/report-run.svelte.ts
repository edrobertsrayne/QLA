// One run of report writing: a queue of students, at most CONCURRENCY requests
// in flight, one attempt each. A finished report is stored the moment it
// arrives, so Stop (or a run-stopping error) keeps everything already written.

import { isRecord } from '$lib/parse/is-breakdown.js';
import { generationInputFor } from '$lib/marksheet/report-input.js';
import type { MarksheetStore } from '$lib/marksheet/store.svelte.js';

/** Most requests in flight at once. */
export const CONCURRENCY = 5;

/** Errors that would fail every student alike: the run stops on the first. */
const RUN_STOPPING_CODES = new Set([
	'MISSING_API_KEY',
	'MODEL_AUTH',
	'MODEL_CREDIT',
	'MODEL_REJECTED'
]);

export type TileState =
	| { kind: 'queued' }
	| { kind: 'writing' }
	| { kind: 'ready' }
	| { kind: 'failed'; message: string };

interface Written {
	strengths: string[];
	areasForImprovement: string[];
	model: string;
}

class RequestFailure extends Error {
	readonly code: string | null;
	constructor(message: string, code: string | null) {
		super(message);
		this.code = code;
	}
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** The response, guarded: anything that is not the report shape is a failure for that student. */
function writtenFrom(body: unknown, fallbackModel: string): Written | null {
	if (!isRecord(body)) return null;
	const { strengths, areasForImprovement, model } = body;
	if (!isStringArray(strengths) || !isStringArray(areasForImprovement)) return null;
	return {
		strengths,
		areasForImprovement,
		model: typeof model === 'string' && model !== '' ? model : fallbackModel
	};
}

async function errorFrom(response: Response): Promise<RequestFailure> {
	let code: string | null = null;
	let message = `The report could not be written (status ${response.status}).`;
	try {
		const body: unknown = await response.json();
		const error = isRecord(body) ? body['error'] : null;
		if (isRecord(error)) {
			if (typeof error['code'] === 'string') code = error['code'];
			if (typeof error['message'] === 'string' && error['message'] !== '')
				message = error['message'];
		}
	} catch {
		// The status line above is all there is to say.
	}
	return new RequestFailure(message, code);
}

export class ReportRun {
	readonly #store: MarksheetStore;
	readonly #onFinished: () => void;
	#abort: AbortController | null = null;

	/** Student ids in the order the tiles show them. */
	order = $state<string[]>([]);
	tiles = $state<Record<string, TileState>>({});
	running = $state(false);
	/** The one banner a run-stopping error leaves, or null. */
	stoppedBy = $state<string | null>(null);

	constructor(store: MarksheetStore, onFinished: () => void) {
		this.#store = store;
		this.#onFinished = onFinished;
	}

	/** Students finished, written or failed. */
	done = $derived(
		this.order.filter((id) => this.tiles[id]?.kind === 'ready' || this.tiles[id]?.kind === 'failed')
			.length
	);
	failed = $derived(this.order.filter((id) => this.tiles[id]?.kind === 'failed'));

	/** Write one report for each student, with the model override when one is chosen. */
	start(studentIds: string[], modelOverride: string): void {
		if (this.running) return;
		this.order = [...studentIds];
		this.tiles = Object.fromEntries(studentIds.map((id) => [id, { kind: 'queued' } as TileState]));
		this.stoppedBy = null;
		this.running = true;
		const abort = new AbortController();
		this.#abort = abort;
		const queue = [...studentIds];
		const worker = async (): Promise<void> => {
			for (;;) {
				const id = abort.signal.aborted ? undefined : queue.shift();
				if (id === undefined) return;
				this.tiles[id] = { kind: 'writing' };
				await this.#write(id, modelOverride, abort);
			}
		};

		void Promise.all(
			Array.from({ length: Math.min(CONCURRENCY, studentIds.length) }, () => worker())
		).then(() => {
			const stopped = abort.signal.aborted;
			this.running = false;
			this.#abort = null;
			// What never got going is queued again, not failed: nothing went wrong for it.
			if (!stopped && this.failed.length === 0) this.#onFinished();
		});
	}

	/** Halt the run. What has finished stays written. */
	stop(): void {
		this.#abort?.abort();
	}

	async #write(id: string, modelOverride: string, abort: AbortController): Promise<void> {
		const document = this.#store.document;
		const input = document ? generationInputFor(document, id) : null;
		if (!input) {
			this.tiles[id] = { kind: 'failed', message: 'This student can no longer have a report.' };
			return;
		}
		try {
			const response = await fetch('/api/report', {
				method: 'POST',
				signal: abort.signal,
				body: JSON.stringify({ ...input, ...(modelOverride ? { model: modelOverride } : {}) })
			});
			if (!response.ok) throw await errorFrom(response);
			const written = writtenFrom(await response.json(), modelOverride);
			if (!written)
				throw new RequestFailure('The model returned a report in an unexpected shape.', null);
			this.#store.storeReport(
				id,
				{ strengths: written.strengths, areasForImprovement: written.areasForImprovement },
				input,
				written.model
			);
			this.tiles[id] = { kind: 'ready' };
		} catch (error) {
			if (abort.signal.aborted) {
				this.tiles[id] = { kind: 'queued' };
				return;
			}
			const failure =
				error instanceof RequestFailure
					? error
					: new RequestFailure('The report could not be written. Check the connection.', null);
			if (failure.code && RUN_STOPPING_CODES.has(failure.code)) {
				this.stoppedBy = failure.message;
				this.tiles[id] = { kind: 'queued' };
				abort.abort();
				return;
			}
			this.tiles[id] = { kind: 'failed', message: failure.message };
		}
	}
}
