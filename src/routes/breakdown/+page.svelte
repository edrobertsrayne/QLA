<!--
	The review step: the whole assessment's breakdowns, editable in place,
	checked against the papers, and confirmed once they can carry a marksheet.
	Confirming is the moment the breakdowns and the common questions stop being
	editable and become what marks and the common-questions analysis are keyed
	against.

	One layout serves one tier and two: the header bar holds whatever the
	assessment has (tier tabs and the common-questions summary on two tiers),
	the row of cards beneath it holds the shared skill descriptions and the open
	tier's findings, and the open tier's table runs at full width.
-->
<script lang="ts">
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import AoDescriptionsCard from '$lib/components/marksheet/AoDescriptionsCard.svelte';
	import BreakdownTable from '$lib/components/marksheet/BreakdownTable.svelte';
	import BackupControl from '$lib/components/marksheet/BackupControl.svelte';
	import { tierLabel } from '$lib/components/marksheet/tier-label.js';
	import PaperLabelInput from '$lib/components/shell/PaperLabelInput.svelte';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import {
		confirmationMessages,
		entryName,
		noPairsNotice,
		pairedMarks,
		runWarnings,
		tierHasBlocker,
		type AttentionItem
	} from '$lib/marksheet/breakdown.js';
	import { totalMarks, type TierIndex } from '$lib/marksheet/document.js';
	import { goToSurface, marksheetStore } from '$lib/marksheet/index.js';
	import { agree, count } from '$lib/prose.js';

	// The route's load guard has read storage by the time this renders.
	const store = marksheetStore();
	const document = $derived(store.document);

	let table = $state<ReturnType<typeof BreakdownTable>>();

	/** The open tier tab. A string because the toggle group binds one. */
	let tab = $state('0');
	const current = $derived<TierIndex>(tab === '1' ? 1 : 0);
	/** Whether this assessment has two papers to review together. */
	const twoTiers = $derived(store.tierCount === 2);
	/** Why the last tier-name keystroke was refused, and the tier it was for. */
	let tierNameRefusal = $state<{ tier: TierIndex; text: string } | null>(null);
	const openNameRefusal = $derived(
		tierNameRefusal !== null && tierNameRefusal.tier === current ? tierNameRefusal.text : null
	);
	const entries = $derived(store.entries);
	const openTier = $derived(store.tiers[current]);
	const attention = $derived(store.attentionOf(current));
	const runLevelWarnings = $derived(openTier ? runWarnings(openTier.breakdown.warnings) : []);
	const blockers = $derived(store.blockers);
	const usage = $derived(store.runUsage);
	/** Whether the breakdown was unlocked after marks were entered: the stakes, before an edit. */
	const studentsWithMarks = $derived.by(() => {
		if (document === null) return 0;
		return store.students.filter(
			(student) => Object.keys(document.marks[student.id] ?? {}).length > 0
		).length;
	});
	const unlocked = $derived(
		store.document !== null && store.document.breakdownConfirmedAt === null && studentsWithMarks > 0
	);
	/** What confirming builds, in one line, so the whole thing is visible as it is confirmed. */
	const summary = $derived.by(() => {
		if (document === null) return '';
		if (twoTiers) {
			return `${count(entries.length, 'column')} across both tiers · ${count(
				store.commonQuestions.length,
				'common question'
			)} (${count(pairedMarks(document), 'mark')})`;
		}
		return `${count(entries.length, 'column')} · ${count(totalMarks(entries), 'mark')}`;
	});

	/** Whether the table groups its rows under their question (a bound checkbox needs `let`). */
	let banded = $state(true);

	const title = $derived(store.label ? `${store.label} · Breakdown · QLA` : 'Breakdown · QLA');
	const heading = $derived(twoTiers ? 'Check the breakdowns' : 'Check the breakdown');

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

<main class="mx-auto max-w-7xl space-y-6 p-6">
	<div class="space-y-2">
		<PaperLabelInput />
	</div>

	{#if document !== null}
		{@const notice = noPairsNotice(document, store.matchNotice)}
		{#if notice !== null}
			<Alert data-testid="match-notice">
				<AlertTitle>{notice.title}</AlertTitle>
				<AlertDescription>{notice.description}</AlertDescription>
			</Alert>
		{/if}
	{/if}

	{#if unlocked}
		<Alert data-testid="unlocked-notice">
			<AlertTitle>Unlocked for editing</AlertTitle>
			<AlertDescription>
				{count(studentsWithMarks, 'student')}
				{agree(studentsWithMarks, 'has', 'have')} marks. Deleting an entry removes its marks{#if twoTiers};
					changing a pair only changes the common-questions analysis{/if}. Confirm again to go back
				to marking.
			</AlertDescription>
		</Alert>
	{/if}

	<header class="space-y-3">
		<div class="flex items-start justify-between gap-4">
			<div class="space-y-1">
				<h1 class="text-xl font-semibold">{heading}</h1>
				<p class="text-sm text-muted-foreground">
					{#if twoTiers}
						Fix anything the model got wrong on either tier, and pair the questions that appear on
						both in the Common with column (only entries with the same available marks are offered).
					{:else}
						Fix anything the model got wrong.
					{/if}
				</p>
				{#if usage}
					<p class="text-xs text-muted-foreground">
						This run: {usage.totalTokens} tokens · ${usage.estCost.toFixed(4)} estimated
					</p>
				{/if}
			</div>
			<BackupControl />
		</div>

		<div class="flex flex-wrap items-center gap-4">
			{#if twoTiers}
				<!-- A single toggle group reports '' when the open tab is clicked again; stay on it. -->
				<ToggleGroup.Root
					type="single"
					variant="outline"
					bind:value={
						() => tab,
						(value: string | string[] | undefined) => {
							if (value === '0' || value === '1') tab = value;
						}
					}
				>
					{#each [0, 1] as const as tier (tier)}
						<ToggleGroup.Item value={String(tier)} class="relative px-4" data-tier={tier}>
							{tierLabel(document, tier)}
							{#if tierHasBlocker(blockers, tier)}
								<span
									class="absolute top-1 right-1 size-2 rounded-full bg-destructive"
									title="Stops confirmation"
									aria-hidden="true"
									data-testid="tier-blocker-dot"
								></span>
							{/if}
						</ToggleGroup.Item>
					{/each}
				</ToggleGroup.Root>
			{/if}
			<p class="text-xs text-muted-foreground md:ml-auto md:text-right" data-testid="summary">
				{summary}
			</p>
			<Button disabled={blockers.blocked} onclick={confirmBreakdown}>
				Confirm and build marksheet
			</Button>
		</div>

		{#if document !== null}
			{@const messages = confirmationMessages(document, blockers)}
			{#if messages.length > 0}
				<div class="space-y-1 text-xs text-destructive" data-testid="blockers" role="status">
					{#each messages as message, index (index)}
						<p>{message}</p>
					{/each}
				</div>
			{/if}
		{/if}
	</header>

	<div class="grid gap-3 md:grid-cols-2">
		<AoDescriptionsCard />

		<section class="space-y-2 rounded-lg border p-3" data-testid="needs-attention">
			<h2 class="text-sm font-semibold">
				Needs attention ({attention.length}){#if twoTiers}<span
						class="font-normal text-muted-foreground"
					>
						{` · ${tierLabel(document, current)}`}</span
					>{/if}
			</h2>
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
			{#if runLevelWarnings.length > 0}
				<div class="space-y-1" data-testid="run-warnings">
					<h3 class="text-xs font-semibold">From the parse</h3>
					{#each runLevelWarnings as warning (warning.code + warning.message)}
						<p class="text-xs text-amber-800 dark:text-amber-300">
							<TriangleAlertIcon class="mr-1 inline size-3.5" /><strong>{warning.code}</strong>: {warning.message}
						</p>
					{/each}
				</div>
			{/if}
		</section>
	</div>

	{#if openTier}
		<section class="space-y-3">
			<div class="flex flex-wrap items-end gap-4">
				{#if twoTiers}
					<div class="space-y-1">
						<Label for="tier-name" class="text-xs text-muted-foreground">
							Tier name, as printed on the paper
						</Label>
						<Input
							id="tier-name"
							class="w-56"
							placeholder="e.g. Higher"
							value={openTier.tierName ?? ''}
							aria-describedby={openNameRefusal === null ? undefined : 'tier-name-problem'}
							oninput={(event) => {
								const input = event.currentTarget;
								const refusal = store.setTierName(current, input.value);
								tierNameRefusal = refusal === null ? null : { tier: current, text: refusal };
								// A refused name is not the tier's: the field reads back
								// what the document holds rather than the dropped text.
								if (refusal !== null) input.value = openTier.tierName ?? '';
							}}
						/>
						{#if openNameRefusal !== null}
							<p id="tier-name-problem" role="status" class="text-xs text-destructive">
								{openNameRefusal}
							</p>
						{/if}
					</div>
				{/if}
				<p class="pb-2 text-xs text-muted-foreground" data-testid="tier-counts">
					{openTier.sourceFilenames[0] ?? 'No file'}
					· {count(openTier.breakdown.entries.length, 'entry', 'entries')}
					· {count(totalMarks(openTier.breakdown.entries), 'mark')}
				</p>
				<Label class="ml-auto gap-1.5 pb-2 text-xs font-normal text-muted-foreground">
					<Checkbox bind:checked={banded} /> Band by question
				</Label>
			</div>

			<BreakdownTable bind:this={table} tier={current} {banded} />

			{#if openTier.breakdown.entries.length === 0}
				<p class="text-sm text-muted-foreground">
					The parse returned no entries. Add one below, or start a new upload to try another paper.
				</p>
			{/if}
		</section>
	{/if}
</main>
