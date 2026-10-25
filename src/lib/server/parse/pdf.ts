// Hybrid PDF ingestion for Phase 1 Parse (issue #9).
//
// Server extracts per-page text with `unpdf` (deterministic, works with any
// per-run model) AND forwards the original PDFs natively (`engine: 'native'`
// on the default model) in the same OpenRouter call, so layout,
// tables, emphasis and diagrams ground the breakdown. If the per-run override
// model lacks native file support, the route degrades to text-only with a
// visible diagram-unverified warning — never a silent paid-OCR fallback and
// never a silent hallucination.
//
// Grounding: AQA 84632H June 2023 — question paper 44pp/2.4MB with ~100
// diagram images, markscheme 26pp/0.5MB where tables + bold/underline flatten
// in plain text. See `docs/research/pdf-ingestion.md` (research branch
// `research/pdf-ingestion`, throwaway, not merged).

import { extractText, getDocumentProxy } from 'unpdf';
import type { PDFDocumentProxy } from 'unpdf/pdfjs';
import { fenceDocuments } from '../fence';
import { ATTACHED_FILES_DIRECTIVE, pdfFilePart, type PdfFilePart } from '../openrouter';
import { AO_DESCRIPTION_TARGET_WORDS, type ParseWarning } from './schema';
import { getServerEnv } from './env';
import { CURATED_MODELS } from './models';

/**
 * Default model for every OpenRouter call when no per-run override or
 * OPENROUTER_MODEL is given: the curated set's first entry.
 */
export const DEFAULT_MODEL_ID = CURATED_MODELS[0].id;

/**
 * Bound on runaway parse output. Sized with headroom above the longest measured
 * Foundation papers (about 3,900 completion tokens for a QP + MS pair).
 */
export const OPENROUTER_MAX_TOKENS = 16000;

/** Warning code for the text-only degradation path. */
export const DIAGRAM_UNVERIFIED_CODE = 'DIAGRAM_UNVERIFIED';

// Verbatim from the #108 tier-name prototype, appended to the parse prompt.
const TIER_NAME_INSTRUCTION = [
	'Top level also has tierName: the tier this paper is set at, lifted from the documents themselves (cover, title page or running header) — NEVER from a filename.',
	'Copy the tier words verbatim as printed (e.g. "Higher Tier", "Foundation Tier", "Higher"), dropping only the wording around them such as the paper number, calculator rubric or brackets (e.g. "Higher (Calculator) Paper 2H" gives "Higher").',
	'If the tier appears only as the letter suffix of the paper code (e.g. 8300/1H, 1MA1/2F), give the word that letter stands for: H gives "Higher", F gives "Foundation".',
	'A paper number, paper title, qualification level or calculator rubric is NEVER a tier: "Paper 1", "Paper 2", "01", "Modelling physics", "A-level", "AS", "GCSE", "Non-Calculator" are not tiers.',
	"When no tier is printed, tierName is null. When the assessment paper and markscheme both name the tier, use the assessment paper's wording."
].join(' ');

/** Resolve the effective model id: trimmed override, else OPENROUTER_MODEL, else DEFAULT_MODEL_ID. */
export function resolveModelId(modelOverride?: string): string {
	const trimmed = modelOverride?.trim();
	return trimmed || getServerEnv('OPENROUTER_MODEL') || DEFAULT_MODEL_ID;
}

/**
 * Whether a model id supports native PDF file input through OpenRouter.
 * The default (`DEFAULT_MODEL_ID`) always supports native.
 * Overrides match a small allowlist of known multimodal families; anything
 * else degrades to text-only rather than risking the silent `mistral-ocr`
 * paid fallback (which is what OpenRouter picks when `engine` is unset on a
 * non-multimodal model).
 */
export function supportsNativePdf(modelId: string): boolean {
	return /gemini|claude|gpt-4o|gpt-4\.1|gpt-5|gpt-6|sonnet|opus|haiku/i.test(modelId);
}

/** pdf.js could not read the bytes it was given: the one failure that means a bad upload, not a bug. */
export class PdfUnreadableError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'PdfUnreadableError';
	}
}

/** Deterministic text extraction of one PDF. */
export interface ParsedPdf {
	textPerPage: string[];
	textWithMarkers: string;
}

/**
 * Count a PDF's pages without extracting their text. The page ceiling can then
 * be enforced before the work of reading every page. Throws `PdfUnreadableError` on
 * unreadable input — the route maps that to a 400 before any model call.
 *
 * Loads a copy: pdf.js detaches the buffer it parses, and the document is
 * destroyed before returning, so the caller's bytes stay attached and no
 * parsed document outlives the call.
 */
export async function countPdfPages(bytes: Uint8Array): Promise<number> {
	let pdf: PDFDocumentProxy | null = null;
	let pageCount: number;
	try {
		pdf = await getDocumentProxy(new Uint8Array(bytes));
		pageCount = pdf.numPages;
	} catch (error) {
		throw new PdfUnreadableError(
			`PDF could not be read: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error }
		);
	} finally {
		if (pdf !== null) await pdf.loadingTask.destroy();
	}
	if (!Number.isInteger(pageCount) || pageCount < 1) {
		throw new PdfUnreadableError('PDF could not be read: no pages found.');
	}
	return pageCount;
}

/**
 * Extract per-page text from raw PDF bytes.
 * Returns pages in order plus a `[p.N]`-marked concatenation for the prompt
 * (text is the ordering ground truth; the native PDF attach is authoritative
 * for figures/tables/emphasis). Throws `PdfUnreadableError` on unreadable input — the route maps
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
		throw new PdfUnreadableError(
			`PDF could not be read: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error }
		);
	}
	const textPerPage = (Array.isArray(text) ? text : [text]).map((page) =>
		typeof page === 'string' ? page : String(page ?? '')
	);
	if (!Number.isInteger(totalPages) || totalPages < 1) {
		throw new PdfUnreadableError('PDF could not be read: no pages found.');
	}
	const textWithMarkers = textPerPage
		.map((pageText, index) => `[p.${index + 1}]\n${pageText.trim()}`)
		.join('\n\n');
	return { textPerPage, textWithMarkers };
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

/** Parse's chat payload; an object type (not an interface) so the transport can take it as a full OpenRouter body. */
export type HybridPayload = {
	model: string;
	max_tokens: number;
	messages: unknown[];
	plugins?: Array<{ id: string; pdf: { engine: string } }>;
};

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
		? 'The extracted text below is the ordering ground truth; attached PDFs are authoritative for the layout of figures, tables, bold/underline emphasis and diagram questions. ' +
			ATTACHED_FILES_DIRECTIVE
		: 'No native PDF is attached — work from the extracted text only; diagram and table-heavy questions are unverified.';
	const paperSection = input.paperText ?? '(no assessment paper provided)';
	const markschemeSection = input.markschemeText ?? '(no markscheme provided)';
	const specSection = input.specText ?? '(no specification provided)';

	// Fence each document behind a boundary token generated fresh for this
	// prompt build. Nothing in the source documents can know the token in
	// advance, so document content can never forge a closing/opening fence
	// or impersonate a `--- ... text ---` section header from inside itself.
	const { open, close, directive } = fenceDocuments(paperSection, markschemeSection, specSection);

	return [
		'Parse the assessment paper and/or markscheme into the v1 per-question JSON breakdown.',
		'Return ONLY a single JSON object — no markdown fences, no commentary.',
		nativeHint,
		'The specification below is extra grounding only: specPoint is still an exact spec reference lifted verbatim from the markscheme, or null when the markscheme gives none — NEVER infer or guess, even when the specification lists candidate codes.',
		`Top level also has aoDescriptions: one { ao, description } entry for each of AO1, AO2, AO3. description is a single student-readable phrase of about ${AO_DESCRIPTION_TARGET_WORDS} words at most that summarises how the specification text itself defines that assessment objective. Summarise from the specification text ONLY; NEVER invent or infer a description. Use null when no specification is provided or it does not define that objective.`,
		TIER_NAME_INSTRUCTION,
		directive,
		'',
		'Top level: questions array, one entry per undivided question and one per separately marked subquestion (e.g. 1a, 2bii). A question that is subdivided gets no entry of its own, and neither does an unmarked stem whose marks sit on its own subquestions (e.g. no 2b entry when 2bi and 2bii carry the marks).',
		'Per question: id (verbatim label, non-empty, unique, e.g. 1a) / questionNumber (the question this entry belongs to, verbatim as printed, e.g. 2 for 2bii; equal to id for an undivided question) / marks (positive int, or null when unknowable from the inputs; marks from the markscheme win when both inputs present) / summary (3-8 word summary of what the question or subquestion asks, from the paper stem when present else the markscheme answer) / specPoint (exact spec reference lifted verbatim from the markscheme, or null when the markscheme gives none — NEVER infer or guess) / commandWord (verbatim instruction verb from the paper, or null when absent — no normalisation) / ao (one of AO1, AO2, AO3, or null when unknowable).',
		'',
		'--- assessment paper text ---',
		open,
		paperSection,
		close,
		'',
		'--- markscheme text ---',
		open,
		markschemeSection,
		close,
		'',
		'--- specification text ---',
		open,
		specSection,
		close
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

	const files: PdfFilePart[] = [];
	if (input.paperFilename && input.paperPdfBase64) {
		files.push(pdfFilePart(input.paperFilename, input.paperPdfBase64));
	}
	if (input.markschemeFilename && input.markschemePdfBase64) {
		files.push(pdfFilePart(input.markschemeFilename, input.markschemePdfBase64));
	}
	if (input.specFilename && input.specPdfBase64) {
		files.push(pdfFilePart(input.specFilename, input.specPdfBase64));
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
