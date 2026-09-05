// Parse contract skeleton (issue #8) — lean v0.2 shape from the Phase 1 spec (#7).
//
// This module defines the HTTP contract types for `POST /api/parse`:
// multipart in, `{ breakdown, specRef, warnings, usage }` out.
// Deeper behaviour (real PDF ingestion, exam-specification cache, live model)
// lands in #9–#11; this file only pins the shapes they must honour.

import { createHash } from 'node:crypto';

/** Which exam specification version a breakdown was validated against. */
export interface SpecRef {
	board: string;
	/** Subject specification number, e.g. `8463` (not a dotted content code). */
	specCode: string;
	tier: string;
	version: string;
	/** Short hash of the exam specification URL the run was pinned to. */
	urlHash: string;
}

/** One question entry in the lean v0.2 breakdown. */
export interface ParseQuestion {
	/** Free-string question number, unique within the paper (`01.1`, `16(a)(ii)`). */
	number: string;
	/** Positive integer marks for the question. */
	marks: number;
	/** Dotted content identifiers, e.g. `4.6.1.1`. At least one per question. */
	specCodes: string[];
	/** Very brief 3–8 word task label paraphrasing what the student was asked to do. */
	questionText: string;
	/** Assessment objectives, required on every question. */
	ao: string[];
	commandWord: string;
	/** True only if the student must perform a numerical calculation. */
	isCalculation: boolean;
	/** True for experimental method / investigation design / RPA / investigation data. */
	isWorkingScientifically: boolean;
}

/** Structured per-question breakdown of an assessment paper. */
export interface Breakdown {
	paperId: string;
	paperTitle: string;
	year: number;
	/** Paper maximum read off the paper's Information section — never summed. */
	totalMarks: number;
	specRef: SpecRef;
	questions: ParseQuestion[];
}

/** A soft finding: the run succeeds (HTTP 200) with the breakdown intact. */
export interface ParseWarning {
	/** Question number this applies to, or `null` for paper-level findings. */
	questionNumber: string | null;
	code: string;
	message: string;
}

/** What the run spent. Token counts are zero for the stubbed transport (#8). */
export interface ParseUsage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	estCost: number;
}

/** Success body for `POST /api/parse`. */
export interface ParseResponse {
	breakdown: Breakdown;
	specRef: SpecRef;
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
export const BOARD_FIELD = 'board';
export const SUBJECT_FIELD = 'subject';
export const TIER_FIELD = 'tier';
export const SPEC_URL_FIELD = 'specUrl';
export const MODEL_OVERRIDE_FIELD = 'modelOverride';

// --- Limits (client pre-checks these; the route re-enforces them) ---

/** Per-file cap for assessment paper / markscheme PDFs. Fatal (413) when exceeded. */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

/** Dotted content-code shape, e.g. `4.6`, `4.6.1`, `4.6.1.1`. */
export const SPEC_CODE_PATTERN = /^\d+\.\d+(\.\d+(\.\d+)?)?$/;

/**
 * Fixture exam-specification catalogue for the skeleton slice.
 * Real fetch-parse-cache arrives in #10; until then, set-membership is
 * checked against this small stand-in so unknown-code warnings are testable.
 */
export const STUB_SPEC_CATALOGUE: ReadonlySet<string> = new Set([
	'4.6.1.1',
	'4.6.2.2',
	'4.6.3.1',
	'4.6.1.2',
	'4.1.1.1'
]);

/** Version pinned in every stubbed `specRef` until the real cache (#10) exists. */
export const STUB_SPEC_VERSION = 'stub-v1';

/** Stubbed specRef pinning until the real fetch-parse-cache (#10) exists. */
export function buildStubSpecRef(
	board: string,
	subject: string,
	tier: string,
	specUrl: string
): SpecRef {
	const urlHash = createHash('sha256').update(specUrl).digest('hex').slice(0, 12);
	return { board, specCode: subject, tier, version: STUB_SPEC_VERSION, urlHash };
}
