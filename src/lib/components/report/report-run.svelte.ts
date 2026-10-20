// One run of report writing: a queue of students, at most CONCURRENCY requests
// in flight, up to MAX_ATTEMPTS tries each. A finished report is stored the
// moment it arrives, so Stop (or a run-stopping error) keeps everything already
// written. Retries follow the response's `retryable` flag and wait out
// `retryAfter`: only INVALID_REPORT_INPUT-style answers fail a student at once.
import { isRecord } from '$lib/parse/is-breakdown.js';
import { generationInputFor } from '$lib/marksheet/report-input.js';
import type { MarksheetStore } from '$lib/marksheet/store.svelte.js';

/** Most requests in flight at once. */
export const CONCURRENCY = 5;

/** Tries per student before their tile fails. */
export const MAX_ATTEMPTS = 3;

/** Backoff between tries: `min(8 s, 1 s × 2^n)` plus jitter, honouring `retryAfter`. */
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 8000;
const JITTER_MS = 250;

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
	readonly retryable: boolean;
	readonly retryAfterSeconds?: number;
	constructor(
		message: string,
		options: { code?: string | null; retryable?: boolean; retryAfterSeconds?: number } = {}
	) {
		super(message);
		this.code = options.code ?? null;
		this.retryable = options.retryable ?? false;
		this.retryAfterSeconds = options.retryAfterSeconds;
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
	let retryable = false;
	let retryAfterSeconds: number | undefined;
	try {
		const body: unknown = await response.json();
		const error = isRecord(body) ? body['error'] : null;
		if (isRecord(error)) {
			if (typeof error['code'] === 'string') code = error['code'];
			if (typeof error['message'] === 'string' && error['message'] !== '')
				message = error['message'];
			// Only an explicit flag retries: anything else fails the student at once.
			retryable = error['retryable'] === true;
			const wait = error['retryAfter'];
			retryAfterSeconds =
				typeof wait === 'number' && Number.isFinite(wait) && wait >= 0 ? wait : undefined;
		}
	} catch {
		// The status line above is all there is to say.
	}
	return new RequestFailure(message, { code, retryable, retryAfterSeconds });
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
		this.#launch([...studentIds], modelOverride);
	}

	/**
	 * Try these students again without touching the rest of the tiles: a retry
	 * never hides another student's failure, and the run only auto-advances
	 * when no tile anywhere is still failed.
	 */
	retry(studentIds: string[], modelOverride: string): void {
		if (this.running) return;
		this.#launch([...studentIds], modelOverride, true);
	}

	/** Run the queue: fresh tiles for a start, reset tiles for a retry. */
	#launch(studentIds: string[], modelOverride: string, keepTiles = false): void {
		if (!keepTiles) {
			this.order = studentIds;
			this.tiles = Object.fromEntries(
				studentIds.map((id) => [id, { kind: 'queued' } as TileState])
			);
		} else {
			for (const id of studentIds) {
				if (!this.order.includes(id)) this.order.push(id);
				this.tiles[id] = { kind: 'queued' };
			}
		}
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
				if (!response.ok) throw await errorFrom(response);
				const written = writtenFrom(await response.json(), modelOverride);
				if (!written)
					throw new RequestFailure('The model returned a report in an unexpected shape.', {
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
					error instanceof RequestFailure
						? error
						: new RequestFailure('The report could not be written. Check the connection.', {
								retryable: true
							});
				if (failure.code && RUN_STOPPING_CODES.has(failure.code)) {
					this.stoppedBy = failure.message;
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
