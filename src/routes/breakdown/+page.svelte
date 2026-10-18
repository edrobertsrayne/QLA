<!--
	The review step: the whole breakdown, editable in place, checked against the
	paper, and confirmed once it can carry a marksheet. Confirming is the moment
	the breakdown stops being editable and becomes what marks are keyed against.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import BreakdownTable from '$lib/components/marksheet/BreakdownTable.svelte';
	import NewUploadDialog from '$lib/components/marksheet/NewUploadDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import {
		entryName,
		questionCount,
		runWarnings,
		type AttentionItem
	} from '$lib/marksheet/breakdown.js';
	import { totalMarks } from '$lib/marksheet/document.js';
	import { marksheetStore } from '$lib/marksheet/index.js';

	// The route's load guard has read storage by the time this renders.
	const store = marksheetStore();

	const entries = $derived(store.document?.breakdown.entries ?? []);
	const runLevelWarnings = $derived(runWarnings(store.document?.breakdown.warnings ?? []));
	const attention = $derived(store.attention);
	const blockers = $derived(store.blockers);
	const questions = $derived(questionCount(entries));
	const marks = $derived(totalMarks(entries));
	const usage = $derived(store.runUsage);
	/** Whether the table groups its rows under their question (a bound checkbox needs `let`). */
	let banded = $state(true);

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
			const count = blockers.emptyLabels.length;
			messages.push(
				count === 1
					? '1 entry has no label, so its column would have no heading.'
					: `${count} entries have no label, so their columns would have no headings.`
			);
		}
		if (repeatedLabels.length > 0) {
			messages.push(
				`${repeatedLabels.join(', ')} ${repeatedLabels.length === 1 ? 'is' : 'are each'} used more than once — every column needs its own label.`
			);
		}
		return messages;
	});

	function onLabelInput(event: Event): void {
		store.setPaperLabel((event.target as HTMLInputElement).value);
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
		const row = document.querySelector<HTMLElement>(`[data-entry="${item.entry.id}"]`);
		row?.scrollIntoView({ block: 'center' });
		row
			?.querySelector<HTMLElement>(
				item.reasons.includes('no-available-marks')
					? '[data-field="marks"]'
					: '[data-field="label"]'
			)
			?.focus();
	}

	function confirmBreakdown(): void {
		if (store.confirmBreakdown()) void goto(resolve('/marksheet'));
	}
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<main class="mx-auto max-w-6xl space-y-6 p-6">
	<header class="flex items-start justify-between gap-4">
		<div class="space-y-2">
			<Input
				aria-label="Paper label"
				class="h-auto border-transparent bg-transparent px-1 text-2xl font-bold tracking-tight shadow-none hover:border-input"
				placeholder="Name this paper"
				value={store.document?.paper.label ?? ''}
				oninput={onLabelInput}
			/>
			<p class="px-1 text-sm text-muted-foreground">
				{entries.length} entries · {marks} marks{#if usage}
					· this run: {usage.totalTokens} tokens · ${usage.estCost.toFixed(4)}{/if}
			</p>
		</div>
		<NewUploadDialog />
	</header>

	<div class="grid gap-6 lg:grid-cols-[320px_1fr]">
		<aside class="space-y-4 lg:sticky lg:top-4 lg:self-start">
			<div>
				<h1 class="text-xl font-semibold">Check the breakdown</h1>
				<p class="text-sm text-muted-foreground">
					Fix anything the model got wrong. Once confirmed, this is what your marksheet columns are
					built from.
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
					Builds your marksheet: <strong>{entries.length}</strong> column{entries.length === 1
						? ''
						: 's'} across <strong>{questions}</strong>
					{questions === 1 ? 'question' : 'questions'}, <strong>{marks}</strong> marks. The breakdown
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

			<label class="flex items-center gap-1.5 text-xs text-muted-foreground">
				<input type="checkbox" bind:checked={banded} /> Band by question
			</label>
		</aside>

		<div class="min-w-0 space-y-3">
			<BreakdownTable {banded} />

			{#if entries.length === 0}
				<p class="text-sm text-muted-foreground">
					The parse returned no entries. Start a new upload to try another paper.
				</p>
			{/if}
		</div>
	</div>
</main>
