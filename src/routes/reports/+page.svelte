<!--
	Reports: topic names, grades, who gets one, the writing, and the pages to
	review and print. The page owns the step, the run and the printer; each
	step is a component over the roster.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount, tick } from 'svelte';
	import { ModelList } from '$lib/components/parse/model-list.svelte.js';
	import GradeBoundariesForm from '$lib/components/report/GradeBoundariesForm.svelte';
	import PrintRoot from '$lib/components/report/PrintRoot.svelte';
	import ReviewStep from '$lib/components/report/ReviewStep.svelte';
	import TopicNamesStep from '$lib/components/report/TopicNamesStep.svelte';
	import WhoStep from '$lib/components/report/WhoStep.svelte';
	import WritingStep from '$lib/components/report/WritingStep.svelte';
	import { downloadReports, type ReportDownload } from '$lib/components/report/report-pdf.js';
	import { reportRoster, rowsOf } from '$lib/components/report/report-roster.js';
	import { ReportRun } from '$lib/components/report/report-run.svelte.js';
	import { Button } from '$lib/components/ui/button';
	import { topicCodesOf } from '$lib/marksheet/document.js';
	import { boundariesOf } from '$lib/marksheet/grades.js';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import { topicNameGaps } from '$lib/marksheet/report-rollup.js';
	import { toastPdfFailure } from '$lib/print-pdf.js';

	type Step = 'topics' | 'grades' | 'who' | 'writing' | 'review';

	const store = marksheetStore();
	const document = $derived(store.document);
	const gaps = $derived(
		document ? topicNameGaps(document) : { missing: [], overLong: [], blocked: false }
	);

	// The step the teacher lands on: a paper with a missing or over-long topic
	// name starts at Topic names, which locks every later step until it is
	// fixed; otherwise reports written means Review, otherwise the first step
	// of the flow. The layout load has already read the document before this
	// page renders.
	const landing = store.document;
	let step = $state<Step>(
		!landing
			? 'grades'
			: topicNameGaps(landing).blocked
				? 'topics'
				: Object.keys(landing.reports).length > 0
					? 'review'
					: topicCodesOf(landing).length > 0
						? 'topics'
						: 'grades'
	);

	// The paper has topic codes only when some entry carries a specification point.
	const hasTopics = $derived(document ? topicCodesOf(document).length > 0 : false);
	const STEPS: { id: Step; label: string }[] = $derived([
		...(hasTopics ? [{ id: 'topics' as const, label: 'Topic names' }] : []),
		{ id: 'grades', label: 'Grades' },
		{ id: 'who', label: 'Who gets one' },
		{ id: 'writing', label: 'Writing' },
		{ id: 'review', label: 'Review and print' }
	]);

	let modelOverride = $state('');
	let modelCustom = $state(false);
	const models = new ModelList();
	onMount(() => void models.load());

	const run = new ReportRun(store, () => {
		step = 'review';
	});

	const roster = $derived(document ? reportRoster(document, run.tiles) : []);
	/** Reports the teacher can see: written and still eligible. */
	const reviewIds = $derived(rowsOf(roster, 'review').map((row) => row.studentId));

	function writeNew(ids: string[]): void {
		if (modelCustom) modelOverride = modelOverride.trim();
		step = 'writing';
		run.start(ids, modelOverride);
	}

	function writeAgain(ids: string[]): void {
		step = 'writing';
		run.retry(ids, modelOverride);
	}

	function rewriteHere(ids: string[]): void {
		if (ids.length > 0) run.retry(ids, modelOverride);
	}

	/** Pages the printer gets; null means not printing, so every visible page shows for measuring. */
	let printing = $state<string[] | null>(null);

	async function print(ids: string[]): Promise<void> {
		printing = ids;
		await tick();
		window.print();
	}

	/** The print copies of the visible pages, which a PDF is made from. */
	let printRoot = $state<HTMLElement>();

	/** The PDF being made, or null when none is. */
	let downloading = $state<ReportDownload | null>(null);

	async function download(request: ReportDownload): Promise<void> {
		downloading = request;
		try {
			await toastPdfFailure(() => {
				if (!document || !printRoot) throw new Error('The report pages are not ready to download');
				return downloadReports(printRoot, document, request, new Date());
			});
		} finally {
			downloading = null;
		}
	}

	onMount(() => {
		const reset = () => (printing = null);
		window.addEventListener('afterprint', reset);
		return () => window.removeEventListener('afterprint', reset);
	});
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
						<Button
							size="sm"
							variant={step === item.id ? 'default' : 'outline'}
							aria-current={step === item.id ? 'step' : undefined}
							disabled={item.id !== 'topics' && gaps.blocked}
							title={item.id !== 'topics' && gaps.blocked ? 'Name every topic first' : undefined}
							onclick={() => (step = item.id)}>{index + 1}. {item.label}</Button
						>
					</li>
				{/each}
			</ol>
		</nav>
	</div>

	{#if !document}
		<!-- No document: the layout redirects away. -->
	{:else if step === 'topics'}
		<TopicNamesStep {document} {modelOverride} onnext={() => (step = 'grades')} />
	{:else if step === 'grades'}
		<section class="max-w-xl space-y-4">
			<h1 class="text-xl font-semibold">Grades</h1>
			<p class="max-w-prose text-sm text-muted-foreground">
				Reports show a grade when the paper has boundaries. Set them now, or skip and reports show
				marks only.
			</p>
			<GradeBoundariesForm onDone={() => (step = 'who')} />
			<div class="flex flex-wrap gap-2">
				{#if boundariesOf(document)}
					<Button onclick={() => (step = 'who')}>Next</Button>
				{:else}
					<Button variant="outline" onclick={() => (step = 'who')}>
						Skip: no grades on these reports
					</Button>
				{/if}
			</div>
		</section>
	{:else if step === 'who'}
		<WhoStep
			{roster}
			running={run.running}
			{models}
			bind:modelOverride
			bind:modelCustom
			onwrite={writeNew}
		/>
	{:else if step === 'writing'}
		<WritingStep
			{run}
			{roster}
			onretry={writeAgain}
			onreview={() => (step = 'review')}
			onback={() => (step = 'who')}
		/>
	{:else}
		<ReviewStep
			{document}
			{roster}
			{run}
			{downloading}
			onprint={(ids) => void print(ids)}
			ondownload={(request) => void download(request)}
			onrewrite={rewriteHere}
			onwritemore={writeAgain}
		/>
	{/if}
</main>

{#if document}
	<PrintRoot {document} ids={printing ?? reviewIds} bind:root={printRoot} />
{/if}
