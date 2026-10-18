<!--
	PROTOTYPE — Variant B, "Reports on the marksheet": no new surface. A reports bar sits
	in the marksheet header (counts, write, print all, topic names in a dialog); a
	Marks | Reports switch swaps the grid for the same class as a roster with each
	student's report state and actions. Opening a report is a modal you page through
	with ← → (prev/next), editing as you go.
-->
<script lang="ts">
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import AnalysisView from '$lib/components/marksheet/AnalysisView.svelte';
	import MarksheetGrid from '$lib/components/marksheet/MarksheetGrid.svelte';
	import BackupCard from '$lib/components/shell/BackupCard.svelte';
	import PaperLabelInput from '$lib/components/shell/PaperLabelInput.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Table from '$lib/components/ui/table';
	import { cn } from '$lib/utils';
	import ProseEditor from './ProseEditor.svelte';
	import ReportSheet from './ReportSheet.svelte';
	import StatusChip from './StatusChip.svelte';
	import TopicNames from './TopicNames.svelte';
	import { reportFlow } from './flow.svelte.js';

	const flow = reportFlow();
	let view = $state<'grid' | 'analysis'>('grid');
	let tab = $state<'marks' | 'reports'>('marks');
	let highlighted = $state<string | null>(null);
	let namesOpen = $state(false);
	let openId = $state<string | null>(null);

	const openRow = $derived(flow.rows.find((r) => r.student.id === openId) ?? null);
	const readable = $derived(flow.done.map((r) => r.student.id));
	const position = $derived(openId ? readable.indexOf(openId) : -1);
	const pct = $derived(
		flow.run.total ? ((flow.run.total - flow.inFlight.length) / flow.run.total) * 100 : 0
	);

	function step(delta: number) {
		if (readable.length === 0) return;
		openId = readable[(position + delta + readable.length) % readable.length];
	}

	function write() {
		if (flow.missingNames.length > 0) {
			namesOpen = true;
			void flow.proposeMissingNames();
			return;
		}
		tab = 'reports';
		void flow.generateAll();
	}
</script>

{#if view === 'analysis'}
	<AnalysisView highlight={highlighted} onBack={() => (view = 'grid')} />
{:else}
	<header class="space-y-3">
		<div class="space-y-1">
			<PaperLabelInput />
			<p class="text-sm text-muted-foreground">{flow.document.paper.className}</p>
		</div>
		<BackupCard />
		<div class="flex flex-wrap items-center gap-3 rounded-lg border p-2 text-sm">
			<span class="font-medium">Reports</span>
			{#if flow.run.state === 'running'}
				<div class="h-1.5 w-40 overflow-hidden rounded bg-muted">
					<div class="h-full bg-primary transition-all" style:width="{pct}%"></div>
				</div>
				<span class="tabular-nums"
					>{flow.run.total - flow.inFlight.length} of {flow.run.total} written</span
				>
				<Button variant="outline" size="xs" onclick={() => flow.stop()}>Stop</Button>
			{:else}
				<span class="text-muted-foreground">
					{flow.done.length} ready{flow.failed.length ? ` · ${flow.failed.length} failed` : ''} ·
					<button type="button" class="underline" onclick={() => (tab = 'reports')}>
						{flow.blocked.length} can't have one
					</button>
				</span>
				{#if flow.toGenerate.length > 0}
					<Button size="xs" onclick={write}>
						Write {flow.toGenerate.length === flow.eligible.length
							? 'reports'
							: `${flow.toGenerate.length} more`}
					</Button>
				{/if}
				{#if flow.failed.length > 0}
					<Button variant="outline" size="xs" onclick={() => flow.retryFailed()}
						>Retry failed</Button
					>
				{/if}
			{/if}
			<Button variant="outline" size="xs" onclick={() => (namesOpen = true)}>
				Topic names{flow.missingNames.length ? ` (${flow.missingNames.length} missing)` : ''}
			</Button>
			<Button
				variant="outline"
				size="xs"
				class="ml-auto"
				disabled={flow.done.length === 0}
				onclick={() => flow.printAll()}
			>
				<PrinterIcon class="size-3.5" /> Print all {flow.done.length}
			</Button>
		</div>
		{#if flow.run.message}
			<p class="rounded border border-red-400 bg-red-500/10 p-2 text-sm">{flow.run.message}</p>
		{/if}
		<div class="inline-flex rounded-md border p-0.5 text-sm">
			{#each ['marks', 'reports'] as const as t (t)}
				<button
					type="button"
					class={cn('rounded px-3 py-1 capitalize', tab === t && 'bg-muted font-medium')}
					onclick={() => (tab = t)}
				>
					{t}
				</button>
			{/each}
		</div>
	</header>

	{#if tab === 'marks'}
		<MarksheetGrid
			onViewAnalysis={(id) => {
				highlighted = id;
				view = 'analysis';
			}}
		/>
	{:else}
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Student</Table.Head>
					<Table.Head class="text-right">Total</Table.Head>
					<Table.Head>Report</Table.Head>
					<Table.Head class="text-right"></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each flow.rows as row (row.student.id)}
					{@const report = flow.reports[row.student.id]}
					<Table.Row class={cn(!row.eligible && 'text-muted-foreground')}>
						<Table.Cell>{row.name}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">
							{row.eligible ? `${row.total}/${row.available}` : '—'}
						</Table.Cell>
						<Table.Cell><StatusChip {row} long /></Table.Cell>
						<Table.Cell class="space-x-1 text-right">
							{#if !row.eligible}
								<Button variant="ghost" size="xs" onclick={() => (tab = 'marks')}>Fix marks</Button>
							{:else if report?.status === 'done'}
								<Button variant="outline" size="xs" onclick={() => (openId = row.student.id)}
									>Open</Button
								>
								<Button variant="ghost" size="xs" onclick={() => flow.print([row.student.id])}>
									<PrinterIcon class="size-3.5" />
								</Button>
							{:else if report?.status === 'failed'}
								<Button
									variant="outline"
									size="xs"
									disabled={!flow.canGenerate}
									onclick={() => flow.regenerate(row.student.id)}
								>
									Retry
								</Button>
							{:else if !report}
								<Button
									variant="ghost"
									size="xs"
									disabled={!flow.canGenerate}
									onclick={() => flow.regenerate(row.student.id)}
								>
									Write
								</Button>
							{/if}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	{/if}
{/if}

<Dialog.Root bind:open={namesOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Topic names</Dialog.Title>
			<Dialog.Description>Students see these instead of specification codes.</Dialog.Description>
		</Dialog.Header>
		<TopicNames />
		<Dialog.Footer>
			<Button
				disabled={!flow.canGenerate || flow.toGenerate.length === 0}
				onclick={() => {
					namesOpen = false;
					tab = 'reports';
					void flow.generateAll();
				}}
			>
				Write {flow.toGenerate.length} reports
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root open={openId !== null} onOpenChange={(o) => !o && (openId = null)}>
	<Dialog.Content
		class="max-h-[90vh] overflow-y-auto sm:max-w-5xl"
		onkeydown={(e: KeyboardEvent) => {
			const t = e.target as HTMLElement;
			if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT') return;
			if (e.key === 'ArrowLeft') step(-1);
			if (e.key === 'ArrowRight') step(1);
		}}
	>
		{#if openRow}
			<Dialog.Header>
				<Dialog.Title class="flex items-center gap-2">
					<Button
						variant="ghost"
						size="icon-sm"
						onclick={() => step(-1)}
						aria-label="Previous report"
					>
						<ChevronLeftIcon />
					</Button>
					{openRow.name}
					<span class="text-sm font-normal text-muted-foreground"
						>{position + 1} of {readable.length}</span
					>
					<Button variant="ghost" size="icon-sm" onclick={() => step(1)} aria-label="Next report">
						<ChevronRightIcon />
					</Button>
				</Dialog.Title>
			</Dialog.Header>
			<div class="grid grid-cols-[1fr_1.2fr] gap-4">
				<div class="space-y-3">
					<ProseEditor studentId={openRow.student.id} />
					<div class="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={!flow.canGenerate}
							onclick={() => flow.regenerate(openRow.student.id)}
						>
							Rewrite
						</Button>
						<Button variant="outline" size="sm" onclick={() => flow.print([openRow.student.id])}>
							<PrinterIcon class="size-4" /> Print this one
						</Button>
					</div>
				</div>
				<div class="origin-top scale-90"><ReportSheet studentId={openRow.student.id} /></div>
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
