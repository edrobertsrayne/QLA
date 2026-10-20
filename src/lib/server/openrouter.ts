// Shared OpenRouter structured-output transport for the report routes
// (issue #60: `/api/report` and `/api/topic-names`).
//
// One call is one upstream request inside one timeout — the transport never
// retries internally; retry policy belongs to the caller (the browser run
// loop for reports). The system message carries the instructions; the user
// message carries only the fenced JSON data, built by the route, so the
// route can never be used as a general model proxy. Every usage object is
// logged server-side (info); request bodies and model text never are.
//
// Tests inject behaviour via `setStructuredTransport` (route-level, same
// pattern as parse's `setModelTransport`) or, one level down, via
// `setStructuredFetch`; production uses the live OpenRouter call.

import { getServerEnv } from './parse/env';
import {
	contentToText,
	extractJsonText,
	MODEL_RETRYABLE_CODE as STRUCTURED_RETRYABLE_CODE,
	OPENROUTER_URL,
	usageFrom
} from './parse/model';
import { OPENROUTER_TIMEOUT_MS } from './parse/pdf';
import type { RunStoppingCode } from '$lib/marksheet/report-errors';
import type { ParseUsage } from './parse/schema';
import { fenceDocuments } from './fence';

/** Structured-call completion cap (~8000 tokens per the spec). */
export const STRUCTURED_DEFAULT_MAX_TOKENS = 8000;

/** Missing server key → caller treats it as a run-stopping misconfiguration. */
export const MISSING_API_KEY_CODE: RunStoppingCode = 'MISSING_API_KEY';
/** Upstream 401 → caller stops the run. */
export const STRUCTURED_AUTH_CODE: RunStoppingCode = 'MODEL_AUTH';
/** Upstream 402 for anything but the in-flight budget → caller stops the run. */
export const STRUCTURED_CREDIT_CODE: RunStoppingCode = 'MODEL_CREDIT';
/** Any other upstream 4xx → caller stops the run. */
export const STRUCTURED_REJECTED_CODE: RunStoppingCode = 'MODEL_REJECTED';

/** Structured model failure: carries the spec code, `retryable` for the run loop, and `retryAfter` when upstream sent one. */
export class StructuredModelError extends Error {
	readonly code: string;
	readonly retryable: boolean;
	readonly status?: number;
	readonly retryAfter?: number;
	constructor(
		message: string,
		options: {
			code: string;
			retryable: boolean;
			status?: number;
			retryAfter?: number;
			cause?: unknown;
		}
	) {
		super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
		this.name = 'StructuredModelError';
		this.code = options.code;
		this.retryable = options.retryable;
		this.status = options.status;
		this.retryAfter = options.retryAfter;
	}
}

/** Inputs a route forwards to the structured transport. */
export interface StructuredModelInput {
	modelId: string;
	/** Instruction text; the route's locked prompt, not caller data. */
	systemPrompt: string;
	/** Caller data; serialised to JSON and fenced inside the user message. */
	data: unknown;
	/** Strict schema name for the `json_schema` response format. */
	schemaName: string;
	/** The strict JSON schema itself. */
	schema: Record<string, unknown>;
	/** Caller identity for the OpenRouter dashboard (`HTTP-Referer` / `X-Title`); each route supplies its own. */
	caller: { referer: string; title: string };
	/** Completion cap; defaults to `STRUCTURED_DEFAULT_MAX_TOKENS`. */
	maxTokens?: number;
	/** Timeout override; defaults to `OPENROUTER_TIMEOUT_MS`. */
	timeoutMs?: number;
}

/** Structured result: the extracted JSON text (for the route to parse against its schema) plus usage. */
export interface StructuredModelResult {
	content: string;
	usage: ParseUsage;
}

export type StructuredTransport = (input: StructuredModelInput) => Promise<StructuredModelResult>;

/** Fetch seam for the live transport (tests inject a mocked fetch). */
export type StructuredFetch = (url: string, init?: RequestInit) => Promise<Response>;

let structuredFetch: StructuredFetch = (url, init) => fetch(url, init);

/** Test seam: replace the structured fetch implementation. */
export function setStructuredFetch(fn: StructuredFetch): void {
	structuredFetch = fn;
}

/** Restore the default global-fetch implementation. */
export function resetStructuredFetch(): void {
	structuredFetch = (url, init) => fetch(url, init);
}

/**
 * Parse a `Retry-After` header into seconds; `undefined` when absent or
 * unusable. Accepts delay-seconds and the HTTP-date form (clamped at zero
 * when the date is already past).
 */
function retryAfterSeconds(response: Response): number | undefined {
	const raw = response.headers.get('Retry-After');
	if (raw === null) return undefined;
	const seconds = Number(raw.trim());
	if (Number.isFinite(seconds)) return Math.max(0, Math.floor(seconds));
	const date = Date.parse(raw.trim());
	if (!Number.isFinite(date)) return undefined;
	return Math.max(0, Math.floor((date - Date.now()) / 1000));
}

/**
 * True when a 402 body reports the in-flight budget (`metadata.limit_source`
 * `openrouter_in_flight_budget`) rather than a credit problem. Falls back to
 * the raw text only when the body is not JSON with an `error` object.
 */
function isInFlightBudget(bodyText: string): boolean {
	try {
		const parsed: unknown = JSON.parse(bodyText);
		if (parsed !== null && typeof parsed === 'object' && 'error' in parsed) {
			const errorBody = (parsed as { error?: unknown }).error;
			if (errorBody !== null && typeof errorBody === 'object' && 'metadata' in errorBody) {
				const metadata = (errorBody as { metadata?: unknown }).metadata;
				if (metadata !== null && typeof metadata === 'object' && 'limit_source' in metadata) {
					return (
						(metadata as { limit_source?: unknown }).limit_source === 'openrouter_in_flight_budget'
					);
				}
			}
			return false;
		}
	} catch {
		// Not JSON: fall through to the raw-text check below.
	}
	return bodyText.includes('openrouter_in_flight_budget');
}

function statusError(status: number, bodyText: string, response: Response): StructuredModelError {
	if (status === 401) {
		return new StructuredModelError('The model rejected the server credentials.', {
			code: STRUCTURED_AUTH_CODE,
			retryable: false,
			status
		});
	}
	if (status === 402) {
		if (isInFlightBudget(bodyText)) {
			return new StructuredModelError('The model provider is busy. Please try again.', {
				code: STRUCTURED_RETRYABLE_CODE,
				retryable: true,
				status,
				retryAfter: retryAfterSeconds(response)
			});
		}
		return new StructuredModelError('The model provider has no credit left.', {
			code: STRUCTURED_CREDIT_CODE,
			retryable: false,
			status
		});
	}
	if (status === 408 || status === 429 || status >= 500) {
		return new StructuredModelError(
			`The model provider is temporarily unavailable (status ${status}). Please try again.`,
			{
				code: STRUCTURED_RETRYABLE_CODE,
				retryable: true,
				status,
				retryAfter: retryAfterSeconds(response)
			}
		);
	}
	return new StructuredModelError(`The model call failed with status ${status}.`, {
		code: STRUCTURED_REJECTED_CODE,
		retryable: false,
		status
	});
}

/**
 * Live structured-output transport: one strict-`json_schema` OpenRouter call
 * with `provider.require_parameters: true`, `stream: false`, the model's
 * default reasoning (no `reasoning` override sent), and one timeout. Never
 * retries internally.
 */
export async function liveStructuredTransport(
	input: StructuredModelInput
): Promise<StructuredModelResult> {
	const apiKey = getServerEnv('OPENROUTER_API_KEY');
	if (!apiKey) {
		throw new StructuredModelError('Server is missing its OpenRouter API key.', {
			code: MISSING_API_KEY_CODE,
			retryable: false
		});
	}

	const dataJson = JSON.stringify(input.data);
	const { open, close, directive } = fenceDocuments(dataJson);
	const payload = {
		model: input.modelId,
		max_tokens: input.maxTokens ?? STRUCTURED_DEFAULT_MAX_TOKENS,
		stream: false,
		response_format: {
			type: 'json_schema',
			json_schema: { name: input.schemaName, strict: true, schema: input.schema }
		},
		provider: { require_parameters: true },
		messages: [
			{ role: 'system', content: [input.systemPrompt, directive].join('\n\n') },
			{ role: 'user', content: [{ type: 'text', text: [open, dataJson, close].join('\n') }] }
		]
	};

	let response: Response;
	try {
		response = await structuredFetch(OPENROUTER_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`,
				'HTTP-Referer': input.caller.referer,
				'X-Title': input.caller.title
			},
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(input.timeoutMs ?? OPENROUTER_TIMEOUT_MS)
		});
	} catch (error) {
		throw new StructuredModelError('The model call failed. Please try again.', {
			code: STRUCTURED_RETRYABLE_CODE,
			retryable: true,
			cause: error
		});
	}

	if (!response.ok) {
		let bodyText = '';
		try {
			bodyText = await response.text();
		} catch {
			// Ignore body-read failures; status alone is enough.
		}
		throw statusError(response.status, bodyText, response);
	}

	let body: {
		choices?: Array<{ message?: { content?: unknown }; finish_reason?: string | null }>;
		usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
	};
	try {
		body = (await response.json()) as typeof body;
	} catch (error) {
		throw new StructuredModelError('The model returned an unreadable response. Please try again.', {
			code: STRUCTURED_RETRYABLE_CODE,
			retryable: true,
			cause: error
		});
	}

	const [choice] = body.choices ?? [];
	if (choice?.finish_reason === 'length') {
		throw new StructuredModelError('The model response was cut off. Please try again.', {
			code: STRUCTURED_RETRYABLE_CODE,
			retryable: true
		});
	}
	const content = extractJsonText(contentToText(choice?.message?.content ?? '')).trim();
	if (content === '') {
		throw new StructuredModelError('The model returned an empty response. Please try again.', {
			code: STRUCTURED_RETRYABLE_CODE,
			retryable: true
		});
	}

	const usage = usageFrom(body.usage, input.modelId);
	console.info(JSON.stringify({ scope: 'structured-model', model: input.modelId, usage }));

	return { content, usage };
}

// Default is the live structured call. Tests replace it via `setStructuredTransport`.
let transport: StructuredTransport = liveStructuredTransport;

/** Test seam: replace the structured transport for route contract tests. */
export function setStructuredTransport(fn: StructuredTransport): void {
	transport = fn;
}

/** Restore the live transport (production default). */
export function resetStructuredTransport(): void {
	transport = liveStructuredTransport;
}

export function callStructuredModel(input: StructuredModelInput): Promise<StructuredModelResult> {
	return transport(input);
}
