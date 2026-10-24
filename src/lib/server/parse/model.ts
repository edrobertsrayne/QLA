// Live model transport for the parse slice (issue #11).
//
// A classroom teacher's Run calls a real configurable model through the
// stateless server proxy — GPT-6 Luna by default with a per-run override —
// and every response tells the teacher what the run spent. The HTTP call,
// status map, timeout and usage log are the one transport in
// `../openrouter.ts` (issue #122); this module only builds parse's own
// payload and hands back the model's JSON text. Retry policy stays with the
// caller: the route retries parse's own unparseable output once, and the
// transport never retries internally.
//
// The OpenRouter API key is held server-side only (never in the browser).
// Tests inject behaviour via `setModelTransport`; production uses the live
// OpenRouter transport by default.

import type { ParseUsage } from './schema';
import { buildHybridPayload } from './pdf';
import { postOpenRouter } from '../openrouter';

/** One ingested PDF forwarded to the model transport (hybrid dual-input). */
export interface IngestedDocument {
	filename: string;
	pageCount: number;
	/** Per-page extracted text joined with `[p.N]` markers (ordering ground truth). */
	text: string;
	/** Raw PDF as base64, only populated when the run will attach it natively. */
	pdfBase64: string | null;
}

/** Inputs the route forwards to the model transport. */
export interface ModelInput {
	modelOverride?: string;
	/** Effective model id (override, env, or `DEFAULT_MODEL_ID`). */
	modelId: string;
	/** False when the override lacks native PDF support → text-only + warning. */
	useNativePdf: boolean;
	paper?: IngestedDocument;
	markscheme?: IngestedDocument;
	/** Optional exam specification, fetched server-side per run (no cache). */
	spec?: IngestedDocument;
}

/** Raw model result: unparsed JSON plus usage for the response. */
export interface ModelResult {
	rawJson: string;
	usage: ParseUsage;
}

export type ModelTransport = (input: ModelInput) => Promise<ModelResult>;

/**
 * Live OpenRouter transport: parse's hybrid payload (max_tokens 4000, native
 * PDF parts when the model supports them) through the shared HTTP transport.
 */
export async function liveTransport(input: ModelInput): Promise<ModelResult> {
	const result = await postOpenRouter({
		payload: buildHybridPayload({
			modelId: input.modelId,
			useNativePdf: input.useNativePdf,
			paperText: input.paper?.text ?? null,
			markschemeText: input.markscheme?.text ?? null,
			specText: input.spec?.text ?? null,
			paperFilename: input.paper?.filename ?? null,
			markschemeFilename: input.markscheme?.filename ?? null,
			specFilename: input.spec?.filename ?? null,
			paperPdfBase64: input.paper?.pdfBase64 ?? null,
			markschemePdfBase64: input.markscheme?.pdfBase64 ?? null,
			specPdfBase64: input.spec?.pdfBase64 ?? null
		}),
		caller: { referer: 'https://qla.local/parse', title: 'QLA Phase 1 Parse' }
	});
	return { rawJson: result.content, usage: result.usage };
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

export function callModel(input: ModelInput): Promise<ModelResult> {
	return transport(input);
}
