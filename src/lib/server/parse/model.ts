// Live model transport for the parse slice (issue #11).
//
// A classroom teacher's Run calls a real configurable model through the
// stateless server proxy — Gemini Flash by default with a per-run override —
// and every response tells the teacher what the run spent. Transient
// model-output slips are absorbed by a single silent server-side retry (in the
// route); transient outages and fatal misconfiguration are distinguishable at
// a glance (502 retryable vs 500 fatal).
//
// The OpenRouter API key is held server-side only (never in the browser).
// Tests inject behaviour via `setModelTransport`; production uses the live
// OpenRouter transport by default.

import type { Breakdown, ParseUsage } from './schema';
import { OPENROUTER_MAX_TOKENS, OPENROUTER_TIMEOUT_MS, buildHybridPayload } from './pdf';

/** One ingested PDF forwarded to the model transport (hybrid dual-input). */
export interface IngestedDocument {
	filename: string;
	pageCount: number;
	/** Per-page extracted text joined with `[p.N]` markers (ordering ground truth). */
	text: string;
	/** Raw PDF as base64 (the route attaches it natively when the model supports it). */
	pdfBase64: string;
}

/** Inputs the route forwards to the model transport. */
export interface ModelInput {
	board: string;
	subject: string;
	tier: string;
	specUrl: string;
	modelOverride?: string;
	/** Effective model id (override or Gemini Flash default). */
	modelId: string;
	/** False when the override lacks native PDF support → text-only + warning. */
	useNativePdf: boolean;
	paper: IngestedDocument;
	markscheme: IngestedDocument;
	/** Pinned catalogue codes the breakdown is validated against (prompt hint). */
	specCodes?: string[];
}

/** Raw model result: unparsed JSON plus usage for the response. */
export interface ModelResult {
	rawJson: string;
	usage: ParseUsage;
}

export type ModelTransport = (input: ModelInput) => Promise<ModelResult>;

/** OpenRouter chat-completions endpoint (server-side only). */
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Fatal-but-retryable code when OpenRouter 429/5xx or a transient fault hits. */
export const MODEL_RETRYABLE_CODE = 'MODEL_RETRYABLE';

/** Fatal code when the model call fails for a non-retryable reason. */
export const MODEL_ERROR_CODE = 'MODEL_ERROR';

/** Transient upstream failure (429/5xx, timeout, network blip) → route maps to 502. */
export class ModelRetryableError extends Error {
	readonly code = MODEL_RETRYABLE_CODE;
	readonly retryable = true as const;
	readonly status?: number;
	constructor(message: string, options?: { status?: number; cause?: unknown }) {
		super(message, options ? { cause: options.cause } : undefined);
		this.name = 'ModelRetryableError';
		this.status = options?.status;
	}
}

/** Non-retryable model failure → route maps to 500. */
export class ModelFatalError extends Error {
	readonly code = MODEL_ERROR_CODE;
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = 'ModelFatalError';
	}
}

/** Fetch seam for the live transport (tests inject a mocked fetch). */
export type OpenRouterFetch = (url: string, init?: RequestInit) => Promise<Response>;

let openRouterFetch: OpenRouterFetch = (url, init) => fetch(url, init);

/** Test seam: replace the OpenRouter fetch implementation. */
export function setOpenRouterFetch(fn: OpenRouterFetch): void {
	openRouterFetch = fn;
}

/** Restore the default global-fetch implementation. */
export function resetOpenRouterFetch(): void {
	openRouterFetch = (url, init) => fetch(url, init);
}

/** Zero usage reported by the stub (no real model is called in the skeleton). */
export function stubUsage(): ParseUsage {
	return { promptTokens: 0, completionTokens: 0, totalTokens: 0, estCost: 0 };
}

/**
 * Deterministic fixture breakdown for the skeleton slice.
 * Schema-valid with zero warnings: totalMarks equals the sum of marks and
 * every spec code is in `STUB_SPEC_CATALOGUE`. The route pins `specRef`.
 */
export function stubBreakdown(): Omit<Breakdown, 'specRef'> {
	return {
		paperId: 'STUB-PAPER-1',
		paperTitle: 'Stub assessment paper',
		year: 2023,
		totalMarks: 9,
		questions: [
			{
				number: '01.1',
				marks: 1,
				specCodes: ['4.6.1.1'],
				questionText: 'Transverse wave oscillation direction',
				ao: ['AO1'],
				commandWord: 'Complete',
				isCalculation: false,
				isWorkingScientifically: false
			},
			{
				number: '01.2',
				marks: 6,
				specCodes: ['4.6.2.2'],
				questionText: 'Method for infrared RPA',
				ao: ['AO1', 'AO3'],
				commandWord: 'Describe',
				isCalculation: false,
				isWorkingScientifically: true
			},
			{
				number: '01.3',
				marks: 2,
				specCodes: ['4.6.3.1'],
				questionText: 'Tick box plus reason',
				ao: ['AO2', 'AO1'],
				commandWord: 'Tick + reason',
				isCalculation: false,
				isWorkingScientifically: true
			}
		]
	};
}

/**
 * Rough per-1M-token prices (USD) used only for the `estCost` hint shown on
 * every response. The ~$0.014/run anchor is the observed Gemini Flash cost for
 * a full GCSE paper — other models fall back to generic rates so the hint
 * stays present, never exact billing.
 */
function priceFor(modelId: string): { input: number; output: number } {
	const id = modelId.toLowerCase();
	if (id.includes('gemini-flash')) return { input: 0.075, output: 0.3 };
	if (id.includes('gemini')) return { input: 0.1, output: 0.4 };
	if (id.includes('claude')) return { input: 3, output: 15 };
	if (id.includes('gpt-4o') || id.includes('gpt-5') || id.includes('gpt-4.1'))
		return { input: 2.5, output: 10 };
	return { input: 0.3, output: 1.2 };
}

/** Estimate run cost from token counts (display hint only, 4dp in the UI). */
export function estimateCost(
	promptTokens: number,
	completionTokens: number,
	modelId: string
): number {
	const { input, output } = priceFor(modelId);
	return (promptTokens * input + completionTokens * output) / 1_000_000;
}

/**
 * Strip markdown fences the model sometimes wraps around JSON
 * (```json ... ``` or ``` ... ```), leaving the raw JSON object text.
 */
export function extractJsonText(content: string): string {
	const trimmed = content.trim();
	const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/.exec(trimmed);
	return (fenced?.[1] ?? trimmed).trim();
}

function contentToText(content: unknown): string {
	if (typeof content === 'string') return content;
	if (Array.isArray(content)) {
		return content
			.map((part) => {
				if (typeof part === 'string') return part;
				if (part !== null && typeof part === 'object') {
					const text = (part as Record<string, unknown>)['text'];
					if (typeof text === 'string') return text;
				}
				return '';
			})
			.join('');
	}
	return '';
}

/**
 * Live OpenRouter transport: real configurable model call through the server
 * proxy with the key held server-side only. Guardrails: `max_tokens` 4000
 * (in the payload) and a 120s timeout so a full GCSE paper completes in one
 * run. Maps 429/5xx to `ModelRetryableError` (route → 502); everything else
 * non-OK becomes `ModelFatalError` (route → 500).
 */
export async function liveTransport(input: ModelInput): Promise<ModelResult> {
	const apiKey = process.env.OPENROUTER_API_KEY;
	if (!apiKey) {
		throw new ModelFatalError(
			'Server is missing its OpenRouter API key. The problem is server-side, not with your inputs.'
		);
	}

	const payload = buildHybridPayload({
		modelId: input.modelId,
		useNativePdf: input.useNativePdf,
		paperText: input.paper.text,
		markschemeText: input.markscheme.text,
		paperFilename: input.paper.filename,
		markschemeFilename: input.markscheme.filename,
		paperPdfBase64: input.paper.pdfBase64,
		markschemePdfBase64: input.markscheme.pdfBase64,
		specCodes: input.specCodes
	});

	// Guardrail: max_tokens lives in the payload (asserted in tests);
	// the timeout below aborts a hung upstream after 120s.
	void OPENROUTER_MAX_TOKENS;

	let response: Response;
	try {
		response = await openRouterFetch(OPENROUTER_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`,
				'HTTP-Referer': 'https://qla.local/parse',
				'X-Title': 'QLA Phase 1 Parse'
			},
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS)
		});
	} catch (error) {
		// Timeout / network blip: transient, retryable at a glance.
		if (error instanceof Error && error.name === 'TimeoutError') {
			throw new ModelRetryableError('The model call timed out after 120s. Please try again.', {
				cause: error
			});
		}
		if (error instanceof Error && error.name === 'AbortError') {
			throw new ModelRetryableError('The model call was aborted after 120s. Please try again.', {
				cause: error
			});
		}
		throw new ModelRetryableError('The model call failed. Please try again.', {
			cause: error
		});
	}

	if (!response.ok) {
		const status = response.status;
		if (status === 429 || status >= 500) {
			throw new ModelRetryableError(
				`The model provider is temporarily unavailable (status ${status}). Please try again.`,
				{ status }
			);
		}
		let detail = '';
		try {
			detail = (await response.text()).slice(0, 300);
		} catch {
			// Ignore body-read failures; status alone is enough.
		}
		throw new ModelFatalError(
			`The model call failed with status ${status}.${detail ? ` ${detail}` : ''}`
		);
	}

	let body: {
		choices?: Array<{ message?: { content?: unknown } }>;
		usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
	};
	try {
		body = (await response.json()) as typeof body;
	} catch (error) {
		throw new ModelFatalError('The model returned an unreadable response. Please try again.', {
			cause: error
		});
	}

	const rawContent = contentToText(body.choices?.[0]?.message?.content ?? '');
	if (rawContent.trim() === '') {
		throw new ModelFatalError('The model returned an empty response. Please try again.');
	}

	const promptTokens = Math.max(0, Math.trunc(body.usage?.prompt_tokens ?? 0));
	const completionTokens = Math.max(0, Math.trunc(body.usage?.completion_tokens ?? 0));
	const totalTokens =
		Math.max(0, Math.trunc(body.usage?.total_tokens ?? promptTokens + completionTokens)) ||
		promptTokens + completionTokens;
	const usage: ParseUsage = {
		promptTokens,
		completionTokens,
		totalTokens,
		estCost: estimateCost(promptTokens, completionTokens, input.modelId)
	};

	return { rawJson: extractJsonText(rawContent), usage };
}

async function defaultStubTransport(): Promise<ModelResult> {
	return { rawJson: JSON.stringify(stubBreakdown()), usage: stubUsage() };
}

// Default is the live model call. Tests replace it via `setModelTransport`.
let transport: ModelTransport = liveTransport;

/** Test seam: replace the model transport for contract tests. */
export function setModelTransport(fn: ModelTransport): void {
	transport = fn;
}

/** Restore the live transport (production default). */
export function resetModelTransport(): void {
	transport = liveTransport;
}

/** Test seam: install the deterministic stub transport. */
export function setStubTransport(): void {
	transport = defaultStubTransport;
}

export function callModel(input: ModelInput): Promise<ModelResult> {
	return transport(input);
}
