// One run of report writing: a queue of students, at most CONCURRENCY requests
// in flight, up to MAX_ATTEMPTS tries each. A finished report is stored the
// moment it arrives, so Stop (or a run-stopping error) keeps everything already
// written. Retries follow the response's `retryable` flag and wait out
// `retryAfter`: only INVALID_REPORT_INPUT-style answers fail a student at once.
import { isRecord } from '$lib/parse/is-breakdown.js';
import { generationInputFor } from '$lib/marksheet/report-input.js';
import { isRunStoppingCode } from '$lib/marksheet/report-errors.js';
import { ApiFailure, failureFrom } from '$lib/api-error.js';
import type { MarksheetStore } from '$lib/marksheet/store.svelte.js';

/** Most requests in flight at once. */
const CONCURRENCY = 5;

/** Tries per student before their tile fails. */
const MAX_ATTEMPTS = 3;

/** Backoff between tries: `min(8 s, 1 s × 2^n)` plus jitter, honouring `retryAfter`. */
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 8000;
const JITTER_MS = 250;

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

/** `min(8 s, 1 s × 2^n)` after the nth failed try, plus jitter. */
function backoffMs(failedTry: number): number {
	return (
		Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (failedTry - 1)) + Math.random() * JITTER_MS
	);
}

/** The rejection a Stop hands to whatever wait it cuts short. */
function stopped(): DOMException {
	return new DOMException('The run was stopped.', 'AbortError');
}

/** Abortable sleep: a Stop during backoff lands the tile back on Queued, not Failed. */
function sleepUnlessStopped(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(stopped());
			return;
		}
		const timer = setTimeout(() => {
			signal.removeEventListener('abort', onAbort);
			resolve();
		}, ms);
		const onAbort = (): void => {
			clearTimeout(timer);
			reject(stopped());
		};
		signal.addEventListener('abort', onAbort, { once: true });
	});
}

/** Where the run stands: a halted run carries the one banner a run-stopping error leaves. */
export type RunPhase = { kind: 'idle' } | { kind: 'running' } | { kind: 'halted'; message: string };

export class ReportRun {
	readonly #store: MarksheetStore;
	readonly #onFinished: () => void;
	#abort: AbortController | null = null;

	/** Student ids in the order the tiles show them. */
	order = $state<string[]>([]);
	tiles = $state<Record<string, TileState>>({});
	phase = $state<RunPhase>({ kind: 'idle' });
	running = $derived(this.phase.kind === 'running');
	/** The run-stopping error of the run in flight; becomes the halted phase once every worker settles. */
	#haltedBy: string | null = null;

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
		this.#run([...studentIds], modelOverride);
	}

	/**
	 * Try these students again without touching the rest of the tiles: a retry
	 * never hides another student's failure, and the run only auto-advances
	 * when no tile anywhere is still failed.
	 */
	retry(studentIds: string[], modelOverride: string): void {
		if (this.running) return;
		for (const id of studentIds) {
			if (!this.order.includes(id)) this.order.push(id);
			this.tiles[id] = { kind: 'queued' };
		}
		this.#run([...studentIds], modelOverride);
	}

	/** Work the queue with up to CONCURRENCY workers until it drains or a Stop lands. */
	#run(queue: string[], modelOverride: string): void {
		this.phase = { kind: 'running' };
		this.#haltedBy = null;
		const abort = new AbortController();
		this.#abort = abort;
		const worker = async (): Promise<void> => {
			for (;;) {
				const id = abort.signal.aborted ? undefined : queue.shift();
				if (id === undefined) return;
				this.tiles[id] = { kind: 'writing' };
				await this.#write(id, modelOverride, abort);
			}
		};

		void Promise.all(
			Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker())
		).then(() => {
			this.#abort = null;
			const stopped = abort.signal.aborted;
			this.phase = this.#haltedBy ? { kind: 'halted', message: this.#haltedBy } : { kind: 'idle' };
			// A retry still leaves other tiles alone: only advance when nothing failed.
			if (!stopped && this.failed.length === 0) this.#onFinished();
		});
	}

	/** Halt the run. What has finished stays written. */
	stop(): void {
		this.#abort?.abort();
	}

	/** Back to Queued: nothing went wrong for this student, the run just ended around them. */
	#park(id: string): void {
		this.tiles[id] = { kind: 'queued' };
	}

	async #write(id: string, modelOverride: string, abort: AbortController): Promise<void> {
		const document = this.#store.document;
		const input = document ? generationInputFor(document, id) : null;
		if (!input) {
			this.tiles[id] = { kind: 'failed', message: 'This student can no longer have a report.' };
			return;
		}
		for (let attempt = 1; ; attempt += 1) {
			try {
				const response = await fetch('/api/report', {
					method: 'POST',
					signal: abort.signal,
					body: JSON.stringify({ ...input, ...(modelOverride ? { model: modelOverride } : {}) })
				});
				if (!response.ok)
					throw await failureFrom(
						response,
						`The report could not be written (status ${response.status}).`
					);
				const written = writtenFrom(await response.json(), modelOverride);
				if (!written)
					throw new ApiFailure('The model returned a report in an unexpected shape.', {
						retryable: true
					});
				this.#store.storeReport(
					id,
					{ strengths: written.strengths, areasForImprovement: written.areasForImprovement },
					input,
					written.model
				);
				this.tiles[id] = { kind: 'ready' };
				return;
			} catch (error) {
				if (abort.signal.aborted) {
					this.#park(id);
					return;
				}
				// Anything but our own abort is transient until the envelope says otherwise.
				const failure =
					error instanceof ApiFailure
						? error
						: new ApiFailure('The report could not be written. Check the connection.', {
								retryable: true
							});
				if (failure.code && isRunStoppingCode(failure.code)) {
					this.#haltedBy = failure.message;
					this.#park(id);
					abort.abort();
					return;
				}
				if (!failure.retryable || attempt >= MAX_ATTEMPTS) {
					this.tiles[id] = { kind: 'failed', message: failure.message };
					return;
				}
				const waitMs = Math.max(backoffMs(attempt), (failure.retryAfterSeconds ?? 0) * 1000);
				try {
					await sleepUnlessStopped(waitMs, abort.signal);
				} catch {
					this.#park(id);
					return;
				}
			}
		}
	}
}
