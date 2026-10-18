<!--
	PROTOTYPE — Variant A, "Reports view": a third view of the marksheet beside the grid
	and the analysis, reached from a Reports button in the header. Master–detail: the
	class down the left with each student's state, the selected report on the right as
	form fields beside a live preview of the sheet.
-->
<script lang="ts">
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import AnalysisView from '$lib/components/marksheet/AnalysisView.svelte';
	import MarksheetGrid from '$lib/components/marksheet/MarksheetGrid.svelte';
	import BackupCard from '$lib/components/shell/BackupCard.svelte';
	import PaperLabelInput from '$lib/components/shell/PaperLabelInput.svelte';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import ProseEditor from './ProseEditor.svelte';
	import ReportSheet from './ReportSheet.svelte';
	import StatusChip from './StatusChip.svelte';
	import TopicNames from './TopicNames.svelte';
	import { blockerText, reportFlow } from './flow.svelte.js';

	const flow = reportFlow();
	let view = $state<'grid' | 'analysis' | 'reports'>('grid');
	let highlighted = $state<string | null>(null);
	let selected = $state<string | null>(null);
	let namesOpen = $state(false);

	const current = $derived(flow.rows.find((r) => r.student.id === selected) ?? null);
	const report = $derived(selected ? flow.reports[selected] : undefined);

	function openReports() {
		view = 'reports';
		namesOpen = flow.missingNames.length > 0;
		void flow.proposeMissingNames();
	}
</script>

{#if view === 'grid'}
	<header class="space-y-3">
		<div class="flex items-start justify-between gap-4">
			<div class="space-y-1">
				<PaperLabelInput />
				<p class="text-sm text-muted-foreground">{flow.document.paper.className}</p>
			</div>
			<Button onclick={openReports}>
				<FileTextIcon class="size-4" /> Reports
				<span class="text-xs opacity-80">
					{flow.done.length > 0
						? `${flow.done.length}/${flow.eligible.length} ready`
						: `${flow.eligible.length} can be written`}
				</span>
			</Button>
		</div>
		<BackupCard />
	</header>
	<MarksheetGrid
		onViewAnalysis={(id) => {
			highlighted = id;
			view = 'analysis';
		}}
	/>
{:else if view === 'analysis'}
	<AnalysisView highlight={highlighted} onBack={() => (view = 'grid')} />
{:else}
	<div class="space-y-4">
		<div class="flex flex-wrap items-center gap-2">
			<Button variant="ghost" size="sm" onclick={() => (view = 'grid')}>
				<ArrowLeftIcon class="size-4" /> Marksheet
			</Button>
			<h1 class="text-lg font-semibold">Reports</h1>
			<span class="text-sm text-muted-foreground">
				{flow.done.length} of {flow.eligible.length} written · {flow.blocked.length} can't have one yet
			</span>
			<div class="ml-auto flex items-center gap-2">
				{#if flow.run.state === 'running'}
					<span class="text-sm tabular-nums">
						Writing… {flow.run.total - flow.inFlight.length}/{flow.run.total}
					</span>
					<Button variant="outline" size="sm" onclick={() => flow.stop()}>Stop</Button>
				{:else}
					{#if flow.failed.length > 0}
						<Button variant="outline" size="sm" onclick={() => flow.retryFailed()}>
							Retry {flow.failed.length} failed
						</Button>
					{/if}
					<Button
						size="sm"
						disabled={!flow.canGenerate || flow.toGenerate.length === 0}
						title={flow.missingNames.length > 0 ? 'Name every topic first' : ''}
						onclick={() => flow.generateAll()}
					>
						{flow.toGenerate.length === 0
							? 'All written'
							: `Write ${flow.toGenerate.length} reports`}
					</Button>
				{/if}
				<Button
					variant="outline"
					size="sm"
					disabled={flow.done.length === 0}
					onclick={() => flow.printAll()}
				>
					<PrinterIcon class="size-4" /> Print all ({flow.done.length})
				</Button>
			</div>
		</div>
		{#if flow.run.message}
			<p class="rounded border border-red-400 bg-red-500/10 p-2 text-sm">{flow.run.message}</p>
		{/if}
		{#if flow.run.state === 'running'}
			<div class="h-1 overflow-hidden rounded bg-muted">
				<div
					class="h-full bg-primary transition-all"
					style:width="{((flow.run.total - flow.inFlight.length) / flow.run.total) * 100}%"
				></div>
			</div>
		{/if}

		<div class="grid grid-cols-[18rem_1fr] gap-4">
			<aside class="space-y-3">
				<div class="rounded-lg border">
					<button
						type="button"
						class="flex w-full items-center justify-between p-2 text-sm font-medium"
						onclick={() => (namesOpen = !namesOpen)}
					>
						Topic names
						<span
							class={cn(
								'text-xs',
								flow.missingNames.length > 0
									? 'text-amber-700 dark:text-amber-300'
									: 'text-muted-foreground'
							)}
						>
							{flow.missingNames.length > 0
								? `${flow.missingNames.length} missing`
								: `${flow.codes.length} named`}
						</span>
					</button>
					{#if namesOpen}
						<div class="border-t p-2"><TopicNames /></div>
					{/if}
				</div>
				<ul class="divide-y rounded-lg border">
					{#each flow.rows as row (row.student.id)}
						<li>
							<button
								type="button"
								class={cn(
									'flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm hover:bg-muted',
									selected === row.student.id && 'bg-muted',
									!row.eligible && 'text-muted-foreground'
								)}
								onclick={() => (selected = row.student.id)}
							>
								<span class="truncate">{row.name}</span>
								<StatusChip {row} />
							</button>
						</li>
					{/each}
				</ul>
			</aside>

			<section class="min-w-0">
				{#if !current}
					<div
						class="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground"
					>
						Pick a student to read and edit their report.
						{#if flow.blocked.length > 0}
							<p class="mt-3">Can't have a report yet:</p>
							<ul class="mt-1 space-y-0.5">
								{#each flow.blocked as row (row.student.id)}
									<li>
										<span class="text-foreground">{row.name}</span> — {row.blockers
											.map(blockerText)
											.join('; ')}
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{:else if !current.eligible}
					<div class="space-y-2 rounded-lg border p-4 text-sm">
						<h2 class="font-semibold">{current.name} can't have a report yet</h2>
						<ul class="list-disc pl-5">
							{#each current.blockers as blocker, i (i)}<li>{blockerText(blocker)}</li>{/each}
						</ul>
						<Button variant="outline" size="sm" onclick={() => (view = 'grid')}
							>Fix on the marksheet</Button
						>
					</div>
				{:else}
					<div class="grid grid-cols-[minmax(18rem,1fr)_minmax(0,1.3fr)] gap-4">
						<div class="space-y-3">
							<div class="flex flex-wrap items-center gap-2">
								<h2 class="font-semibold">{current.name}</h2>
								<StatusChip row={current} long />
							</div>
							<div class="flex flex-wrap gap-2">
								<Button
									size="sm"
									variant={report?.status === 'done' ? 'outline' : 'default'}
									disabled={!flow.canGenerate}
									onclick={() => flow.regenerate(current.student.id)}
								>
									{report?.status === 'done'
										? 'Rewrite'
										: report?.status === 'failed'
											? 'Retry'
											: 'Write this report'}
								</Button>
								<Button
									size="sm"
									variant="outline"
									disabled={report?.status !== 'done'}
									onclick={() => flow.print([current.student.id])}
								>
									<PrinterIcon class="size-4" /> Print this one
								</Button>
							</div>
							<ProseEditor studentId={current.student.id} />
						</div>
						<div class="origin-top scale-[0.8]"><ReportSheet studentId={current.student.id} /></div>
					</div>
				{/if}
			</section>
		</div>
	</div>
{/if}
