<!--
	The review step: the whole breakdown, editable in place, checked against the
	paper, and confirmed once it can carry a marksheet. Confirming is the moment
	the breakdown stops being editable and becomes what marks are keyed against.
-->
<script lang="ts">
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import AoDescriptionsCard from '$lib/components/marksheet/AoDescriptionsCard.svelte';
	import BreakdownTable from '$lib/components/marksheet/BreakdownTable.svelte';
	import BackupCard from '$lib/components/shell/BackupCard.svelte';
	import PaperLabelInput from '$lib/components/shell/PaperLabelInput.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		entryName,
		questionCount,
		reconcilePaperTotal,
		runWarnings,
		type AttentionItem
	} from '$lib/marksheet/breakdown.js';
	import { isWholeNumber, totalMarks } from '$lib/marksheet/document.js';
	import { goToSurface, marksheetStore } from '$lib/marksheet/index.js';
	import { agree, count } from '$lib/prose.js';
	// PROTOTYPE (#113): ?variant=A1|A2|A3 (layouts of the winning variant A) or B|C (earlier
	// losers, off the bar) swaps in a two-tier review on stub data.
	import { page } from '$app/state';
	import PrototypeSwitcher from '$lib/components/prototype/PrototypeSwitcher.svelte';
	import LockedView from '$lib/prototypes/two-tier-review/LockedView.svelte';
	import StubPanel from '$lib/prototypes/two-tier-review/StubPanel.svelte';
	import VariantA from '$lib/prototypes/two-tier-review/VariantA.svelte';
	import VariantB from '$lib/prototypes/two-tier-review/VariantB.svelte';
	import VariantC from '$lib/prototypes/two-tier-review/VariantC.svelte';
	import { twoTierReview } from '$lib/prototypes/two-tier-review/review.svelte.js';
	const VARIANTS = [
		{ key: 'A1', label: 'One column' },
		{ key: 'A2', label: 'Header bar' },
		{ key: 'A3', label: 'Sidebar tabs' }
	];
	const variant = $derived(page.url.searchParams.get('variant'));
	const review = twoTierReview();

	// The route's load guard has read storage by the time this renders.
	const store = marksheetStore();

	let table = $state<ReturnType<typeof BreakdownTable>>();

	const entries = $derived(store.entries);
	const runLevelWarnings = $derived(runWarnings(store.warnings));
	const attention = $derived(store.attention);
	const blockers = $derived(store.blockers);
	const questions = $derived(questionCount(entries));
	const marks = $derived(totalMarks(entries));
	const usage = $derived(store.runUsage);
	/** Whether the table groups its rows under their question (a bound checkbox needs `let`). */
	let banded = $state(true);
	/**
	 * The total the teacher reads off the paper's cover. It is theirs for this
	 * visit only: it is not part of the stored document, so it is never restored.
	 */
	let paperTotal = $state<number | null>(null);

	const check = $derived(paperTotal === null ? null : reconcilePaperTotal(entries, paperTotal));

	const title = $derived(
		store.document?.paper.label
			? `${store.document.paper.label} · Breakdown · QLA`
			: 'Breakdown · QLA'
	);

	const missingMarkNames = $derived(blockers.noAvailableMarks.map(entryName));
	const repeatedLabels = $derived([
		...new Set(blockers.duplicateLabels.map((entry) => entry.label.trim()))
	]);

	/** What stops confirmation, said once: each reason is a sentence of its own. */
	const blockerMessages = $derived.by(() => {
		const messages: string[] = [];
		if (missingMarkNames.length > 0) {
			messages.push(
				`Available marks are not yet known for ${missingMarkNames.join(', ')} — every column needs them before the marksheet can be built.`
			);
		}
		if (blockers.emptyLabels.length > 0) {
			const n = blockers.emptyLabels.length;
			messages.push(
				`${count(n, 'entry', 'entries')} ${agree(n, 'has', 'have')} no label, so ${agree(n, 'its column would have', 'their columns would have')} no ${agree(n, 'heading', 'headings')}.`
			);
		}
		if (repeatedLabels.length > 0) {
			messages.push(
				`${repeatedLabels.join(', ')} ${agree(repeatedLabels.length, 'is', 'are each')} used more than once — every column needs its own label.`
			);
		}
		return messages;
	});

	/** Take the printed total as it is typed, and refuse anything that is not a whole number. */
	function onPaperTotalInput(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		const typed = input.value.trim();
		if (typed === '') paperTotal = null;
		else if (isWholeNumber(typed)) paperTotal = Number(typed);
		else input.value = paperTotal === null ? '' : String(paperTotal);
	}

	/** Why an entry is on the list, in the words a teacher would use. */
	function attentionReasons(item: AttentionItem): string {
		const reasons: string[] = [];
		if (item.reasons.includes('no-available-marks')) reasons.push('no available marks');
		if (item.reasons.includes('empty-label')) reasons.push('no label');
		if (item.reasons.includes('duplicate-label')) reasons.push('duplicate label');
		return reasons.join(', ');
	}

	/** The whole item as one phrase: what, why, and what the parse said about it. */
	function attentionLabel(item: AttentionItem): string {
		const codes = item.warnings.map((warning) => warning.code).join(', ');
		const why = [attentionReasons(item), codes].filter((part) => part !== '').join('; ');
		return why === '' ? entryName(item.entry) : `${entryName(item.entry)}: ${why}`;
	}

	/** Scroll to an entry and put the cursor in the field that blocks confirmation. */
	function goToEntry(item: AttentionItem): void {
		table?.focusEntry(
			item.entry.id,
			item.reasons.includes('no-available-marks') ? 'marks' : 'label'
		);
	}

	function confirmBreakdown(): void {
		if (store.confirmBreakdown()) goToSurface();
	}
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

{#if variant !== null}
	{#if review.locked}
		<LockedView />
	{:else if variant === 'B'}
		<VariantB />
	{:else if variant === 'C'}
		<VariantC />
	{:else}
		<VariantA layout={variant === 'A2' ? 2 : variant === 'A3' ? 3 : 1} />
	{/if}
	<StubPanel />
	<PrototypeSwitcher variants={VARIANTS} current={variant} />
{:else}
	<main class="mx-auto max-w-6xl space-y-6 p-6">
		<header class="space-y-3">
			<div class="flex items-start justify-between gap-4">
				<div class="space-y-2">
					<PaperLabelInput />
					<p class="px-1 text-sm text-muted-foreground">
						{entries.length} entries · {marks} marks{#if usage}
							· this run: {usage.totalTokens} tokens · ${usage.estCost.toFixed(4)}{/if}
					</p>
				</div>
			</div>
			<BackupCard />
		</header>

		<div class="grid gap-6 lg:grid-cols-[320px_1fr]">
			<aside class="space-y-4 lg:sticky lg:top-4 lg:self-start">
				<div>
					<h1 class="text-xl font-semibold">Check the breakdown</h1>
					<p class="text-sm text-muted-foreground">
						Fix anything the model got wrong. Once confirmed, this is what your marksheet columns
						are built from.
					</p>
				</div>

				{#if runLevelWarnings.length > 0}
					<section class="space-y-1 rounded-lg border p-3" data-testid="run-warnings">
						<h2 class="text-sm font-semibold">From the parse</h2>
						{#each runLevelWarnings as warning (warning.code + warning.message)}
							<p class="text-xs text-amber-800 dark:text-amber-300">
								<TriangleAlertIcon class="mr-1 inline size-3.5" /><strong>{warning.code}</strong>: {warning.message}
							</p>
						{/each}
					</section>
				{/if}

				<section class="space-y-2 rounded-lg border p-3" data-testid="paper-total">
					<h2 class="text-sm font-semibold">Does it add up?</h2>
					<Label class="text-xs text-muted-foreground" for="paper-total">
						Total marks printed on the paper
					</Label>
					<Input
						id="paper-total"
						class="w-24"
						type="number"
						min="0"
						step="1"
						inputmode="numeric"
						placeholder="—"
						value={paperTotal ?? ''}
						oninput={onPaperTotalInput}
					/>
					{#if check === null}
						<p class="text-xs text-muted-foreground">
							This breakdown accounts for <strong>{marks}</strong>
							{agree(marks, 'mark', 'marks')}.
						</p>
					{:else if check.status === 'adds-up'}
						<p class="text-xs text-emerald-700 dark:text-emerald-400">
							{check.accounted} of {check.paperTotal} — adds up{#if check.noAvailableMarks.length > 0},
								but {count(check.noAvailableMarks.length, 'entry', 'entries')}
								{agree(check.noAvailableMarks.length, 'has', 'have')} no available marks yet{/if}.
						</p>
					{:else if check.status === 'unaccounted'}
						<p class="text-xs text-destructive">
							{check.accounted} of {check.paperTotal} — {check.unaccounted}
							{agree(check.unaccounted, 'mark', 'marks')} unaccounted —
							{#if check.noAvailableMarks.length > 0}
								{count(check.noAvailableMarks.length, 'entry', 'entries')}
								{agree(check.noAvailableMarks.length, 'has', 'have')} no available marks yet.
							{:else}
								an entry may be missing.
							{/if}
						</p>
					{:else}
						<p class="text-xs text-destructive">
							{check.accounted} of {check.paperTotal} — {-check.unaccounted}
							{agree(-check.unaccounted, 'mark', 'marks')} too many — an entry may be duplicated or over-marked.
						</p>
					{/if}
				</section>

				<AoDescriptionsCard />

				<section class="space-y-1 rounded-lg border p-3">
					<h2 class="text-sm font-semibold">Needs attention ({attention.length})</h2>
					<ul class="space-y-0.5">
						{#each attention as item (item.entry.id)}
							{@const reasons = attentionReasons(item)}
							{@const codes = item.warnings.map((warning) => warning.code).join(', ')}
							<li>
								<button
									type="button"
									aria-label={attentionLabel(item)}
									class="w-full rounded px-1.5 py-1 text-left text-xs hover:bg-muted"
									onclick={() => goToEntry(item)}
								>
									<strong class="mr-1">{entryName(item.entry)}</strong>
									{#if reasons !== ''}
										<span class="text-destructive">{reasons}</span>
									{/if}
									{#if codes !== ''}
										<span class="text-amber-700 dark:text-amber-400">{codes}</span>
									{/if}
								</button>
							</li>
						{:else}
							<li class="text-xs text-muted-foreground">Nothing flagged.</li>
						{/each}
					</ul>
				</section>

				<section class="space-y-2 rounded-lg border-2 border-primary p-3">
					<h2 class="text-sm font-semibold">Confirm breakdown</h2>
					<p class="text-xs text-muted-foreground">
						Builds your marksheet: <strong>{entries.length}</strong>
						{agree(entries.length, 'column', 'columns')} across <strong>{questions}</strong>
						{agree(questions, 'question', 'questions')}, <strong>{marks}</strong> marks. The breakdown
						becomes read-only.
					</p>
					{#if blockerMessages.length > 0}
						<div class="space-y-1 text-xs text-destructive">
							{#each blockerMessages as message (message)}
								<p>{message}</p>
							{/each}
						</div>
					{/if}
					<Button class="w-full" disabled={blockers.blocked} onclick={confirmBreakdown}>
						Confirm and build marksheet
					</Button>
				</section>

				<Label class="gap-1.5 text-xs font-normal text-muted-foreground">
					<Checkbox bind:checked={banded} /> Band by question
				</Label>
			</aside>

			<div class="min-w-0 space-y-3">
				<BreakdownTable bind:this={table} {banded} />

				{#if entries.length === 0}
					<p class="text-sm text-muted-foreground">
						The parse returned no entries. Add one below, or start a new upload to try another
						paper.
					</p>
				{/if}
			</div>
		</div>
	</main>
{/if}
