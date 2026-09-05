// Stubbed model transport for the parse contract skeleton (issue #8),
// now carrying the hybrid PDF ingestion payload (issue #9).
//
// The real OpenRouter call (with guardrails, retry-once and usage) arrives in
// #11. Until then, the route calls through this seam so the contract —
// multipart in, `{ breakdown, specRef, warnings, usage }` out — is provable.
// Tests inject behaviour via `setModelTransport`; production uses the default
// stub, which returns a small schema-valid fixture breakdown.

import type { Breakdown, ParseUsage } from './schema';

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
}

/** Raw model result: unparsed JSON plus usage for the response. */
export interface ModelResult {
	rawJson: string;
	usage: ParseUsage;
}

export type ModelTransport = (input: ModelInput) => Promise<ModelResult>;

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

async function defaultStubTransport(): Promise<ModelResult> {
	return { rawJson: JSON.stringify(stubBreakdown()), usage: stubUsage() };
}

let transport: ModelTransport = defaultStubTransport;

/** Test seam: replace the model transport for contract tests. */
export function setModelTransport(fn: ModelTransport): void {
	transport = fn;
}

/** Restore the default stubbed transport. */
export function resetModelTransport(): void {
	transport = defaultStubTransport;
}

export function callModel(input: ModelInput): Promise<ModelResult> {
	return transport(input);
}
