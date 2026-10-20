<!--
	Reports: who gets one, the writing, and the pages to review and print.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount, tick } from 'svelte';
	import UndoAlert from '$lib/components/marksheet/UndoAlert.svelte';
	import ModelSelect from '$lib/components/parse/ModelSelect.svelte';
	import { ModelList } from '$lib/components/parse/model-list.svelte.js';
	import PrintRoot from '$lib/components/report/PrintRoot.svelte';
	import ReportSheet from '$lib/components/report/ReportSheet.svelte';
	import GradeBoundariesForm from '$lib/components/report/GradeBoundariesForm.svelte';
	import { isFlagged, reportFit } from '$lib/components/report/report-fit.svelte.js';
	import { ReportRun } from '$lib/components/report/report-run.svelte.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Label } from '$lib/components/ui/label';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import { blockerText, eligibilityRows, isEligible } from '$lib/marksheet/report-eligibility.js';
	import { studentName } from '$lib/marksheet/students.js';
	import { changedInputFields, generationInputFor } from '$lib/marksheet/report-input.js';
	import { agree, count } from '$lib/prose.js';
	import { MAX_LABEL_LENGTH } from '$lib/marksheet/report-limits.js';
	import { specPointCodes, topicCodesOf } from '$lib/marksheet/document.js';
	import { boundariesOf } from '$lib/marksheet/grades.js';
	import { droppedNoMarks, reportFiguresFor } from '$lib/marksheet/report-figures.js';
	type Step = 'topics' | 'grades' | 'who' | 'writing' | 'review';

	const store = marksheetStore();
	const fit = reportFit();
	const document = $derived(store.document);
	const rows = $derived(document ? eligibilityRows(document) : []);
	const students = $derived(store.students);
	const nameOf = (id: string) => {
		const student = students.find((candidate) => candidate.id === id);
		return student ? studentName(student) : '';
	};
	const eligibleIds = $derived(rows.filter((row) => row.eligible).map((row) => row.studentId));
	const blocked = $derived(rows.filter((row) => !row.eligible));
	const writtenIds = $derived(
		document ? students.filter((s) => document.reports[s.id]).map((s) => s.id) : []
	);
	/** Reports the teacher can see: written and still eligible. Ineligible
	 * reports are kept with their edits, hidden from Review and never printed.
	 */
	const reviewIds = $derived(
		document
			? students
					.filter((s) => document.reports[s.id] && isEligible(document, s.id))
					.map((s) => s.id)
			: []
	);
	/** What the stored prose no longer matches, per visible report. Grade
	 * boundaries and the model never count: they never reach the input.
	 */
	const outOfDateChanges = (id: string): string[] => {
		if (!document) return [];
		const report = document.reports[id];
		if (!report) return [];
		const changes = changedInputFields(report.input, generationInputFor(document, id));
		return changes ?? [];
	};
	const outOfDateIds = $derived(reviewIds.filter((id) => outOfDateChanges(id).length > 0));
	const editedOutOfDateIds = $derived(
		outOfDateIds.filter((id) => document?.reports[id]?.edit !== null)
	);
	let includeEdited = $state(false);

	/** The report awaiting the teacher's say-so before their edits are discarded. */
	let confirmRewrite = $state<string | null>(null);

	/** One fresh page: over a teacher's edit only with their say-so. */
	function rewriteOne(id: string): void {
		const report = document?.reports[id];
		if (!report) return;
		if (report.edit !== null) {
			confirmRewrite = id;
			return;
		}
		run.retry([id], modelOverride);
	}

	/** An emptied areas section that claims nothing: flagged because print leaves it blank. */
	const areasEmptied = (id: string): boolean => {
		const report = document?.reports[id];
		return (
			!!document &&
			!!report &&
			(report.edit ?? report).areasForImprovement.length === 0 &&
			!droppedNoMarks(reportFiguresFor(document, id))
		);
	};

	/** Every out-of-date page, leaving edited ones alone unless opted in. */
	function rewriteOutOfDate(): void {
		const ids = outOfDateIds.filter((id) => includeEdited || document?.reports[id]?.edit === null);
		if (ids.length > 0) run.retry(ids, modelOverride);
	}

	/** Print all asks first when an out-of-date or overflowing report would print. */
	interface PendingPrint {
		ids: string[] | null;
		count: number;
	}
	let confirmPrint = $state<PendingPrint | null>(null);
	let confirmOverflow = $state<PendingPrint | null>(null);
	function askPrint(ids: string[] | null): void {
		const targets = ids ?? reviewIds;
		const outOfDate = targets.filter((id) => outOfDateChanges(id).length > 0).length;
		if (outOfDate > 0) {
			confirmPrint = { ids, count: outOfDate };
			return;
		}
		askOverflow(ids, targets);
	}

	/** A flagged page never prints unannounced, even past the out-of-date check. */
	function askOverflow(ids: string[] | null, targets: string[]): void {
		const over = targets.filter((id) => isFlagged(fit.fitOf(id))).length;
		if (over > 0) confirmOverflow = { ids, count: over };
		else void print(ids);
	}

	/**
	 * Every normalised specification-point code on the paper, in first-seen
	 * order. A paper with none skips the Topic names step and makes no
	 * proposal call.
	 */
	const topicCodes = $derived(document ? topicCodesOf(document) : []);

	// The step the teacher lands on: reports written means Review, otherwise
	// the first step of the flow (Topic names when the paper has codes). The
	// layout load has already read the document before this page renders.
	const landing = store.document;
	let step = $state<Step>(
		landing && Object.keys(landing.reports).length > 0
			? 'review'
			: landing && topicCodesOf(landing).length > 0
				? 'topics'
				: 'grades'
	);

	// The paper has topic codes only when some entry carries a specification point.
	const STEPS: { id: Step; label: string }[] = $derived(
		topicCodes.length > 0
			? [
					{ id: 'topics', label: 'Topic names' },
					{ id: 'grades', label: 'Grades' },
					{ id: 'who', label: 'Who gets one' },
					{ id: 'writing', label: 'Writing' },
					{ id: 'review', label: 'Review and print' }
				]
			: [
					{ id: 'grades', label: 'Grades' },
					{ id: 'who', label: 'Who gets one' },
					{ id: 'writing', label: 'Writing' },
					{ id: 'review', label: 'Review and print' }
				]
	);

	let modelOverride = $state('');
	let modelCustom = $state(false);
	const models = new ModelList();

	onMount(() => {
		void models.load();
		if (step === 'topics' && missingNames.length > 0) void proposeMissing();
	});
	const missingNames = $derived(
		topicCodes.filter((code) => (document?.topicNames[code] ?? '').trim() === '')
	);
	// A typed name past the server's length cap would fail every report
	// write, so it blocks Next like a blank one.
	const overLongNames = $derived(
		topicCodes.filter((code) => (document?.topicNames[code] ?? '').trim().length > MAX_LABEL_LENGTH)
	);
	const topicsBlocked = $derived(missingNames.length > 0 || overLongNames.length > 0);

	let proposing = $state(false);
	let proposeError = $state<string | null>(null);

	/**
	 * Ask the model to name the codes still missing one. Typed names are never
	 * overwritten, and unusable answers (blank, over-long, contact) are dropped
	 * by the server, leaving the gap for the teacher.
	 */
	async function proposeMissing(): Promise<void> {
		if (!document || proposing) return;
		const missing = [...missingNames];
		if (missing.length === 0) return;
		proposing = true;
		proposeError = null;
		try {
			const summariesOf = (wanted: string): string[] => {
				const summaries: string[] = [];
				for (const entry of document.breakdown.entries) {
					if (specPointCodes(entry.specPoint).includes(wanted)) {
						summaries.push(entry.summary || entry.label);
					}
				}
				return summaries.slice(0, 200);
			};
			const response = await fetch('/api/topic-names', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					...(modelOverride.trim() === '' ? {} : { model: modelOverride.trim() }),
					paperLabel: document.paper.label ?? '',
					codes: missing.map((code) => ({ code, summaries: summariesOf(code) }))
				})
			});
			const payload = (await response.json().catch(() => null)) as {
				names?: Record<string, string>;
				error?: { message?: string };
			} | null;
			if (!response.ok || !payload?.names) {
				throw new Error(payload?.error?.message ?? `Proposal failed (status ${response.status}).`);
			}
			for (const code of missing) {
				const name = payload.names[code];
				if (typeof name === 'string' && store.document) {
					const current = store.document.topicNames[code] ?? '';
					if (current.trim() === '') store.setTopicName(code, name);
				}
			}
		} catch (error) {
			proposeError = error instanceof Error ? error.message : 'Proposal failed.';
		} finally {
			proposing = false;
		}
	}

	/**
	 * Every move between steps goes through here: arriving at Topic names with
	 * a gap proposes names once — not on every new gap, so blanking a name to
	 * retype it never fires a model call.
	 */
	function goTo(next: Step): void {
		const arriving = next === 'topics' && step !== 'topics';
		step = next;
		if (arriving && missingNames.length > 0) void proposeMissing();
	}

	const run = new ReportRun(store, () => {
		step = 'review';
	});

	function startRun(studentIds: string[]): void {
		if (modelCustom) modelOverride = modelOverride.trim();
		goTo('writing');
		run.start(studentIds, modelOverride);
	}

	/** Eligible students with no report: Who gets one never writes over a stored one. */
	const unwrittenIds = $derived(eligibleIds.filter((id) => document && !document.reports[id]));

	function write(): void {
		startRun(unwrittenIds);
	}

	/**
	 * Students the last run did not cover: eligible now with no report and no
	 * tile yet. A failure or a Stop leaves tiles behind, so those students are
	 * retried from the Writing step, not counted here as newly eligible.
	 */
	const pendingIds = $derived(
		eligibleIds.filter((id) => document && !document.reports[id] && !(id in run.tiles))
	);

	function writeMore(): void {
		goTo('writing');
		run.retry(pendingIds, modelOverride);
	}

	function retryFailed(): void {
		goTo('writing');
		run.retry([...run.failed], modelOverride);
	}

	/** Pages the printer gets: null means every written report. */
	let printing = $state<string[] | null>(null);

	async function print(ids: string[] | null): Promise<void> {
		printing = ids;
		await tick();
		window.print();
	}

	onMount(() => {
		const reset = () => (printing = null);
		window.addEventListener('afterprint', reset);
		return () => window.removeEventListener('afterprint', reset);
	});

	function statusOf(studentId: string): string {
		const row = rows.find((candidate) => candidate.studentId === studentId);
		if (row && !row.eligible) {
			return row.blockers.some((blocker) => blocker.kind === 'absent') ? 'Absent' : 'Blocked';
		}
		return run.tiles[studentId]?.kind === 'failed' ? 'Failed' : 'Not written';
	}

	function jumpTo(studentId: string): void {
		globalThis.document
			.querySelector(`[data-page-for="${CSS.escape(studentId)}"]`)
			?.scrollIntoView({ block: 'start' });
	}

	const TILE_LABEL = { queued: 'Queued', writing: 'Writing', ready: 'Ready', failed: 'Failed' };
</script>

<svelte:head>
	<title>Reports · QLA</title>
</svelte:head>

{#snippet namesNeeded()}
	{@const needing = missingNames.length + overLongNames.length}
	<Alert>
		<AlertDescription>
			{count(needing, 'topic')}
			{agree(needing, 'needs', 'need')} a name of at most {MAX_LABEL_LENGTH} characters before reports
			are written or printed.
		</AlertDescription>
		<Button size="xs" variant="outline" onclick={() => goTo('topics')}>Name topics</Button>
	</Alert>
{/snippet}

<main class="mx-auto max-w-6xl space-y-6 p-6 print:hidden">
	<div class="flex flex-wrap items-center gap-4">
		<Button variant="ghost" size="sm" onclick={() => void goto(resolve('/marksheet'))}>
			← Marksheet
		</Button>
		<nav aria-label="Report steps">
			<ol class="flex flex-wrap items-center gap-2 text-sm">
				{#each STEPS as item, index (item.id)}
					<li>
						<Button
							size="sm"
							variant={step === item.id ? 'default' : 'outline'}
							aria-current={step === item.id ? 'step' : undefined}
							disabled={step === 'topics' && item.id !== 'topics' && topicsBlocked}
							title={step === 'topics' && item.id !== 'topics' && topicsBlocked
								? 'Name every topic first'
								: undefined}
							onclick={() => goTo(item.id)}>{index + 1}. {item.label}</Button
						>
					</li>
				{/each}
			</ol>
		</nav>
	</div>

	{#if step === 'topics'}
		<section class="space-y-4">
			<h1 class="text-xl font-semibold">Topic names</h1>
			<p class="max-w-prose text-sm text-muted-foreground">
				Reports show a student-readable name for every specification point on the paper, never a
				bare code. Names stay with their code; retyping a code drops its name.
			</p>
			{#if proposeError}
				<p role="alert" class="rounded-md border border-destructive p-3 text-sm">
					{proposeError}
					<Button
						variant="outline"
						size="sm"
						class="ml-2"
						disabled={proposing}
						onclick={() => void proposeMissing()}>Retry</Button
					>
				</p>
			{/if}
			<ul class="max-w-xl space-y-2">
				{#each topicCodes as code (code)}
					<li class="flex items-center gap-3">
						<span class="w-24 shrink-0 font-mono text-sm">{code}</span>
						<Label class="sr-only" for={`topic-${code}`}>Name for {code}</Label>
						<input
							id={`topic-${code}`}
							class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
							value={document?.topicNames[code] ?? ''}
							maxlength={MAX_LABEL_LENGTH}
							placeholder={proposing ? 'Proposing…' : 'Name this topic'}
							oninput={(event) => store.setTopicName(code, event.currentTarget.value)}
						/>
					</li>
				{/each}
			</ul>
			<div class="flex flex-wrap gap-2">
				<Button
					variant="outline"
					disabled={proposing || missingNames.length === 0}
					onclick={() => void proposeMissing()}
				>
					{proposing ? 'Proposing…' : 'Propose missing names'}
				</Button>
				<Button disabled={topicsBlocked} onclick={() => goTo('grades')}>Next</Button>
			</div>
			{#if topicsBlocked}
				<p class="text-sm text-muted-foreground">
					{#if overLongNames.length > 0}
						Keep every name to {MAX_LABEL_LENGTH} characters: longer names fail the report run.
					{:else}
						Name every topic before continuing: reports never show a bare code.
					{/if}
				</p>
			{/if}
		</section>
	{:else if step === 'grades'}
		<section class="max-w-xl space-y-4">
			<h1 class="text-xl font-semibold">Grades</h1>
			<p class="max-w-prose text-sm text-muted-foreground">
				Reports show a grade when the paper has boundaries. Set them now, or skip and reports show
				marks only.
			</p>
			<GradeBoundariesForm onDone={() => goTo('who')} />
			<div class="flex flex-wrap gap-2">
				{#if document && boundariesOf(document)}
					<Button onclick={() => goTo('who')}>Next</Button>
				{:else}
					<Button variant="outline" onclick={() => goTo('who')}>
						Skip: no grades on these reports
					</Button>
				{/if}
			</div>
		</section>
	{:else if step === 'who'}
		<section class="space-y-4">
			<h1 class="text-xl font-semibold">{count(eligibleIds.length, 'student')} get a report</h1>
			{#if topicsBlocked}{@render namesNeeded()}{/if}
			{#if blocked.length > 0}
				<div class="space-y-2 rounded-md border p-3">
					<h2 class="font-medium">Not getting one yet</h2>
					<ul class="space-y-1 text-sm">
						{#each blocked as row (row.studentId)}
							<li>
								<span class="font-medium">{nameOf(row.studentId)}</span>
								<span class="text-muted-foreground"
									>{row.blockers.map((blocker) => blockerText(blocker)).join(' · ')}</span
								>
							</li>
						{/each}
					</ul>
					<a class="text-sm underline" href={resolve('/marksheet')}
						>Back to the marksheet to fix these</a
					>
				</div>
			{/if}
			<div class="max-w-sm space-y-2">
				<Label>Model override (optional)</Label>
				<ModelSelect
					bind:value={modelOverride}
					bind:custom={modelCustom}
					models={models.options}
					loading={models.loading}
					loadError={models.error}
					onretry={() => void models.load()}
				/>
			</div>
			<Button disabled={unwrittenIds.length === 0 || run.running || topicsBlocked} onclick={write}>
				Write {count(unwrittenIds.length, 'report')}
			</Button>
			{#if eligibleIds.length > 0 && unwrittenIds.length === 0}
				<p class="text-sm text-muted-foreground">
					Every student here has a report. Rewrite them from Review and print.
				</p>
			{/if}
		</section>
	{:else if step === 'writing'}
		<section class="space-y-4">
			{#if topicsBlocked}{@render namesNeeded()}{/if}
			{#if run.order.length === 0}
				<h1 class="text-xl font-semibold">Nothing is being written</h1>
			{:else}
				<h1 class="text-xl font-semibold">
					{run.running
						? `Writing ${run.done} of ${run.order.length}…`
						: `Wrote ${run.done} of ${run.order.length}`}
				</h1>
			{/if}
			{#if run.stoppedBy}
				<p role="alert" class="rounded-md border border-destructive p-3 text-sm">{run.stoppedBy}</p>
			{/if}
			{#if run.running}
				<Button variant="outline" onclick={() => run.stop()}>Stop</Button>
			{:else if run.order.length > 0}
				<div class="flex gap-2">
					{#if run.failed.length > 0}
						<Button variant="outline" disabled={topicsBlocked} onclick={retryFailed}>
							Retry failed
						</Button>
					{/if}
					{#if run.failed.length > 0 || writtenIds.length > 0}
						<Button onclick={() => goTo('review')}>Review {writtenIds.length}</Button>
					{/if}
					<Button variant="outline" onclick={() => goTo('who')}>Back to Who gets one</Button>
				</div>
			{/if}
			<ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
				{#each run.order as id (id)}
					{@const tile = run.tiles[id]}
					<li class="rounded-md border p-3 text-sm" data-tile-for={id}>
						<div class="font-medium">{nameOf(id)}</div>
						<div class="text-muted-foreground">{TILE_LABEL[tile?.kind ?? 'queued']}</div>
						{#if tile?.kind === 'failed'}<div class="text-destructive">{tile.message}</div>{/if}
						{#if tile?.kind === 'failed'}
							<Button
								size="sm"
								variant="outline"
								disabled={run.running || topicsBlocked}
								onclick={() => {
									goTo('writing');
									run.retry([id], modelOverride);
								}}>Retry</Button
							>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{:else if document}
		<section class="flex items-start gap-6">
			<aside class="sticky top-4 w-56 shrink-0 space-y-3 self-start">
				<Button disabled={reviewIds.length === 0 || topicsBlocked} onclick={() => askPrint(null)}>
					Print all {reviewIds.length}
				</Button>
				{#if outOfDateIds.length > 0 && !run.running}
					{@const skipped = includeEdited ? 0 : editedOutOfDateIds.length}
					{@const rewritable = outOfDateIds.length - skipped}
					<Button
						variant="outline"
						disabled={rewritable === 0 || topicsBlocked}
						onclick={rewriteOutOfDate}
						title={skipped > 0 ? 'Tick the box to include edited reports' : undefined}
					>
						Rewrite {rewritable} out of date{skipped > 0 ? ` (skips ${skipped} edited)` : ''}
					</Button>
					{#if editedOutOfDateIds.length > 0}
						<Label class="gap-1.5 text-xs font-normal text-muted-foreground">
							<Checkbox bind:checked={includeEdited} /> also rewrite {editedOutOfDateIds.length} edited
							(discards edits)
						</Label>
					{/if}
				{/if}
				{#if run.running}
					<p class="text-sm text-muted-foreground">Rewriting…</p>
				{/if}
				{#if pendingIds.length > 0 && !run.running}
					<Button variant="outline" disabled={topicsBlocked} onclick={writeMore}
						>Write {pendingIds.length} more</Button
					>
				{/if}
				<ul class="space-y-1 text-sm">
					{#each students as student (student.id)}
						{@const row = rows.find((candidate) => candidate.studentId === student.id)}
						<li>
							{#if reviewIds.includes(student.id)}
								<button type="button" class="underline" onclick={() => jumpTo(student.id)}
									>{studentName(student)}</button
								>
							{:else}
								<span>{studentName(student)}</span>
								{#if document.reports[student.id] && row && !row.eligible}
									<span class="text-muted-foreground">
										Blocked ({row.blockers.map((blocker) => blockerText(blocker)).join(' · ')})
									</span>
								{:else}
									<span class="text-muted-foreground">{statusOf(student.id)}</span>
								{/if}
							{/if}
						</li>
					{/each}
				</ul>
			</aside>
			<div class="min-w-0 flex-1 space-y-8 overflow-x-auto">
				{#if topicsBlocked}{@render namesNeeded()}{/if}
				{#if reviewIds.length === 0}
					<p>No reports have been written yet.</p>
				{/if}
				<UndoAlert kinds={['report-edit', 'report-kept']} testid="report-edit-undo" />
				{#each reviewIds as id (id)}
					{@const changes = outOfDateChanges(id)}
					{@const tile = run.tiles[id]}
					{@const pageFit = fit.fitOf(id)}
					<div data-page-for={id} class="space-y-2">
						<div class="flex flex-wrap items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={topicsBlocked}
								onclick={() => void print([id])}>Print this page</Button
							>
							{#if document.reports[id].edit !== null}
								<Badge variant="secondary">edited</Badge>
								<Button variant="outline" size="sm" onclick={() => store.revertReport(id)}
									>Revert</Button
								>
							{/if}
							{#if changes.length > 0}
								<p class="text-sm font-medium">Out of date ({changes.join(', ')})</p>
								<Button variant="outline" size="sm" onclick={() => store.keepReportWording(id)}
									>Keep wording</Button
								>
							{/if}
							{#if areasEmptied(id)}
								<Badge variant="destructive">Areas for improvement is empty</Badge>
							{/if}
							{#if isFlagged(pageFit)}
								<Badge variant="destructive"
									>Runs {pageFit.overMm} mm over the page; print cuts it off</Badge
								>
							{/if}
							<Button
								variant="outline"
								size="sm"
								disabled={topicsBlocked}
								onclick={() => rewriteOne(id)}>Rewrite</Button
							>
							{#if tile?.kind === 'writing'}
								<span class="text-sm text-muted-foreground">Rewriting…</span>
							{/if}
						</div>
						{#if tile?.kind === 'failed'}
							<p role="alert" class="rounded-md border border-destructive p-3 text-sm">
								{tile.message}
								<Button
									size="sm"
									variant="outline"
									disabled={topicsBlocked}
									onclick={() => rewriteOne(id)}>Retry</Button
								>
							</p>
						{/if}
						<ReportSheet
							{document}
							studentId={id}
							report={document.reports[id]}
							editable
							measure={false}
							onedit={(prose) => store.editReport(id, prose)}
						/>
					</div>
				{/each}
			</div>
		</section>
	{/if}
	{#if confirmRewrite !== null}
		<Dialog.Root
			open
			onOpenChange={(isOpen) => {
				if (!isOpen) confirmRewrite = null;
			}}
		>
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>Rewrite this report?</Dialog.Title>
					<Dialog.Description>This discards your edits.</Dialog.Description>
				</Dialog.Header>
				<Dialog.Footer>
					<Button variant="outline" onclick={() => (confirmRewrite = null)}>Keep my edits</Button>
					<Button
						variant="destructive"
						onclick={() => {
							const id = confirmRewrite;
							confirmRewrite = null;
							if (id) run.retry([id], modelOverride);
						}}
					>
						Discard edits and rewrite
					</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
	{/if}
	{#if confirmPrint}
		{@const outOfDateCount = confirmPrint.count}
		<Dialog.Root
			open
			onOpenChange={(isOpen) => {
				if (!isOpen) confirmPrint = null;
			}}
		>
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>Out-of-date reports</Dialog.Title>
					<Dialog.Description>
						{count(outOfDateCount, 'report')}
						{agree(outOfDateCount, 'is', 'are')} out of date: print anyway / rewrite {outOfDateCount ===
						1
							? 'it'
							: 'them'} first
					</Dialog.Description>
				</Dialog.Header>
				<Dialog.Footer>
					<Button
						disabled={topicsBlocked}
						onclick={() => {
							const pending = confirmPrint;
							confirmPrint = null;
							askOverflow(pending?.ids ?? null, pending?.ids ?? reviewIds);
						}}
					>
						Print anyway
					</Button>
					<Button
						variant="outline"
						disabled={topicsBlocked}
						onclick={() => {
							confirmPrint = null;
							rewriteOutOfDate();
						}}
					>
						Rewrite {outOfDateCount === 1 ? 'it' : 'them'} first
					</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
	{/if}
	{#if confirmOverflow}
		{@const overCount = confirmOverflow.count}
		<Dialog.Root
			open
			onOpenChange={(isOpen) => {
				if (!isOpen) confirmOverflow = null;
			}}
		>
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>Overflowing reports</Dialog.Title>
					<Dialog.Description>
						{count(overCount, 'report')}
						{agree(overCount, 'runs', 'run')} over the page; print cuts the overflow off. Print anyway?
					</Dialog.Description>
				</Dialog.Header>
				<Dialog.Footer>
					<Button
						onclick={() => {
							const pending = confirmOverflow;
							confirmOverflow = null;
							void print(pending?.ids ?? null);
						}}
					>
						Print anyway
					</Button>
					<Button variant="outline" onclick={() => (confirmOverflow = null)}>Keep editing</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
	{/if}
</main>

{#if document}
	<PrintRoot {document} ids={printing ?? reviewIds} />
{/if}
