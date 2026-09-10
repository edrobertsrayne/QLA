// Hybrid PDF ingestion for Phase 1 Parse (issue #9).
//
// Server extracts per-page text with `unpdf` (deterministic, works with any
// per-run model) AND forwards the original PDFs natively (`engine: 'native'`
// on the Gemini Flash default) in the same OpenRouter call, so layout,
// tables, emphasis and diagrams ground the breakdown. If the per-run override
// model lacks native file support, the route degrades to text-only with a
// visible diagram-unverified warning — never a silent paid-OCR fallback and
// never a silent hallucination.
//
// Grounding: AQA 84632H June 2023 — question paper 44pp/2.4MB with ~100
// diagram images, markscheme 26pp/0.5MB where tables + bold/underline flatten
// in plain text. See `docs/research/pdf-ingestion.md` (research branch
// `research/pdf-ingestion`, throwaway, not merged).

import { extractText } from 'unpdf';
import type { ParseWarning } from './schema';
import { getEnvDefaultModel } from './env';

/** Default model when no per-run override is given (Gemini Flash via OpenRouter). */
export const DEFAULT_MODEL_ID = 'google/gemini-2.5-flash';

/** Guardrail: cap completion so a full GCSE paper completes in one run. */
export const OPENROUTER_MAX_TOKENS = 4000;

/** Guardrail: server timeout so a full GCSE paper completes in one run. */
export const OPENROUTER_TIMEOUT_MS = 120_000;

/** Warning code for the text-only degradation path. */
export const DIAGRAM_UNVERIFIED_CODE = 'DIAGRAM_UNVERIFIED';

/** Resolve the effective model id: trimmed override or the Gemini Flash default. */
export function resolveModelId(modelOverride?: string): string {
	const trimmed = modelOverride?.trim();
	if (trimmed) return trimmed;
	const envDefault = getEnvDefaultModel();
	return envDefault ? envDefault : DEFAULT_MODEL_ID;
}

/**
 * Whether a model id supports native PDF file input through OpenRouter.
 * The default (no override → Gemini Flash) always supports native.
 * Overrides match a small allowlist of known multimodal families; anything
 * else degrades to text-only rather than risking the silent `mistral-ocr`
 * paid fallback (which is what OpenRouter picks when `engine` is unset on a
 * non-multimodal model).
 */
export function supportsNativePdf(modelId: string): boolean {
	return /gemini|claude|gpt-4o|gpt-4\.1|gpt-5|sonnet|opus|haiku/i.test(modelId);
}

/** Deterministic text extraction of one PDF. */
export interface ParsedPdf {
	pageCount: number;
	textPerPage: string[];
	textWithMarkers: string;
}

/**
 * Extract per-page text from raw PDF bytes.
 * Returns pages in order plus a `[p.N]`-marked concatenation for the prompt
 * (text is the ordering ground truth; the native PDF attach is authoritative
 * for figures/tables/emphasis). Throws on unreadable input — the route maps
 * that to a 400 before any model call.
 */
export async function parsePdfBytes(bytes: Uint8Array): Promise<ParsedPdf> {
	let totalPages: number;
	let text: string | string[];
	try {
		const result = await extractText(bytes, { mergePages: false });
		totalPages = result.totalPages;
		text = result.text;
	} catch (error) {
		throw new Error(
			`PDF could not be read: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error }
		);
	}
	const textPerPage = (Array.isArray(text) ? text : [text]).map((page) =>
		typeof page === 'string' ? page : String(page ?? '')
	);
	if (!Number.isInteger(totalPages) || totalPages < 1) {
		throw new Error('PDF could not be read: no pages found.');
	}
	const textWithMarkers = textPerPage
		.map((pageText, index) => `[p.${index + 1}]\n${pageText.trim()}`)
		.join('\n\n');
	return { pageCount: totalPages, textPerPage, textWithMarkers };
}

/** Visible warning for the text-only degradation path (HTTP 200, breakdown intact). */
export function buildDiagramUnverifiedWarning(): ParseWarning {
	return {
		questionId: null,
		code: DIAGRAM_UNVERIFIED_CODE,
		message:
			'Override model lacks native PDF support — breakdown is text-only; diagram and table-heavy questions are unverified.'
	};
}

/** Encode raw PDF bytes as an OpenRouter `file_data` data URL. */
export function toPdfDataUrl(base64: string): string {
	return `data:application/pdf;base64,${base64}`;
}

export interface HybridPayloadInput {
	modelId: string;
	useNativePdf: boolean;
	paperText: string | null;
	markschemeText: string | null;
	/** Optional spec text; absent when the run supplies no specification link. */
	specText?: string | null;
	paperFilename: string | null;
	markschemeFilename: string | null;
	specFilename?: string | null;
	paperPdfBase64: string | null;
	markschemePdfBase64: string | null;
	specPdfBase64?: string | null;
}

export interface HybridPayload {
	model: string;
	max_tokens: number;
	messages: unknown[];
	plugins?: Array<{ id: string; pdf: { engine: string } }>;
}

/**
 * Prompt wording is builder detail derived from the locked v1 schema
 * (never asserted in tests beyond key phrases). It instructs the
 * model to return ONLY the breakdown JSON — no markdown, no explanation.
 */
export function buildPromptText(input: {
	paperText: string | null;
	markschemeText: string | null;
	/** Optional spec text; absent when the run supplies no specification link. */
	specText?: string | null;
	useNativePdf: boolean;
}): string {
	const nativeHint = input.useNativePdf
		? 'The extracted text below is the ordering ground truth; attached PDFs are authoritative for figures, tables, bold/underline emphasis and diagram questions.'
		: 'No native PDF is attached — work from the extracted text only; diagram and table-heavy questions are unverified.';
	const paperSection = input.paperText ?? '(no assessment paper provided)';
	const markschemeSection = input.markschemeText ?? '(no markscheme provided)';
	const specSection = input.specText ?? '(no specification provided)';
	return [
		'Parse the assessment paper and/or markscheme into the v1 per-question JSON breakdown.',
		'Return ONLY a single JSON object — no markdown fences, no commentary.',
		nativeHint,
		'The specification below is extra grounding only: specPoint is still an exact spec reference lifted verbatim from the markscheme, or null when the markscheme gives none — NEVER infer or guess, even when the specification lists candidate codes.',
		'',
		'Top level: questions array, one entry per smallest marked leaf (e.g. 1a, 2bii).',
		'Per question: id (verbatim leaf label, non-empty, unique, e.g. 1a) / marks (positive int, or null when unknowable from the inputs; marks from the markscheme win when both inputs present) / summary (3-8 word summary of what the leaf asks, from the paper stem when present else the markscheme answer) / specPoint (exact spec reference lifted verbatim from the markscheme, or null when the markscheme gives none — NEVER infer or guess) / commandWord (verbatim instruction verb from the paper, or null when absent — no normalisation) / ao (one of AO1, AO2, AO3, or null when unknowable).',
		'',
		'--- assessment paper text ---',
		paperSection,
		'',
		'--- markscheme text ---',
		markschemeSection,
		'',
		'--- specification text ---',
		specSection
	].join('\n');
}

/**
 * Build the OpenRouter chat payload (live model + retry).
 * Hybrid path: deterministic extracted text (ordering ground truth) plus
 * whichever PDFs were provided, attached natively with an explicit
 * `engine: 'native'` — the engine is always set explicitly so OpenRouter
 * never silently falls back to the paid `mistral-ocr` path. Text-only path:
 * no file parts and no plugins at all, so there is nothing for the
 * file-parser to bill.
 */
export function buildHybridPayload(input: HybridPayloadInput): HybridPayload {
	const promptText = buildPromptText({
		paperText: input.paperText,
		markschemeText: input.markschemeText,
		specText: input.specText ?? null,
		useNativePdf: input.useNativePdf
	});

	if (!input.useNativePdf) {
		return {
			model: input.modelId,
			max_tokens: OPENROUTER_MAX_TOKENS,
			messages: [{ role: 'user', content: [{ type: 'text', text: promptText }] }]
		};
	}

	const files: Array<{ type: string; file: { filename: string; file_data: string } }> = [];
	if (input.paperFilename && input.paperPdfBase64) {
		files.push({
			type: 'file',
			file: { filename: input.paperFilename, file_data: toPdfDataUrl(input.paperPdfBase64) }
		});
	}
	if (input.markschemeFilename && input.markschemePdfBase64) {
		files.push({
			type: 'file',
			file: {
				filename: input.markschemeFilename,
				file_data: toPdfDataUrl(input.markschemePdfBase64)
			}
		});
	}
	if (input.specFilename && input.specPdfBase64) {
		files.push({
			type: 'file',
			file: {
				filename: input.specFilename,
				file_data: toPdfDataUrl(input.specPdfBase64)
			}
		});
	}

	return {
		model: input.modelId,
		max_tokens: OPENROUTER_MAX_TOKENS,
		messages: [
			{
				role: 'user',
				content: [{ type: 'text', text: promptText }, ...files]
			}
		],
		plugins: [{ id: 'file-parser', pdf: { engine: 'native' } }]
	};
}
