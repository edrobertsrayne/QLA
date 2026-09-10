// Parse contract v1 prototype — minimal import shape.
//
// Input: assessment paper and/or markscheme PDF (at least one required),
// plus an optional exam specification URL fetched server-side per run
// (no cache). No spec validation: `specPoint` is an exact verbatim lift
// from the markscheme or null — never inferred, even when a spec is given.

/** Hardcoded assessment objectives (shared AQA/OCR, GCSE + A-Level). */
export const ASSESSMENT_OBJECTIVES = ['AO1', 'AO2', 'AO3'] as const;

export type AssessmentObjective = (typeof ASSESSMENT_OBJECTIVES)[number];

/** One marked leaf in the v1 breakdown (e.g. `1a`, `2bii`). */
export interface ParseQuestion {
	/** Verbatim leaf label from the paper/markscheme, unique within the run. */
	id: string;
	/** Positive integer marks, or null when unknowable from the inputs. */
	marks: number | null;
	/** 3–8 word summary of what the leaf asks. */
	summary: string;
	/** Exact spec reference lifted verbatim from the markscheme, or null. Never inferred. */
	specPoint: string | null;
	/** Verbatim command word from the paper, or null when absent. */
	commandWord: string | null;
	/** Hardcoded AO tag, or null when unknowable. */
	ao: AssessmentObjective | null;
}

/** Structured per-question breakdown of an upload. */
export interface Breakdown {
	questions: ParseQuestion[];
}

/** A soft finding: the run succeeds (HTTP 200) with the breakdown intact. */
export interface ParseWarning {
	/** Question id this applies to, or `null` for run-level findings. */
	questionId: string | null;
	code: string;
	message: string;
}

/** What the run spent. Token counts are zero for the stubbed transport. */
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
		[key: string]: unknown;
	};
}

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

// --- Limits (client pre-checks these; the route re-enforces them) ---

/** Per-file cap for assessment paper / markscheme PDFs. Fatal (413) when exceeded. */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

/** Total page ceiling across provided PDFs (paper + markscheme + spec). Fatal (413) when exceeded. */
export const MAX_TOTAL_PAGES = 100;

/** Server timeout for fetching the optional spec URL. Fatal (400) on timeout. */
export const SPEC_FETCH_TIMEOUT_MS = 30_000;
