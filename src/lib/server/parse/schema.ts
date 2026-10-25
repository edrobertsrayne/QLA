// Parse contract v1 prototype — minimal import shape.
//
// Input: assessment paper and/or markscheme PDF (at least one required),
// plus an optional exam specification URL fetched server-side per run
// (no cache). No spec validation: `specPoint` is an exact verbatim lift
// from the markscheme or null — never inferred, even when a spec is given.
// The spec's only other contribution is `aoDescriptions`: one short summary
// per assessment objective, null when the spec does not define it.

import type { AssessmentObjective } from '$lib/parse/assessment-objectives.js';

/** One breakdown entry: an undivided question, or a marked subquestion (e.g. `1a`, `2bii`). */
export interface ParseQuestion {
	/** Verbatim label from the paper/markscheme, unique within the run. */
	id: string;
	/**
	 * The question this entry belongs to (e.g. `2` for `2bii`), so a marksheet
	 * can band its columns. Equals `id` for an undivided question. Falls back
	 * to `id` with a warning when the model omits it.
	 */
	questionNumber: string;
	/** Positive integer marks, or null when unknowable from the inputs. */
	marks: number | null;
	/** 3–8 word summary of what the question or subquestion asks. */
	summary: string;
	/** Exact spec reference lifted verbatim from the markscheme, or null. Never inferred. */
	specPoint: string | null;
	/** Verbatim command word from the paper, or null when absent. */
	commandWord: string | null;
	/** Hardcoded AO tag, or null when unknowable. */
	ao: AssessmentObjective | null;
}

/**
 * A short student-readable description of one assessment objective, summarised
 * from the specification's own wording, or null when no specification was
 * attached or it does not define that objective. Never inferred.
 */
export interface AoDescription {
	ao: AssessmentObjective;
	description: string | null;
}

/** Words the parse prompt asks an AO description to stay within. */
export const AO_DESCRIPTION_TARGET_WORDS = 10;

/** Longest description kept, in words: two over the prompt's target, so a model that runs slightly long isn't thrown away. */
export const MAX_AO_DESCRIPTION_WORDS = AO_DESCRIPTION_TARGET_WORDS + 2;

/** Structured per-question breakdown of an upload. */
export interface Breakdown {
	/** The tier this paper is set at, copied verbatim from the documents, or null when none is printed. */
	tierName: string | null;
	questions: ParseQuestion[];
	aoDescriptions: AoDescription[];
}

/** A soft finding: the run succeeds (HTTP 200) with the breakdown intact. */
export interface ParseWarning {
	/** `id` of the entry this applies to, or `null` for run-level findings. */
	questionId: string | null;
	code: string;
	message: string;
}

/** What the run spent: token counts and the estimated cost. */
export interface ParseUsage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	estCost: number;
}

/** Success body for `POST /api/parse`. */
export interface ParseResponse {
	breakdown: Breakdown;
	warnings: ParseWarning[];
	usage: ParseUsage;
}

/** Fatal-error body for `POST /api/parse`. */
export interface ParseErrorBody {
	error: {
		code: string;
		message: string;
		/** Explicit retry hint: true only for a transient model failure. */
		retryable: boolean;
		[key: string]: unknown;
	};
}

/** Catch-all code when the model call fails for a reason the transport did not classify. */
export const MODEL_ERROR_CODE = 'MODEL_ERROR';

// --- Multipart field names (client and route must agree) ---

export const ASSESSMENT_PAPER_FIELD = 'assessmentPaper';
export const MARKSCHEME_FIELD = 'markscheme';
export const MODEL_OVERRIDE_FIELD = 'modelOverride';
/** Optional exam specification URL, fetched server-side per run (no cache). */
export const SPEC_URL_FIELD = 'specUrl';

/** Malformed spec URL (unparseable or non-http(s)). Fatal (400). */
export const INVALID_SPEC_URL_CODE = 'INVALID_SPEC_URL';
/** Spec fetch failed, non-OK status, or not a readable PDF. Fatal (400). */
export const SPEC_UNREADABLE_CODE = 'SPEC_UNREADABLE';

// --- Spec limits (the route re-enforces them) ---

/** Byte cap for the fetched specification PDF (OCR H556 Physics A is 16.6MB). Fatal (413) when exceeded. */
export const MAX_SPEC_BYTES = 30 * 1024 * 1024;

/** Page cap for the fetched specification PDF, independent of the upload page ceiling. Fatal (413) when exceeded. */
export const MAX_SPEC_PAGES = 200;

/** Server timeout for fetching the optional spec URL. Fatal (400) on timeout. */
export const SPEC_FETCH_TIMEOUT_MS = 30_000;
