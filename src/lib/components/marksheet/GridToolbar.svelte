<!--
	The row above the grid: the way into the analysis and the hardest questions,
	sorting the class, what the parse said, and the data tools. The analysis, the
	hardest strip and the marks export follow the open tier; the class tools do
	not, because the class is one list across both papers.
-->
<script lang="ts">
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import FileSpreadsheetIcon from '@lucide/svelte/icons/file-spreadsheet';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import EditBreakdownDialog from '$lib/components/marksheet/EditBreakdownDialog.svelte';
	import UploadStudentsDialog from '$lib/components/marksheet/UploadStudentsDialog.svelte';
	import BackupControl from '$lib/components/marksheet/BackupControl.svelte';
	import { facilityDescription, facilityPercent } from '$lib/marksheet/analysis.js';
	import {
		entryName,
		fallbackBands,
		runWarnings,
		warningsForEntry,
		type QuestionBand
	} from '$lib/marksheet/breakdown.js';
	import type { TierIndex } from '$lib/marksheet/document.js';
	import { exportMarksNow, marksheetStore } from '$lib/marksheet/index.js';
	import { count } from '$lib/prose.js';
	import { tierNameLabel } from './tier-label.js';

	let {
		tier,
		onViewAnalysis
	}: {
		tier: TierIndex | null;
		onViewAnalysis: (entryId: string | null) => void;
	} = $props();

	const store = marksheetStore();
	const document = $derived(store.document);
	const entries = $derived(tier === null ? [] : store.entriesOf(tier));
	/**
	 * The open tier's findings. Tier not set has no paper, so it shows none: the
	 * parse said nothing about students waiting for a tier.
	 */
	const warnings = $derived(tier === null ? [] : store.warningsOf(tier));
	const bands = $derived<QuestionBand[]>(tier === null ? [] : store.bandsOf(tier));
	const fallbacks = $derived(fallbackBands(bands, warnings));
	const hardest = $derived(tier === null ? [] : store.analysisOf(tier).hardest);
</script>

<div class="flex flex-wrap items-center gap-2" data-testid="grid-toolbar">
	{#if tier !== null}
		<Button variant="outline" size="xs" onclick={() => onViewAnalysis(null)}>
			<ChartColumnIcon class="size-3.5" /> View analysis
		</Button>
		{#if hardest.length > 0}
			<!-- The worst questions by name, so the ones to reteach are named without
			     opening anything. Every one of them is there with its figure. -->
			<span class="flex flex-wrap items-center gap-1.5 text-xs" data-testid="hardest">
				<span class="font-medium">Hardest</span>
				{#each hardest as row (row.entry.id)}
					{#if row.facility !== null}
						<button
							type="button"
							class="rounded border border-red-600/50 bg-red-500/10 px-1.5 py-0.5 tabular-nums hover:bg-red-500/20"
							title={facilityDescription(row)}
							onclick={() => onViewAnalysis(row.entry.id)}
						>
							{entryName(row.entry)}
							<span class="text-muted-foreground">{facilityPercent(row.facility)}%</span>
						</button>
					{/if}
				{/each}
			</span>
		{/if}
	{/if}
	<span class="text-xs text-muted-foreground">Sort the class</span>
	<Button variant="outline" size="xs" onclick={() => store.sortStudents('firstName')}>
		By first name
	</Button>
	<Button variant="outline" size="xs" onclick={() => store.sortStudents('surname')}>
		By surname
	</Button>
	<UploadStudentsDialog size="xs" {tier} />
	{#if fallbacks.length > 0}
		<Popover.Root>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Badge
						{...props}
						variant="outline"
						class="border-amber-500/60 text-amber-700 dark:text-amber-300"
						data-testid="fallback-band-count"
					>
						<TriangleAlertIcon />
						{count(fallbacks.length, 'band')} without a question number
					</Badge>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="w-80 text-xs">
				<p class="mb-1 font-medium">The parse could not read these questions' numbers.</p>
				<p class="text-muted-foreground">
					Their columns are banded under the entry's own label. Correct the question number on the
					breakdown page and the band moves where it belongs.
				</p>
			</Popover.Content>
		</Popover.Root>
	{/if}
	{#if warnings.length > 0}
		<!-- The parse's findings stay reachable after confirmation: the ones about
		     one entry, named by its label, and the ones about the run as a whole. -->
		<Popover.Root>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Badge {...props} variant="outline" data-testid="parse-warnings-count">
						<TriangleAlertIcon />
						{count(warnings.length, 'parse warning')}
					</Badge>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="max-h-80 w-96 overflow-y-auto text-xs" data-testid="parse-warnings">
				<p class="mb-1 font-medium">From the parse</p>
				<ul class="space-y-1">
					{#each runWarnings(warnings) as warning (warning.code + warning.message)}
						<li><strong>{warning.code}</strong>: {warning.message}</li>
					{/each}
					{#each entries as entry (entry.id)}
						{#each warningsForEntry(warnings, entry.id) as warning (warning.code + warning.message)}
							<li><strong>{entryName(entry)}</strong> · {warning.code}: {warning.message}</li>
						{/each}
					{/each}
				</ul>
			</Popover.Content>
		</Popover.Root>
	{/if}
	<!-- The document's own backup first, then the data tools at the far end from
	     View analysis: the way back to the entries the marks are keyed against,
	     and the marks export that is never mistaken for a backup. -->
	<div class="ml-auto flex items-center gap-2">
		<BackupControl />
		<EditBreakdownDialog />
		{#if tier !== null}
			<Button variant="outline" size="xs" onclick={() => exportMarksNow(tier)}>
				<FileSpreadsheetIcon class="size-3.5" />
				{store.tierCount === 1
					? 'Export marks to spreadsheet (.csv)'
					: `Export ${tierNameLabel(document, tier)} marks (.csv)`}
			</Button>
		{/if}
		<span class="text-[11px] text-muted-foreground" title="Not a backup: it cannot be restored">
			Not a backup
		</span>
	</div>
</div>
