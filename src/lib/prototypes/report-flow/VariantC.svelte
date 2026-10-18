<!--
	PROTOTYPE — Variant C, "Make reports" as steps: a full-page flow out of the marksheet.
	1 Topic names → 2 Who gets one → 3 Writing (a tile per student) → 4 Review: every
	report as the printed page, stacked, edited in place on the sheet, with an index
	rail. Coming back later with reports written lands straight on Review.

	PROTOTYPE (#55): `grade` picks where boundaries are entered and how the grade column
	reads — A in the grid's frozen Grade column, B as a strip above the grid, C as a
	dialog from the header and an optional Grades step in this flow.
-->
<script lang="ts">
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import AnalysisView from '$lib/components/marksheet/AnalysisView.svelte';
	import BackupCard from '$lib/components/shell/BackupCard.svelte';
	import PaperLabelInput from '$lib/components/shell/PaperLabelInput.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import BoundaryStrip from '$lib/prototypes/grade-boundaries/BoundaryStrip.svelte';
	import BoundaryDialogBody, {
		type Entry
	} from '$lib/prototypes/grade-boundaries/BoundaryDialogBody.svelte';
	import GradeGrid from '$lib/prototypes/grade-boundaries/GradeGrid.svelte';
	import { boundaries } from '$lib/prototypes/grade-boundaries/grades.svelte.js';
	import { cn } from '$lib/utils';
	import ReportSheet from './ReportSheet.svelte';
	import StatusChip from './StatusChip.svelte';
	import TopicNames from './TopicNames.svelte';
	import { blockerText, reportFlow } from './flow.svelte.js';

	let { grade, entry = 'text' }: { grade: 'A' | 'B' | 'C'; entry?: Entry } = $props();

	type StepKey = 'names' | 'grades' | 'who' | 'writing' | 'review';
	const flow = reportFlow();
	const STEPS = $derived(
		(
			[
				['names', 'Topic names'],
				['grades', 'Grades'],
				['who', 'Who gets one'],
				['writing', 'Writing'],
				['review', 'Review and print']
			] as const
		).filter(([key]) => key !== 'grades' || grade === 'C')
	);
	let view = $state<'grid' | 'analysis' | 'flow'>('grid');
	let step = $state<StepKey>('names');
	let highlighted = $state<string | null>(null);
	let boundaryDialog = $state(false);
	const gradeCount = $derived(boundaries().length);

	function start() {
		view = 'flow';
		if (flow.done.length > 0) step = 'review';
		else {
			step = flow.codes.length === 0 ? (grade === 'C' ? 'grades' : 'who') : 'names';
			void flow.proposeMissingNames();
		}
	}

	function write() {
		step = 'writing';
		void flow.generateAll().then(() => {
			if (flow.failed.length === 0 && step === 'writing') step = 'review';
		});
	}
</script>

{#if view === 'grid'}
	<header class="space-y-3">
		<div class="space-y-1">
			<PaperLabelInput />
			<p class="text-sm text-muted-foreground">{flow.document.paper.className}</p>
		</div>
		<BackupCard />
		<div class="flex items-center gap-3 rounded-lg bg-primary/5 p-3">
			<p class="text-sm">
				{#if flow.done.length > 0}
					{flow.done.length} reports written for this paper.
				{:else}
					{flow.eligible.length} of {flow.rows.length} students are fully marked and can have a report.
				{/if}
			</p>
			{#if grade === 'C'}
				<Button variant="outline" class="ml-auto" onclick={() => (boundaryDialog = true)}>
					{gradeCount > 0 ? `Grade boundaries (${gradeCount})` : 'Set grade boundaries'}
				</Button>
			{/if}
			<Button class={grade === 'C' ? '' : 'ml-auto'} onclick={start}
				>{flow.done.length > 0 ? 'Open reports' : 'Make reports'}</Button
			>
		</div>
		{#if grade === 'B'}<BoundaryStrip />{/if}
	</header>
	<GradeGrid
		variant={grade}
		onViewAnalysis={(id) => {
			highlighted = id;
			view = 'analysis';
		}}
	/>
	<Dialog.Root bind:open={boundaryDialog}>
		<Dialog.Content class="sm:max-w-2xl">
			<Dialog.Header><Dialog.Title>Grade boundaries</Dialog.Title></Dialog.Header>
			<BoundaryDialogBody {entry} onDone={() => (boundaryDialog = false)} />
		</Dialog.Content>
	</Dialog.Root>
{:else if view === 'analysis'}
	<AnalysisView highlight={highlighted} onBack={() => (view = 'grid')} />
{:else}
	<div class="space-y-6">
		<div class="flex items-center gap-4">
			<Button variant="ghost" size="sm" onclick={() => (view = 'grid')}>
				<ArrowLeftIcon class="size-4" /> Marksheet
			</Button>
			<ol class="flex items-center gap-2 text-sm">
				{#each STEPS as [key, label], i (key)}
					<li>
						<button
							type="button"
							class={cn(
								'rounded-full px-3 py-1',
								key === step
									? 'bg-primary text-primary-foreground'
									: 'text-muted-foreground hover:bg-muted'
							)}
							onclick={() => (step = key)}
						>
							{i + 1}. {label}
						</button>
					</li>
				{/each}
			</ol>
		</div>

		{#if step === 'names'}
			<section class="mx-auto max-w-xl space-y-4">
				<h2 class="text-lg font-semibold">Name the topics</h2>
				<p class="text-sm text-muted-foreground">
					Each report groups marks by topic. These names are what students read.
				</p>
				<TopicNames />
				<Button
					disabled={flow.missingNames.length > 0}
					onclick={() => (step = grade === 'C' ? 'grades' : 'who')}>Next</Button
				>
			</section>
		{:else if step === 'grades'}
			<section class="mx-auto max-w-3xl space-y-4">
				<h2 class="text-lg font-semibold">Grades (optional)</h2>
				<p class="text-sm text-muted-foreground">
					With boundaries, each report shows the student's grade and the marks to the next one.
					Without them, reports show marks and percentages only.
				</p>
				<BoundaryDialogBody {entry} onDone={() => (step = 'who')} />
				<Button variant="link" class="h-auto p-0" onclick={() => (step = 'who')}>
					{gradeCount > 0 ? 'Keep these and go on' : 'Skip: no grades on these reports'}
				</Button>
			</section>
		{:else if step === 'who'}
			<section class="mx-auto max-w-xl space-y-4">
				<h2 class="text-lg font-semibold">{flow.eligible.length} students get a report</h2>
				{#if flow.blocked.length > 0}
					<div class="rounded-lg border p-3 text-sm">
						<p class="font-medium">{flow.blocked.length} won't, until their marks are sorted:</p>
						<ul class="mt-2 space-y-1">
							{#each flow.blocked as row (row.student.id)}
								<li>
									<span class="font-medium">{row.name}</span> — {row.blockers
										.map(blockerText)
										.join('; ')}
								</li>
							{/each}
						</ul>
						<Button variant="link" class="h-auto p-0" onclick={() => (view = 'grid')}>
							Back to the marksheet to fix them
						</Button>
					</div>
				{/if}
				<Button disabled={!flow.canGenerate || flow.toGenerate.length === 0} onclick={write}>
					Write {flow.toGenerate.length} reports
				</Button>
				{#if flow.missingNames.length > 0}
					<p class="text-sm text-amber-700 dark:text-amber-300">Name every topic first (step 1).</p>
				{/if}
			</section>
		{:else if step === 'writing'}
			<section class="space-y-4">
				<div class="flex items-center gap-3">
					<h2 class="text-lg font-semibold">
						{flow.run.state === 'running'
							? `Writing ${flow.run.total - flow.inFlight.length} of ${flow.run.total}…`
							: `${flow.done.length} written${flow.failed.length ? `, ${flow.failed.length} failed` : ''}`}
					</h2>
					{#if flow.run.state === 'running'}
						<Button variant="outline" size="sm" onclick={() => flow.stop()}>Stop</Button>
					{:else}
						{#if flow.failed.length > 0}
							<Button variant="outline" size="sm" onclick={() => flow.retryFailed()}
								>Retry failed</Button
							>
						{/if}
						<Button size="sm" onclick={() => (step = 'review')}>Review {flow.done.length}</Button>
					{/if}
				</div>
				{#if flow.run.message}
					<p class="rounded border border-red-400 bg-red-500/10 p-2 text-sm">{flow.run.message}</p>
				{/if}
				<div class="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2">
					{#each flow.eligible as row (row.student.id)}
						{@const report = flow.reports[row.student.id]}
						<div
							class={cn(
								'space-y-1 rounded-lg border p-2 text-sm transition-colors',
								report?.status === 'done' && 'border-emerald-500/50 bg-emerald-500/10',
								report?.status === 'failed' && 'border-red-500/50 bg-red-500/10'
							)}
						>
							<p class="truncate font-medium">{row.name}</p>
							<StatusChip {row} long />
							{#if report?.status === 'failed'}
								<Button
									variant="outline"
									size="xs"
									disabled={!flow.canGenerate}
									onclick={() => flow.regenerate(row.student.id)}
								>
									Retry
								</Button>
							{/if}
						</div>
					{/each}
				</div>
			</section>
		{:else}
			<section class="grid grid-cols-[12rem_1fr] gap-6">
				<nav class="sticky top-4 max-h-[80vh] space-y-2 self-start overflow-y-auto text-sm">
					<Button class="w-full" disabled={flow.done.length === 0} onclick={() => flow.printAll()}>
						<PrinterIcon class="size-4" /> Print all {flow.done.length}
					</Button>
					{#if flow.toGenerate.length > 0}
						<Button variant="outline" class="w-full" disabled={!flow.canGenerate} onclick={write}>
							Write {flow.toGenerate.length} more
						</Button>
					{/if}
					<ul>
						{#each flow.rows as row (row.student.id)}
							{@const ready = flow.reports[row.student.id]?.status === 'done'}
							<li>
								<a
									href="#report-{row.student.id}"
									class={cn(
										'flex justify-between gap-1 rounded px-1 py-0.5 hover:bg-muted',
										!ready && 'pointer-events-none text-muted-foreground'
									)}
								>
									<span class="truncate">{row.name}</span>
									{#if !ready}<StatusChip
											{row}
										/>{:else if flow.reports[row.student.id].edited}<span class="text-xs">✎</span
										>{/if}
								</a>
							</li>
						{/each}
					</ul>
				</nav>
				<div class="space-y-8">
					<p class="text-sm text-muted-foreground">
						Each page is what prints. Click into the feedback to change it; there's nothing to
						approve.
					</p>
					{#each flow.done as row (row.student.id)}
						{@const report = flow.reports[row.student.id]}
						<div id="report-{row.student.id}" class="scroll-mt-4 space-y-2">
							<div class="mx-auto flex max-w-[210mm] items-center gap-2 text-sm">
								<span class="font-medium">{row.name}</span>
								{#if report.edited}
									<span class="rounded bg-blue-500/15 px-1 text-xs">edited</span>
									<Button
										variant="link"
										size="xs"
										class="h-auto p-0"
										onclick={() => flow.revert(row.student.id)}
									>
										Revert
									</Button>
								{/if}
								{#if report.stale}
									<span class="rounded bg-amber-400/30 px-1 text-xs"
										>out of date — marks changed since written</span
									>
								{/if}
								<span class="ml-auto flex gap-1">
									<Button
										variant="ghost"
										size="xs"
										disabled={!flow.canGenerate}
										onclick={() => flow.regenerate(row.student.id)}
									>
										Rewrite
									</Button>
									<Button variant="outline" size="xs" onclick={() => flow.print([row.student.id])}>
										<PrinterIcon class="size-3.5" /> Print this page
									</Button>
								</span>
							</div>
							<ReportSheet studentId={row.student.id} editable />
						</div>
					{/each}
				</div>
			</section>
		{/if}
	</div>
{/if}
