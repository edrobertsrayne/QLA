<script lang="ts">
	// Minimal page completion (#12): classroom teacher runs a full parse
	// unaided — two PDFs + board/subject/tier/spec-URL + optional model
	// override + Run, then views, copies and downloads the breakdown JSON.
	// The breakdown lives in browser memory only (`result` state, cleared on
	// reload — no localStorage/IndexedDB, no server copy, no auth/history)
	// with a warning panel (amber, success-with-warnings) distinct from the
	// fatal error panel (red, with retry guidance).

	// Mirrors the server per-file cap (src/lib/server/parse/schema.ts).
	const MAX_FILE_BYTES = 15 * 1024 * 1024;

	interface ParseWarning {
		questionNumber: string | null;
		code: string;
		message: string;
	}

	interface RunResult {
		breakdown: unknown;
		specRef: { board: string; specCode: string; tier: string; version: string; urlHash: string };
		warnings: ParseWarning[];
		usage: { promptTokens: number; completionTokens: number; totalTokens: number; estCost: number };
	}

	interface FatalError {
		code: string;
		message: string;
		retryable?: boolean;
	}

	// Error codes where a plain retry may succeed (transient upstream or
	// output slip). Anything else is an input or configuration problem.
	const RETRYABLE_CODES = new Set([
		'SPEC_FETCH_ERROR',
		'MODEL_RETRYABLE',
		'MODEL_ERROR',
		'MALFORMED_MODEL_OUTPUT',
		'REQUEST_FAILED'
	]);

	let assessmentPaper: File | null = $state(null);
	let markscheme: File | null = $state(null);
	let paperError: string | null = $state(null);
	let markschemeError: string | null = $state(null);
	let board = $state('');
	let subject = $state('');
	let tier = $state('');
	let specUrl = $state('');
	let modelOverride = $state('');
	let running = $state(false);
	let result: RunResult | null = $state(null);
	let fatal: FatalError | null = $state(null);
	let copied = $state(false);
	let copyFailed = $state(false);

	const breakdownJson = $derived.by(() => {
		const current = result;
		if (!current) return '';
		return JSON.stringify({ breakdown: current.breakdown, specRef: current.specRef }, null, 2);
	});

	const fatalIsRetryable = $derived.by(() => {
		const current = fatal;
		if (!current) return false;
		return current.retryable === true || RETRYABLE_CODES.has(current.code);
	});

	const canRun = $derived(
		assessmentPaper !== null &&
			markscheme !== null &&
			paperError === null &&
			markschemeError === null &&
			board.trim() !== '' &&
			subject.trim() !== '' &&
			tier.trim() !== '' &&
			specUrl.trim() !== '' &&
			!running
	);

	function checkPdf(file: File): string | null {
		const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
		if (!isPdf) return 'Only PDF files are accepted.';
		if (file.size > MAX_FILE_BYTES) return 'File exceeds the 15MB per-file limit.';
		return null;
	}

	function onPaperChange(event: Event): void {
		const file = (event.target as HTMLInputElement).files?.[0] ?? null;
		paperError = file ? checkPdf(file) : null;
		assessmentPaper = file && !paperError ? file : null;
	}

	function onMarkschemeChange(event: Event): void {
		const file = (event.target as HTMLInputElement).files?.[0] ?? null;
		markschemeError = file ? checkPdf(file) : null;
		markscheme = file && !markschemeError ? file : null;
	}

	async function run(): Promise<void> {
		if (!canRun || !assessmentPaper || !markscheme) return;
		running = true;
		result = null;
		fatal = null;
		copied = false;
		copyFailed = false;
		try {
			const form = new FormData();
			form.append('assessmentPaper', assessmentPaper);
			form.append('markscheme', markscheme);
			form.append('board', board.trim());
			form.append('subject', subject.trim());
			form.append('tier', tier.trim());
			form.append('specUrl', specUrl.trim());
			if (modelOverride.trim() !== '') form.append('modelOverride', modelOverride.trim());

			const response = await fetch('/api/parse', { method: 'POST', body: form });
			const body = (await response.json()) as RunResult | { error: FatalError };
			if (!response.ok) {
				fatal = (body as { error: FatalError }).error;
			} else {
				result = body as RunResult;
			}
		} catch (error) {
			fatal = {
				code: 'REQUEST_FAILED',
				message: error instanceof Error ? error.message : 'The run could not be completed.'
			};
		} finally {
			running = false;
		}
	}

	async function copyBreakdown(): Promise<void> {
		if (!result) return;
		copyFailed = false;
		try {
			await navigator.clipboard.writeText(breakdownJson);
			copied = true;
		} catch {
			copyFailed = true;
		}
	}

	function downloadBreakdown(): void {
		if (!result) return;
		const blob = new Blob([breakdownJson], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		const paperId =
			result.breakdown !== null &&
			typeof result.breakdown === 'object' &&
			'paperId' in result.breakdown &&
			typeof (result.breakdown as { paperId: unknown }).paperId === 'string' &&
			(result.breakdown as { paperId: string }).paperId !== ''
				? (result.breakdown as { paperId: string }).paperId
				: 'breakdown';
		anchor.href = url;
		anchor.download = `${paperId}.json`;
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
		URL.revokeObjectURL(url);
	}
</script>

<main class="mx-auto max-w-3xl space-y-6 p-6">
	<div>
		<h1 class="text-2xl font-bold">Parse assessment paper</h1>
		<p class="text-sm text-zinc-600">
			Attach the assessment paper PDF and its markscheme PDF, enter the exam specification details,
			then Run. The breakdown maps each question to spec codes from the pinned exam specification.
		</p>
	</div>

	<section class="space-y-4">
		<div>
			<label class="block text-sm font-medium" for="paper">Assessment paper (PDF)</label>
			<input
				id="paper"
				class="mt-1 block w-full text-sm"
				type="file"
				accept="application/pdf"
				onchange={onPaperChange}
			/>
			{#if paperError}
				<p class="mt-1 text-sm text-red-700">{paperError}</p>
			{/if}
		</div>

		<div>
			<label class="block text-sm font-medium" for="markscheme">Markscheme (PDF)</label>
			<input
				id="markscheme"
				class="mt-1 block w-full text-sm"
				type="file"
				accept="application/pdf"
				onchange={onMarkschemeChange}
			/>
			{#if markschemeError}
				<p class="mt-1 text-sm text-red-700">{markschemeError}</p>
			{/if}
		</div>

		<div class="grid grid-cols-2 gap-4">
			<div>
				<label class="block text-sm font-medium" for="board">Board</label>
				<input
					id="board"
					class="mt-1 block w-full rounded border px-2 py-1 text-sm"
					type="text"
					placeholder="AQA"
					bind:value={board}
				/>
			</div>
			<div>
				<label class="block text-sm font-medium" for="subject">Subject / spec code</label>
				<input
					id="subject"
					class="mt-1 block w-full rounded border px-2 py-1 text-sm"
					type="text"
					placeholder="8463"
					bind:value={subject}
				/>
			</div>
			<div>
				<label class="block text-sm font-medium" for="tier">Tier</label>
				<input
					id="tier"
					class="mt-1 block w-full rounded border px-2 py-1 text-sm"
					type="text"
					placeholder="H"
					bind:value={tier}
				/>
			</div>
			<div>
				<label class="block text-sm font-medium" for="model">Model override (optional)</label>
				<input
					id="model"
					class="mt-1 block w-full rounded border px-2 py-1 text-sm"
					type="text"
					placeholder="Default model unless set"
					bind:value={modelOverride}
				/>
			</div>
		</div>

		<div>
			<label class="block text-sm font-medium" for="specUrl">Exam specification URL</label>
			<input
				id="specUrl"
				class="mt-1 block w-full rounded border px-2 py-1 text-sm"
				type="url"
				placeholder="https://…/specification.pdf"
				bind:value={specUrl}
			/>
		</div>

		<button
			class="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
			type="button"
			disabled={!canRun}
			onclick={run}
		>
			{running ? 'Running…' : 'Run'}
		</button>
	</section>

	{#if fatal}
		<section
			class="rounded border border-red-300 bg-red-50 p-4"
			aria-live="polite"
			data-testid="fatal-panel"
		>
			<h2 class="text-sm font-bold text-red-800">Run failed ({fatal.code})</h2>
			<p class="mt-1 text-sm text-red-700">{fatal.message}</p>
			{#if fatalIsRetryable}
				<p class="mt-1 text-sm text-red-700">This looks temporary — please try again.</p>
			{:else if fatal.code === 'MISSING_API_KEY'}
				<p class="mt-1 text-sm text-red-700">
					The problem is server-side, not with your inputs. Contact whoever runs this page.
				</p>
			{:else}
				<p class="mt-1 text-sm text-red-700">
					Check your inputs — the assessment paper, markscheme and exam specification details — then
					try again.
				</p>
			{/if}
		</section>
	{/if}

	{#if result}
		<section class="space-y-3" aria-live="polite">
			<h2 class="text-lg font-bold">Breakdown</h2>
			{#if result.warnings.length > 0}
				<div class="rounded border border-amber-300 bg-amber-50 p-4" data-testid="warning-panel">
					<h3 class="text-sm font-bold text-amber-800">
						{result.warnings.length} warning{result.warnings.length === 1 ? '' : 's'} — breakdown returned
						intact
					</h3>
					<ul class="mt-1 list-disc pl-5 text-sm text-amber-900">
						{#each result.warnings as warning (warning.code + warning.questionNumber + warning.message)}
							<li>
								<strong>{warning.code}</strong>{warning.questionNumber
									? ` (Q${warning.questionNumber})`
									: ''}: {warning.message}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
			<p class="text-sm text-zinc-600">
				Usage: {result.usage.totalTokens} tokens · estimated cost ${result.usage.estCost.toFixed(4)}
			</p>
			<div class="flex gap-2">
				<button
					class="rounded border px-3 py-1 text-sm font-medium disabled:opacity-40"
					type="button"
					disabled={running || breakdownJson === ''}
					onclick={copyBreakdown}
				>
					{copied ? 'Copied' : 'Copy JSON'}
				</button>
				<button
					class="rounded border px-3 py-1 text-sm font-medium disabled:opacity-40"
					type="button"
					disabled={running || breakdownJson === ''}
					onclick={downloadBreakdown}
				>
					Download JSON
				</button>
			</div>
			{#if copyFailed}
				<p class="text-sm text-red-700">
					Copy failed — select the breakdown below and copy it manually.
				</p>
			{/if}
			<pre
				class="max-h-[480px] overflow-auto rounded border bg-zinc-50 p-4 text-xs"
				data-testid="breakdown-viewer">{breakdownJson}</pre>
		</section>
	{/if}
</main>
