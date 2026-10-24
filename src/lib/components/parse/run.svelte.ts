// The upload run: what the form holds and the calls one run makes.
//
// A single tier is today's run: one `/api/parse` call. Two tiers are parsed in
// parallel, then one `/api/match` call proposes their common questions. The
// class owns every state the dialog and the page render: each step's status,
// the retry that keeps the other tier's parse, and the one silent retry a
// temporary matching failure gets. It stores nothing; the page creates the
// document only when the teacher chooses Open breakdown.

import { isBreakdown, isRecord } from '$lib/parse/is-breakdown.js';
import { isRunStoppingCode } from '$lib/marksheet/report-errors.js';
import type { TierParse } from '$lib/marksheet/create-assessment.js';
import {
	MAX_MATCH_ENTRIES,
	MAX_MATCH_LABEL_LENGTH,
	MAX_MATCH_SUMMARY_LENGTH
} from '$lib/match/limits.js';
import type { Breakdown, ParseUsage, ParseWarning } from '$lib/server/parse/schema.js';

// The multipart field names and per-file cap are the parse route's contract
// (src/lib/server/parse/schema.ts). They are repeated here because a client
// module cannot import that server-only path. The matching caps come from the
// same module the match route reads them from, so the two cannot drift.
const ASSESSMENT_PAPER_FIELD = 'assessmentPaper';
const MARKSCHEME_FIELD = 'markscheme';
const MODEL_OVERRIDE_FIELD = 'modelOverride';
const SPEC_URL_FIELD = 'specUrl';
const MAX_FILE_BYTES = 15 * 1024 * 1024;

export type StepStatus = 'idle' | 'running' | 'done' | 'failed';
export type MatchStatus = 'idle' | 'running' | 'done' | 'failed' | 'skipped';
export type RunPhase = 'form' | 'running' | 'stopped' | 'done';

export interface StepError {
	code: string;
	message: string;
	retryable: boolean;
}

/** One proposed common question, still as parse labels. */
export interface MatchPair {
	tier1Id: string;
	tier2Id: string;
}

/** A tier and input the other tier has, so this tier needs one too. */
export interface TierMismatch {
	tier: number;
	kind: 'paper' | 'markscheme';
	message: string;
}

const FILE_PROBLEM_CODES: Record<string, true> = {
	PDF_UNREADABLE: true,
	FILE_TOO_BIG: true,
	INVALID_FILE_TYPE: true
};
const TEMPORARY_CODES: Record<string, true> = {
	MODEL_RETRYABLE: true,
	MODEL_ERROR: true,
	MALFORMED_MODEL_OUTPUT: true,
	REQUEST_FAILED: true
};

const ZERO_USAGE: ParseUsage = {
	promptTokens: 0,
	completionTokens: 0,
	totalTokens: 0,
	estCost: 0
};

function addUsage(total: ParseUsage, usage: ParseUsage): ParseUsage {
	return {
		promptTokens: total.promptTokens + usage.promptTokens,
		completionTokens: total.completionTokens + usage.completionTokens,
		totalTokens: total.totalTokens + usage.totalTokens,
		estCost: total.estCost + usage.estCost
	};
}

/** Whether the tier's own file is the problem, so the way out is replacing it. */
export function isFileProblem(error: StepError): boolean {
	return FILE_PROBLEM_CODES[error.code] === true;
}

function checkPdf(file: File): string | null {
	const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
	if (!isPdf) return 'Only PDF files are accepted.';
	if (file.size > MAX_FILE_BYTES) return 'File exceeds the 15MB per-file limit.';
	return null;
}

function checkSpecUrl(value: string): string | null {
	const trimmed = value.trim();
	if (trimmed === '') return null;
	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		return 'Enter a valid http(s) link, or leave this empty.';
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		return 'Enter a valid http(s) link, or leave this empty.';
	}
	return null;
}

function readUsage(value: unknown): ParseUsage | null {
	if (!isRecord(value)) return null;
	const promptTokens = value['promptTokens'];
	const completionTokens = value['completionTokens'];
	const totalTokens = value['totalTokens'];
	const estCost = value['estCost'];
	if (
		typeof promptTokens !== 'number' ||
		typeof completionTokens !== 'number' ||
		typeof totalTokens !== 'number' ||
		typeof estCost !== 'number'
	) {
		return null;
	}
	return { promptTokens, completionTokens, totalTokens, estCost };
}

function readWarnings(value: unknown): ParseWarning[] {
	if (!Array.isArray(value)) return [];
	const warnings: ParseWarning[] = [];
	for (const item of value) {
		if (!isRecord(item)) continue;
		const questionId = item['questionId'];
		const code = item['code'];
		const message = item['message'];
		if (
			(questionId !== null && typeof questionId !== 'string') ||
			typeof code !== 'string' ||
			typeof message !== 'string'
		) {
			continue;
		}
		warnings.push({ questionId, code, message });
	}
	return warnings;
}

interface ParseSuccess {
	breakdown: Breakdown;
	warnings: ParseWarning[];
	usage: ParseUsage;
}

function readParseSuccess(value: unknown): ParseSuccess | null {
	if (!isRecord(value)) return null;
	const breakdown = value['breakdown'];
	const usage = readUsage(value['usage']);
	if (!isBreakdown(breakdown) || usage === null) return null;
	const tierName =
		typeof breakdown.tierName === 'string' && breakdown.tierName.trim() !== ''
			? breakdown.tierName.trim()
			: null;
	return {
		breakdown: { ...breakdown, tierName },
		warnings: readWarnings(value['warnings']),
		usage
	};
}

interface MatchSuccess {
	pairs: MatchPair[];
	usage: ParseUsage;
}

function readMatchSuccess(value: unknown): MatchSuccess | null {
	if (!isRecord(value)) return null;
	const rawPairs = value['pairs'];
	const usage = readUsage(value['usage']);
	if (!Array.isArray(rawPairs) || usage === null) return null;
	const pairs: MatchPair[] = [];
	for (const item of rawPairs) {
		if (!isRecord(item)) return null;
		const tier1Id = item['tier1Id'];
		const tier2Id = item['tier2Id'];
		if (typeof tier1Id !== 'string' || typeof tier2Id !== 'string') return null;
		pairs.push({ tier1Id, tier2Id });
	}
	return { pairs, usage };
}

function readStepError(value: unknown): StepError | null {
	if (!isRecord(value)) return null;
	const error = value['error'];
	if (!isRecord(error)) return null;
	const code = error['code'];
	const message = error['message'];
	if (typeof code !== 'string' || typeof message !== 'string') return null;
	return { code, message, retryable: error['retryable'] === true };
}

async function readBody(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return null;
	}
}

function requestFailed(error: unknown): StepError {
	return {
		code: 'REQUEST_FAILED',
		message: error instanceof Error ? error.message : 'The run could not be completed.',
		retryable: true
	};
}

function parseStepError(body: unknown): StepError {
	const error = readStepError(body);
	if (error === null) {
		return {
			code: 'REQUEST_FAILED',
			message: 'The run could not be completed.',
			retryable: true
		};
	}
	return { ...error, retryable: error.retryable || TEMPORARY_CODES[error.code] === true };
}

function matchStepError(body: unknown): StepError {
	const error = readStepError(body);
	if (error === null) {
		return {
			code: 'REQUEST_FAILED',
			message: 'The matching call could not be completed.',
			retryable: true
		};
	}
	return { ...error, retryable: error.retryable || TEMPORARY_CODES[error.code] === true };
}

/** One tier's place in the form: its files, its parse status and what it read. */
export class TierSlot {
	paper = $state<File | null>(null);
	markscheme = $state<File | null>(null);
	paperError = $state<string | null>(null);
	markschemeError = $state<string | null>(null);
	parse = $state<StepStatus>('idle');
	error = $state<StepError | null>(null);
	parsed = $state<TierParse | null>(null);

	get hasFile(): boolean {
		return this.paper !== null || this.markscheme !== null;
	}

	get hasError(): boolean {
		return this.paperError !== null || this.markschemeError !== null;
	}

	get entryCount(): number | null {
		return this.parsed?.breakdown.questions.length ?? null;
	}

	get tierName(): string | null {
		return this.parsed?.tierName ?? null;
	}
}

export class UploadRun {
	tiers = $state<TierSlot[]>([new TierSlot()]);
	phase = $state<RunPhase>('form');
	modelOverride = $state('');
	modelCustom = $state(false);
	specUrl = $state('');
	specUrlError = $state<string | null>(null);
	match = $state<MatchStatus>('idle');
	matchError = $state<StepError | null>(null);
	pairs = $state<number | null>(null);
	matchPairs = $state<MatchPair[]>([]);
	/** A non-retryable matching failure's reason, kept for the review's notice. */
	notice = $state<string | null>(null);
	/** A run-stopping error: shown with today's FatalAlert; nothing is kept. */
	fatal = $state<StepError | null>(null);
	usage = $state<ParseUsage>({ ...ZERO_USAGE });

	get twoTiers(): boolean {
		return this.tiers.length === 2;
	}

	/** One message per input the other tier has and this one lacks. */
	get mismatch(): TierMismatch[] {
		if (!this.twoTiers) return [];
		const [first, second] = this.tiers;
		const out: TierMismatch[] = [];
		for (const kind of ['paper', 'markscheme'] as const) {
			const noun = kind === 'paper' ? 'an assessment paper' : 'a markscheme';
			if (first[kind] !== null && second[kind] === null) {
				out.push({ tier: 1, kind, message: `Tier 1 has ${noun}, so Tier 2 needs one too.` });
			}
			if (second[kind] !== null && first[kind] === null) {
				out.push({ tier: 0, kind, message: `Tier 2 has ${noun}, so Tier 1 needs one too.` });
			}
		}
		return out;
	}

	get canRun(): boolean {
		return (
			this.phase === 'form' &&
			this.specUrlError === null &&
			this.tiers.every((tier) => tier.hasFile && !tier.hasError) &&
			this.mismatch.length === 0
		);
	}

	/** A tier that failed for a temporary reason can be retried; the other parse is kept. */
	get retryIndex(): number | null {
		if (this.phase !== 'stopped' || this.match === 'failed') return null;
		for (let index = 0; index < this.tiers.length; index++) {
			if (this.tiers[index].parse !== 'done') return index;
		}
		return null;
	}

	canRetry(index: number): boolean {
		const tier = this.tiers[index];
		if (tier === undefined || !tier.hasFile || tier.hasError) return false;
		// Resending unlike inputs would compare papers that never sat together.
		if (this.mismatch.length > 0) return false;
		// A file problem is cleared by replacing that tier's file, and only then.
		return tier.error === null || !isFileProblem(tier.error);
	}

	/** Files are locked while the run is in flight; only a stopped failed tier may change. */
	canEditFiles(index: number): boolean {
		if (this.phase === 'form') return true;
		return (
			this.phase === 'stopped' && this.match !== 'failed' && this.tiers[index]?.parse !== 'done'
		);
	}

	setFile(index: number, kind: 'paper' | 'markscheme', file: File | null): void {
		if (!this.canEditFiles(index)) return;
		const tier = this.tiers[index];
		if (tier === undefined) return;
		const error = file === null ? null : checkPdf(file);
		if (kind === 'paper') {
			tier.paper = error === null ? file : null;
			tier.paperError = error;
		} else {
			tier.markscheme = error === null ? file : null;
			tier.markschemeError = error;
		}
		// The old parse described the old file; replacing it starts that tier over.
		if (tier.parse !== 'idle' || tier.error !== null) {
			tier.parse = 'idle';
			tier.error = null;
			tier.parsed = null;
		}
		this.match = 'idle';
		this.matchError = null;
		this.pairs = null;
		this.notice = null;
		this.matchPairs = [];
	}

	setSpecUrl(value: string): void {
		this.specUrl = value;
		this.specUrlError = checkSpecUrl(value);
	}

	addTier(): void {
		if (this.phase !== 'form' || this.twoTiers) return;
		this.tiers.push(new TierSlot());
	}

	removeTier(): void {
		if (this.phase !== 'form' || !this.twoTiers) return;
		this.tiers.pop();
	}

	/** The one page-but-not-dialog action: retry a tier after its file was replaced. */
	async retryTier(index: number): Promise<void> {
		if (this.phase !== 'stopped' || this.match === 'failed') return;
		if (!this.canRetry(index)) return;
		this.phase = 'running';
		await this.parseTier(index);
		await this.afterParses();
	}

	async run(): Promise<void> {
		if (!this.canRun) return;
		this.resetResults();
		this.phase = 'running';
		await Promise.all(this.tiers.map((_, index) => this.parseTier(index)));
		await this.afterParses();
	}

	async tryMatchAgain(): Promise<void> {
		if (this.phase !== 'stopped' || this.match !== 'failed') return;
		this.matchPairs = [];
		this.pairs = null;
		this.notice = null;
		await this.matchTiers();
	}

	continueWithoutPairs(): void {
		if (this.phase !== 'stopped' || this.match !== 'failed') return;
		this.match = 'skipped';
		this.matchPairs = [];
		this.pairs = 0;
		this.notice = this.matchError?.message ?? 'Matching was skipped.';
		this.phase = 'done';
	}

	/**
	 * Leave a stopped run for the form. The files stay, so the teacher can
	 * change the model or specification and run again; every result that
	 * belonged to the stopped run is dropped.
	 */
	abandon(): void {
		if (this.phase !== 'stopped') return;
		this.resetResults();
		this.phase = 'form';
	}

	/** Every tier's parse, as the store's createFromAssessment takes them. */
	tierResults(): [TierParse] | [TierParse, TierParse] | null {
		const [first, second] = this.tiers;
		if (first === undefined || first.parsed === null) return null;
		if (second === undefined) return [first.parsed];
		if (second.parsed === null) return null;
		return [first.parsed, second.parsed];
	}

	private resetResults(): void {
		this.match = 'idle';
		this.matchError = null;
		this.pairs = null;
		this.matchPairs = [];
		this.notice = null;
		this.fatal = null;
		this.usage = { ...ZERO_USAGE };
		for (const tier of this.tiers) {
			tier.parse = 'idle';
			tier.error = null;
			tier.parsed = null;
		}
	}

	private async parseTier(index: number): Promise<void> {
		const tier = this.tiers[index];
		if (tier === undefined) return;
		tier.parse = 'running';
		tier.error = null;

		const form = new FormData();
		if (tier.paper !== null) form.append(ASSESSMENT_PAPER_FIELD, tier.paper);
		if (tier.markscheme !== null) form.append(MARKSCHEME_FIELD, tier.markscheme);
		if (this.modelOverride.trim() !== '') {
			form.append(MODEL_OVERRIDE_FIELD, this.modelOverride.trim());
		}
		if (this.specUrl.trim() !== '') form.append(SPEC_URL_FIELD, this.specUrl.trim());

		let response: Response;
		try {
			response = await fetch('/api/parse', { method: 'POST', body: form });
		} catch (error) {
			tier.error = requestFailed(error);
			tier.parse = 'failed';
			return;
		}

		const body = await readBody(response);
		if (!response.ok) {
			tier.error = parseStepError(body);
			tier.parse = 'failed';
			return;
		}

		const parsed = readParseSuccess(body);
		if (parsed === null) {
			tier.error = {
				code: 'MALFORMED_MODEL_OUTPUT',
				message: "The model's response was not a valid breakdown. Please try again.",
				retryable: true
			};
			tier.parse = 'failed';
			return;
		}

		tier.parsed = {
			tierName: parsed.breakdown.tierName,
			breakdown: parsed.breakdown,
			warnings: parsed.warnings,
			filenames: [tier.paper?.name, tier.markscheme?.name].filter(
				(name): name is string => name !== undefined
			)
		};
		this.usage = addUsage(this.usage, parsed.usage);
		tier.parse = 'done';
	}

	private async afterParses(): Promise<void> {
		const stopped = this.tiers.find(
			(tier) =>
				tier.parse === 'failed' &&
				tier.error !== null &&
				!isFileProblem(tier.error) &&
				!tier.error.retryable
		);
		if (stopped !== undefined && stopped.error !== null) {
			this.stopRun(stopped.error);
			return;
		}
		if (this.tiers.some((tier) => tier.parse !== 'done')) {
			this.phase = 'stopped';
			return;
		}
		if (!this.twoTiers) {
			this.phase = 'done';
			return;
		}
		await this.matchTiers();
	}

	/** The run is over and keeps nothing: today's fatal panel is the way back. */
	private stopRun(error: StepError): void {
		this.fatal = error;
		this.phase = 'form';
		this.match = 'idle';
		this.matchError = null;
		this.pairs = null;
		this.matchPairs = [];
		this.notice = null;
		this.usage = { ...ZERO_USAGE };
		for (const tier of this.tiers) {
			tier.parse = 'idle';
			tier.error = null;
			tier.parsed = null;
		}
	}

	private async matchTiers(): Promise<void> {
		this.phase = 'running';
		this.match = 'running';
		this.matchError = null;

		// One silent retry: the step keeps saying "running" through both attempts.
		for (let attempt = 0; attempt < 2; attempt++) {
			const error = await this.attemptMatch();
			if (error === null) return;
			this.matchError = error;
			// A match failure never costs a parse: both tiers are already in
			// hand, so the teacher continues to review and pairs by hand.
			if (isRunStoppingCode(error.code) || !error.retryable) {
				this.match = 'failed';
				this.matchPairs = [];
				this.pairs = 0;
				this.notice = error.message;
				this.phase = 'done';
				return;
			}
		}

		this.match = 'failed';
		this.phase = 'stopped';
	}

	private async attemptMatch(): Promise<StepError | null> {
		const [first, second] = this.tiers;
		const firstParsed = first?.parsed;
		const secondParsed = second?.parsed;
		const firstDocument = first?.paper ?? first?.markscheme ?? null;
		const secondDocument = second?.paper ?? second?.markscheme ?? null;
		if (
			firstParsed === undefined ||
			firstParsed === null ||
			secondParsed === undefined ||
			secondParsed === null ||
			firstDocument === null ||
			secondDocument === null
		) {
			return {
				code: 'INVALID_MATCH_REQUEST',
				message: 'Both tiers must be parsed before matching.',
				retryable: false
			};
		}

		const form = new FormData();
		form.append('tier1Document', firstDocument);
		form.append('tier2Document', secondDocument);
		form.append('tier1Entries', JSON.stringify(matchEntries(firstParsed)));
		form.append('tier2Entries', JSON.stringify(matchEntries(secondParsed)));
		if (this.modelOverride.trim() !== '') form.append('model', this.modelOverride.trim());

		let response: Response;
		try {
			response = await fetch('/api/match', { method: 'POST', body: form });
		} catch (error) {
			return requestFailed(error);
		}

		const body = await readBody(response);
		if (!response.ok) return matchStepError(body);

		const matched = readMatchSuccess(body);
		if (matched === null) {
			return {
				code: 'INVALID_MODEL_OUTPUT',
				message: 'The matching answer could not be read. Please try again.',
				retryable: true
			};
		}

		this.usage = addUsage(this.usage, matched.usage);
		this.match = 'done';
		this.matchPairs = matched.pairs;
		this.pairs = matched.pairs.length;
		this.matchError = null;
		this.notice = null;
		this.phase = 'done';
		return null;
	}
}

/** One entry as the matching call sees it: the parse's label and comparisons, no UUIDs. */
interface MatchCallEntry {
	id: string;
	questionNumber: string;
	marks: number | null;
	summary: string;
	specPoint: string | null;
	commandWord: string | null;
}

function matchEntries(parsed: TierParse): MatchCallEntry[] {
	const entries: MatchCallEntry[] = [];
	for (const question of parsed.breakdown.questions) {
		// The parse guard checks the array only; a warned field can still be
		// missing, and the route refuses anything off-contract.
		const id = typeof question.id === 'string' ? question.id : '';
		// A blank or over-long id cannot be sent, and truncating one would stop
		// the pair mapping back to this entry: such an entry cannot be a pair.
		if (id.trim() === '' || id.length > MAX_MATCH_LABEL_LENGTH) continue;
		if (entries.length >= MAX_MATCH_ENTRIES) break;
		const questionNumber =
			typeof question.questionNumber === 'string' ? question.questionNumber : '';
		entries.push({
			id,
			questionNumber: questionNumber.slice(0, MAX_MATCH_LABEL_LENGTH) || id,
			// The parse warns about marks its route would refuse; unknown is the
			// honest value, and the pair checks then drop it rather than the call.
			marks:
				typeof question.marks === 'number' && Number.isInteger(question.marks) && question.marks > 0
					? question.marks
					: null,
			summary:
				typeof question.summary === 'string'
					? question.summary.slice(0, MAX_MATCH_SUMMARY_LENGTH)
					: '',
			specPoint:
				typeof question.specPoint === 'string'
					? question.specPoint.slice(0, MAX_MATCH_LABEL_LENGTH)
					: null,
			commandWord:
				typeof question.commandWord === 'string'
					? question.commandWord.slice(0, MAX_MATCH_LABEL_LENGTH)
					: null
		});
	}
	return entries;
}
