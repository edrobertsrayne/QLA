<!--
	Reports: who gets one, the writing, and the pages to review and print.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount, tick } from 'svelte';
	import ModelSelect, { type ModelOption } from '$lib/components/parse/ModelSelect.svelte';
	import PrintRoot from '$lib/components/report/PrintRoot.svelte';
	import ReportSheet from '$lib/components/report/ReportSheet.svelte';
	import { ReportRun } from '$lib/components/report/report-run.svelte.js';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import { blockerText, eligibilityRows } from '$lib/marksheet/report-eligibility.js';
	import { studentName } from '$lib/marksheet/students.js';
	import { count } from '$lib/prose.js';

	type Step = 'who' | 'writing' | 'review';

	const store = marksheetStore();
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

	let step = $state<Step>(
		Object.keys(marksheetStore().document?.reports ?? {}).length > 0 ? 'review' : 'who'
	);

	// The paper has topic codes only when some entry carries a specification point.
	const STEPS: { id: Step; label: string }[] = [
		{ id: 'who', label: 'Who gets one' },
		{ id: 'writing', label: 'Writing' },
		{ id: 'review', label: 'Review and print' }
	];

	let modelOverride = $state('');
	let modelCustom = $state(false);
	let modelOptions = $state<ModelOption[]>([]);
	let modelsLoading = $state(false);
	let modelsError = $state<string | null>(null);

	async function loadModels(): Promise<void> {
		modelsLoading = true;
		modelsError = null;
		try {
			const response = await fetch('/api/models');
			if (!response.ok) throw new Error(`status ${response.status}`);
			const body = (await response.json()) as { models?: ModelOption[] };
			modelOptions = Array.isArray(body.models) ? body.models : [];
		} catch {
			modelsError = 'The model list could not be loaded. Server default still works.';
			modelOptions = [];
		} finally {
			modelsLoading = false;
		}
	}

	onMount(() => {
		void loadModels();
	});

	const run = new ReportRun(store, () => {
		step = 'review';
	});

	function startRun(studentIds: string[]): void {
		if (modelCustom) modelOverride = modelOverride.trim();
		step = 'writing';
		run.start(studentIds, modelOverride);
	}

	function write(): void {
		startRun(eligibleIds);
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
		step = 'writing';
		run.retry(pendingIds, modelOverride);
	}

	function retryFailed(): void {
		step = 'writing';
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

<main class="mx-auto max-w-6xl space-y-6 p-6 print:hidden">
	<div class="flex flex-wrap items-center gap-4">
		<Button variant="ghost" size="sm" onclick={() => void goto(resolve('/marksheet'))}>
			← Marksheet
		</Button>
		<nav aria-label="Report steps">
			<ol class="flex flex-wrap items-center gap-2 text-sm">
				{#each STEPS as item, index (item.id)}
					<li>
						<button
							type="button"
							class="rounded-md border px-3 py-1 {step === item.id
								? 'border-primary bg-primary text-primary-foreground'
								: 'hover:bg-muted'}"
							aria-current={step === item.id ? 'step' : undefined}
							onclick={() => (step = item.id)}>{index + 1}. {item.label}</button
						>
					</li>
				{/each}
			</ol>
		</nav>
	</div>

	{#if step === 'who'}
		<section class="space-y-4">
			<h1 class="text-xl font-semibold">{count(eligibleIds.length, 'student')} get a report</h1>
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
					models={modelOptions}
					loading={modelsLoading}
					loadError={modelsError}
					onretry={() => void loadModels()}
				/>
			</div>
			<Button disabled={eligibleIds.length === 0 || run.running} onclick={write}>
				Write {count(eligibleIds.length, 'report')}
			</Button>
		</section>
	{:else if step === 'writing'}
		<section class="space-y-4">
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
						<Button variant="outline" onclick={retryFailed}>Retry failed</Button>
					{/if}
					{#if run.failed.length > 0 || writtenIds.length > 0}
						<Button onclick={() => (step = 'review')}>Review {writtenIds.length}</Button>
					{/if}
					<Button variant="outline" onclick={() => (step = 'who')}>Back to Who gets one</Button>
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
								disabled={run.running}
								onclick={() => {
									step = 'writing';
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
				<Button disabled={writtenIds.length === 0} onclick={() => void print(null)}>
					Print all {writtenIds.length}
				</Button>
				{#if pendingIds.length > 0 && !run.running}
					<Button variant="outline" onclick={writeMore}>Write {pendingIds.length} more</Button>
				{/if}
				<ul class="space-y-1 text-sm">
					{#each students as student (student.id)}
						<li>
							{#if document.reports[student.id]}
								<button type="button" class="underline" onclick={() => jumpTo(student.id)}
									>{studentName(student)}</button
								>
							{:else}
								<span>{studentName(student)}</span>
								<span class="text-muted-foreground">{statusOf(student.id)}</span>
							{/if}
						</li>
					{/each}
				</ul>
			</aside>
			<div class="min-w-0 flex-1 space-y-8 overflow-x-auto">
				{#if writtenIds.length === 0}
					<p>No reports have been written yet.</p>
				{/if}
				{#each writtenIds as id (id)}
					<div data-page-for={id} class="space-y-2">
						<Button variant="outline" size="sm" onclick={() => void print([id])}
							>Print this page</Button
						>
						<ReportSheet {document} studentId={id} report={document.reports[id]} />
					</div>
				{/each}
			</div>
		</section>
	{/if}
</main>

{#if document}
	<PrintRoot {document} ids={printing ?? writtenIds} />
{/if}
