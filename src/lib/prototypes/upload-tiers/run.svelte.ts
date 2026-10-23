/**
 * PROTOTYPE — throwaway (ticket #112, "Prototype: upload with tier slots and the
 * two-tier run"). Fakes the upload run so the variants can be judged on look and
 * behaviour: it never calls /api/parse or /api/match and stores nothing. The run
 * behaviour follows #110/#111: parses in parallel, then one matching call;
 * a failed parse stops before matching and keeps the other tier's result; a
 * retryable matching failure gets one silent retry then Try again / Continue
 * without proposed pairs; a non-retryable one goes straight to review with a
 * notice; a run-stopping error is handled as the parse handles it today.
 */

export type StepStatus = 'idle' | 'running' | 'done' | 'failed';
export type MatchStatus = 'idle' | 'running' | 'done' | 'failed' | 'skipped';
export type Phase = 'form' | 'running' | 'stopped' | 'done';

export interface StepError {
	code: string;
	message: string;
	retryable: boolean;
}

export type Scenario =
	| 'ok'
	| 'tier2-retryable'
	| 'tier1-unreadable'
	| 'match-retryable'
	| 'match-nonretryable'
	| 'run-stopping';

export const SCENARIOS: { key: Scenario; label: string }[] = [
	{ key: 'ok', label: 'Everything succeeds' },
	{ key: 'tier2-retryable', label: 'Tier 2 parse fails (retryable)' },
	{ key: 'tier1-unreadable', label: 'Tier 1 parse fails (PDF unreadable)' },
	{ key: 'match-retryable', label: 'Matching fails twice (retryable)' },
	{ key: 'match-nonretryable', label: 'Matching fails (model cannot read PDFs)' },
	{ key: 'run-stopping', label: 'Run-stopping error (out of credit)' }
];

const SAMPLE = [
	{
		tierName: 'Higher',
		entries: 24,
		paper: '8463-1H-QP-JUN24.pdf',
		markscheme: '8463-1H-MS-JUN24.pdf'
	},
	{
		tierName: 'Foundation',
		entries: 31,
		paper: '8463-1F-QP-JUN24.pdf',
		markscheme: '8463-1F-MS-JUN24.pdf'
	}
];
const SAMPLE_PAIRS = 9;

const ERRORS: Record<string, StepError> = {
	MODEL_RETRYABLE: {
		code: 'MODEL_RETRYABLE',
		message: 'The model provider is busy right now.',
		retryable: true
	},
	PDF_UNREADABLE: {
		code: 'PDF_UNREADABLE',
		message: 'The assessment paper could not be read as a PDF.',
		retryable: false
	},
	MODEL_CREDIT: {
		code: 'MODEL_CREDIT',
		message: 'The OpenRouter account is out of credit.',
		retryable: false
	},
	INVALID_MODEL_OUTPUT: {
		code: 'INVALID_MODEL_OUTPUT',
		message: "The model's answer was not a valid list of pairs.",
		retryable: true
	},
	MATCH_NEEDS_NATIVE_PDF: {
		code: 'MATCH_NEEDS_NATIVE_PDF',
		message: 'The chosen model cannot read PDFs natively, so it cannot propose common questions.',
		retryable: false
	}
};

export class TierSlot {
	paper = $state<string | null>(null);
	markscheme = $state<string | null>(null);
	paperError = $state<string | null>(null);
	markschemeError = $state<string | null>(null);
	parse = $state<StepStatus>('idle');
	error = $state<StepError | null>(null);
	entries = $state<number | null>(null);
	tierName = $state<string | null>(null);
	attempts = 0;

	get hasFile(): boolean {
		return this.paper !== null || this.markscheme !== null;
	}
}

function pickPdf(name: string | null): { name: string | null; error: string | null } {
	if (name === null) return { name: null, error: null };
	if (!name.toLowerCase().endsWith('.pdf'))
		return { name: null, error: 'Only PDF files are accepted.' };
	return { name, error: null };
}

class UploadRun {
	tiers = $state<TierSlot[]>([new TierSlot()]);
	scenario = $state<Scenario>('ok');
	speed = $state(1);
	phase = $state<Phase>('form');
	match = $state<MatchStatus>('idle');
	matchError = $state<StepError | null>(null);
	matchAttempts = 0;
	pairs = $state<number | null>(null);
	/** Non-retryable matching failure: the reason the review opens with no proposed pairs. */
	notice = $state<string | null>(null);
	/** Run-stopping error: shown like today's FatalAlert; nothing kept. */
	fatal = $state<StepError | null>(null);
	modelOverride = $state('');
	modelCustom = $state(false);
	specUrl = $state('');

	get twoTiers(): boolean {
		return this.tiers.length === 2;
	}

	/** "Each tier holds the same inputs as the other": one message per missing input. */
	get mismatch(): { tier: number; kind: 'paper' | 'markscheme'; message: string }[] {
		if (!this.twoTiers) return [];
		const [a, b] = this.tiers;
		if (!a.hasFile || !b.hasFile) return [];
		const out: { tier: number; kind: 'paper' | 'markscheme'; message: string }[] = [];
		for (const kind of ['paper', 'markscheme'] as const) {
			const noun = kind === 'paper' ? 'an assessment paper' : 'a markscheme';
			if (a[kind] && !b[kind])
				out.push({ tier: 1, kind, message: `Tier 1 has ${noun}, so Tier 2 needs one too.` });
			if (b[kind] && !a[kind])
				out.push({ tier: 0, kind, message: `Tier 2 has ${noun}, so Tier 1 needs one too.` });
		}
		return out;
	}

	get canRun(): boolean {
		return (
			this.phase === 'form' &&
			this.tiers.every((t) => t.hasFile && !t.paperError && !t.markschemeError) &&
			this.mismatch.length === 0
		);
	}

	/** Files are locked once the run starts, except a tier whose parse failed and is stopped. */
	canEditFiles(index: number): boolean {
		if (this.phase === 'form') return true;
		return this.phase === 'stopped' && this.tiers[index].parse === 'failed';
	}

	setFile(index: number, kind: 'paper' | 'markscheme', name: string | null): void {
		const tier = this.tiers[index];
		const picked = pickPdf(name);
		tier[kind] = picked.name;
		if (kind === 'paper') tier.paperError = picked.error;
		else tier.markschemeError = picked.error;
	}

	addTier = (): void => {
		if (this.phase !== 'form' || this.twoTiers) return;
		this.tiers.push(new TierSlot());
	};

	removeTier = (): void => {
		if (this.phase !== 'form' || !this.twoTiers) return;
		this.tiers.pop();
	};

	fillSample = (count: 1 | 2): void => {
		this.reset();
		this.tiers = Array.from({ length: count }, (_, i) => {
			const slot = new TierSlot();
			slot.paper = SAMPLE[i].paper;
			slot.markscheme = SAMPLE[i].markscheme;
			return slot;
		});
	};

	reset = (): void => {
		this.phase = 'form';
		this.match = 'idle';
		this.matchError = null;
		this.matchAttempts = 0;
		this.pairs = null;
		this.notice = null;
		this.fatal = null;
		for (const t of this.tiers) {
			t.parse = 'idle';
			t.error = null;
			t.entries = null;
			t.tierName = null;
			t.attempts = 0;
		}
	};

	private wait(ms: number): Promise<void> {
		const { promise, resolve } = Promise.withResolvers<void>();
		setTimeout(resolve, ms * this.speed);
		return promise;
	}

	private failureFor(index: number, attempt: number): StepError | null {
		if (this.scenario === 'run-stopping') return ERRORS.MODEL_CREDIT;
		if (this.scenario === 'tier2-retryable' && index === 1 && attempt === 1)
			return ERRORS.MODEL_RETRYABLE;
		if (this.scenario === 'tier1-unreadable' && index === 0 && attempt === 1)
			return ERRORS.PDF_UNREADABLE;
		return null;
	}

	private async parseTier(index: number): Promise<void> {
		const tier = this.tiers[index];
		tier.parse = 'running';
		tier.error = null;
		tier.attempts += 1;
		await this.wait(2500 + index * 1200);
		const failure = this.failureFor(index, tier.attempts);
		if (failure) {
			tier.parse = 'failed';
			tier.error = failure;
			return;
		}
		tier.parse = 'done';
		tier.entries = SAMPLE[index].entries;
		tier.tierName = SAMPLE[index].tierName;
	}

	run = async (): Promise<void> => {
		if (!this.canRun) return;
		this.reset();
		this.phase = 'running';
		await Promise.all(this.tiers.map((_, i) => this.parseTier(i)));
		await this.afterParses();
	};

	retryTier = async (index: number): Promise<void> => {
		if (this.phase !== 'stopped') return;
		this.phase = 'running';
		await this.parseTier(index);
		await this.afterParses();
	};

	private async afterParses(): Promise<void> {
		const failed = this.tiers.filter((t) => t.parse === 'failed');
		if (failed.some((t) => t.error?.code === 'MODEL_CREDIT')) {
			// Run-stopping: as today, the whole run stops and nothing is kept.
			this.fatal = ERRORS.MODEL_CREDIT;
			this.phase = 'form';
			for (const t of this.tiers) {
				t.parse = 'idle';
				t.error = null;
				t.attempts = 0;
			}
			return;
		}
		if (failed.length > 0) {
			this.phase = 'stopped';
			return;
		}
		if (!this.twoTiers) {
			this.phase = 'done';
			return;
		}
		await this.runMatch();
	}

	private async runMatch(): Promise<void> {
		this.phase = 'running';
		this.match = 'running';
		this.matchError = null;
		// One silent retry on a retryable failure: the UI still says "Matching…".
		for (let silent = 0; silent < 2; silent++) {
			this.matchAttempts += 1;
			await this.wait(2000);
			const failure = this.matchFailure();
			if (!failure) {
				this.match = 'done';
				this.pairs = SAMPLE_PAIRS;
				this.phase = 'done';
				return;
			}
			if (!failure.retryable) {
				this.match = 'failed';
				this.matchError = failure;
				this.pairs = 0;
				this.notice = failure.message;
				this.phase = 'done';
				return;
			}
			this.matchError = failure;
		}
		this.match = 'failed';
		this.phase = 'stopped';
	}

	private matchFailure(): StepError | null {
		if (this.scenario === 'match-nonretryable') return ERRORS.MATCH_NEEDS_NATIVE_PDF;
		// Fails on the first visible attempt (both silent tries), succeeds on Try again.
		if (this.scenario === 'match-retryable' && this.matchAttempts <= 2)
			return this.matchAttempts === 1 ? ERRORS.MODEL_RETRYABLE : ERRORS.INVALID_MODEL_OUTPUT;
		return null;
	}

	tryMatchAgain = async (): Promise<void> => {
		if (this.phase !== 'stopped' || this.match !== 'failed') return;
		await this.runMatch();
	};

	continueWithoutPairs = (): void => {
		if (this.phase !== 'stopped' || this.match !== 'failed') return;
		this.match = 'skipped';
		this.pairs = 0;
		this.phase = 'done';
	};

	/** What the run would hand to createFromParse, for the state readout. */
	get snapshot(): unknown {
		return {
			phase: this.phase,
			scenario: this.scenario,
			tiers: this.tiers.map((t) => ({
				paper: t.paper,
				markscheme: t.markscheme,
				parse: t.parse,
				error: t.error?.code ?? null,
				tierName: t.tierName,
				entries: t.entries
			})),
			match: this.match,
			matchError: this.matchError?.code ?? null,
			pairs: this.pairs,
			notice: this.notice,
			fatal: this.fatal?.code ?? null,
			mismatch: this.mismatch.map((m) => m.message)
		};
	}
}

const shared = new UploadRun();

export function uploadRun(): UploadRun {
	return shared;
}
