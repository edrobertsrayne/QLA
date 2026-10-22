<!--
	The Review and print step: the rail of every student, one editable page per
	visible report with its out-of-date, overflow and edited flags, the bulk
	rewrite and print controls, and the questions those ask first.
-->
<script lang="ts">
	import UndoAlert from '$lib/components/marksheet/UndoAlert.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import type { MarksheetDocument } from '$lib/marksheet/document.js';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import { droppedNoMarks, reportFiguresFor } from '$lib/marksheet/report-figures.js';
	import { agree, count } from '$lib/prose.js';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import { isFlagged, reportFit } from './report-fit.svelte.js';
	import { railStatus, rowsOf, type RosterRow } from './report-roster.js';
	import { downloadIds, type ReportDownload } from './report-pdf.js';
	import type { ReportRun } from './report-run.svelte.js';
	import ReportSheet from './ReportSheet.svelte';

	let {
		document,
		roster,
		run,
		downloading,
		onprint,
		ondownload,
		onrewrite,
		onwritemore
	}: {
		document: MarksheetDocument;
		roster: RosterRow[];
		run: ReportRun;
		/** The PDF being made, or null when none is. */
		downloading: ReportDownload | null;
		onprint: (ids: string[]) => void;
		ondownload: (request: ReportDownload) => void;
		onrewrite: (ids: string[]) => void;
		onwritemore: (ids: string[]) => void;
	} = $props();

	const store = marksheetStore();
	const fit = reportFit();

	/** Reports the teacher can see: written and still eligible. Ineligible
	 * reports are kept with their edits, hidden from Review and never printed.
	 */
	const reviewIds = $derived(rowsOf(roster, 'review').map((row) => row.studentId));
	/** What the stored prose no longer matches, per visible report. Grade
	 * boundaries and the model never count: they never reach the input.
	 */
	const changesById = $derived(
		new Map(rowsOf(roster, 'review').map((row) => [row.studentId, row.status.changes]))
	);
	const outOfDateChanges = (id: string): string[] => changesById.get(id) ?? [];
	const outOfDateIds = $derived(reviewIds.filter((id) => outOfDateChanges(id).length > 0));
	const editedOutOfDateIds = $derived(
		outOfDateIds.filter((id) => document.reports[id]?.edit !== null)
	);
	/**
	 * Students the last run did not cover: eligible now with no report and no
	 * tile yet. A failure or a Stop leaves tiles behind, so those students are
	 * retried from the Writing step, not counted here as newly eligible.
	 */
	const pendingIds = $derived(
		rowsOf(roster, 'unwritten')
			.filter((row) => row.status.tile === null)
			.map((row) => row.studentId)
	);
	let includeEdited = $state(false);

	/** The report awaiting the teacher's say-so before their edits are discarded. */
	let confirmRewrite = $state<string | null>(null);

	/** One fresh page: over a teacher's edit only with their say-so. */
	function rewriteOne(id: string): void {
		const report = document.reports[id];
		if (!report) return;
		if (report.edit !== null) {
			confirmRewrite = id;
			return;
		}
		onrewrite([id]);
	}

	/** An emptied areas section that claims nothing: flagged because print leaves it blank. */
	const areasEmptied = (id: string): boolean => {
		const report = document.reports[id];
		return (
			!!report &&
			(report.edit ?? report).areasForImprovement.length === 0 &&
			!droppedNoMarks(reportFiguresFor(document, id))
		);
	};

	/** How pages leave the app, in the words the warning uses for each. */
	const DELIVERY = {
		print: { verb: 'Print', cutter: 'print' },
		download: { verb: 'Download', cutter: 'the PDF' }
	} as const;

	/** Pages a print or a download would send that the teacher should know about first. */
	interface DeliveryWarning {
		ids: string[];
		outOfDate: number;
		overflow: number;
		delivery: keyof typeof DELIVERY;
		proceed: () => void;
	}
	let pendingDelivery = $state<DeliveryWarning | null>(null);
	/** Download all is waiting to be told One PDF or Separate PDFs. */
	let choosingDownload = $state(false);

	/** Out-of-date pages among `ids` that a rewrite may touch: edited ones only when opted in. */
	const rewritableOf = (ids: string[]): string[] =>
		ids.filter(
			(id) =>
				outOfDateChanges(id).length > 0 && (includeEdited || document.reports[id]?.edit === null)
		);

	/** Print and Download ask first when an out-of-date or overflowing page would go out. */
	function askFirst(ids: string[], delivery: keyof typeof DELIVERY, proceed: () => void): void {
		const outOfDate = ids.filter((id) => outOfDateChanges(id).length > 0).length;
		const overflow = ids.filter((id) => isFlagged(fit.fitOf(id))).length;
		if (outOfDate === 0 && overflow === 0) proceed();
		else pendingDelivery = { ids, outOfDate, overflow, delivery, proceed };
	}

	const askPrint = (ids: string[]): void => askFirst(ids, 'print', () => onprint(ids));
	const askDownload = (request: ReportDownload): void =>
		askFirst(downloadIds(request), 'download', () => ondownload(request));

	function jumpTo(studentId: string): void {
		globalThis.document
			.querySelector(`[data-page-for="${CSS.escape(studentId)}"]`)
			?.scrollIntoView({ block: 'start' });
	}
</script>

<section class="flex items-start gap-6">
	<aside class="sticky top-4 w-56 shrink-0 space-y-3 self-start">
		<Button disabled={reviewIds.length === 0} onclick={() => askPrint(reviewIds)}>
			Print all {reviewIds.length}
		</Button>
		<Button
			variant="outline"
			disabled={reviewIds.length === 0 || downloading !== null}
			onclick={() => (choosingDownload = true)}
		>
			{downloading !== null && downloading.kind !== 'page'
				? 'Preparing PDFs…'
				: `Download all ${reviewIds.length}`}
		</Button>
		{#if outOfDateIds.length > 0 && !run.running}
			{@const skipped = includeEdited ? 0 : editedOutOfDateIds.length}
			{@const rewritable = outOfDateIds.length - skipped}
			<Button
				variant="outline"
				disabled={rewritable === 0}
				onclick={() => onrewrite(rewritableOf(reviewIds))}
				title={skipped > 0 ? 'Tick the box to include edited reports' : undefined}
			>
				Rewrite {rewritable} out of date{skipped > 0 ? ` (skips ${skipped} edited)` : ''}
			</Button>
			{#if editedOutOfDateIds.length > 0}
				<Label class="gap-1.5 text-xs font-normal text-muted-foreground">
					<Checkbox bind:checked={includeEdited} /> also rewrite {editedOutOfDateIds.length} edited (discards
					edits)
				</Label>
			{/if}
		{/if}
		{#if run.running}
			<p class="text-sm text-muted-foreground">Rewriting…</p>
		{/if}
		{#if pendingIds.length > 0 && !run.running}
			<Button variant="outline" onclick={() => onwritemore(pendingIds)}
				>Write {pendingIds.length} more</Button
			>
		{/if}
		<ul class="space-y-1 text-sm">
			{#each roster as row (row.studentId)}
				<li>
					{#if row.status.kind === 'review'}
						<button type="button" class="underline" onclick={() => jumpTo(row.studentId)}
							>{row.name}</button
						>
					{:else}
						<span>{row.name}</span>
						<span class="text-muted-foreground">{railStatus(row.status)}</span>
					{/if}
				</li>
			{/each}
		</ul>
	</aside>
	<div class="min-w-0 flex-1 space-y-8 overflow-x-auto">
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
					<Button variant="outline" size="sm" onclick={() => askPrint([id])}>Print this page</Button
					>
					<Button
						variant="outline"
						size="sm"
						disabled={downloading !== null}
						onclick={() => askDownload({ kind: 'page', id })}
					>
						{downloading?.kind === 'page' && downloading.id === id
							? 'Preparing PDF…'
							: 'Download PDF'}
					</Button>
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
					<Button variant="outline" size="sm" onclick={() => rewriteOne(id)}>Rewrite</Button>
					{#if tile?.kind === 'writing'}
						<span class="text-sm text-muted-foreground">Rewriting…</span>
					{/if}
				</div>
				{#if tile?.kind === 'failed'}
					<p role="alert" class="rounded-md border border-destructive p-3 text-sm">
						{tile.message}
						<Button size="sm" variant="outline" onclick={() => rewriteOne(id)}>Retry</Button>
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

{#if confirmRewrite !== null}
	{@const id = confirmRewrite}
	<ConfirmDialog
		title="Rewrite this report?"
		description="This discards your edits."
		actions={[
			{ label: 'Keep my edits', variant: 'outline', onclick: () => {} },
			{
				label: 'Discard edits and rewrite',
				variant: 'destructive',
				onclick: () => onrewrite([id])
			}
		]}
		onclose={() => (confirmRewrite = null)}
	/>
{/if}
{#if choosingDownload}
	<ConfirmDialog
		title="Download all {reviewIds.length}"
		description="Save the reports as one PDF, a page each, or as a separate PDF for each student in a zip."
		actions={[
			{ label: 'One PDF', onclick: () => askDownload({ kind: 'one', ids: reviewIds }) },
			{
				label: 'Separate PDFs (zip)',
				variant: 'outline',
				onclick: () => askDownload({ kind: 'zip', ids: reviewIds })
			},
			{ label: 'Cancel', variant: 'outline', onclick: () => {} }
		]}
		onclose={() => (choosingDownload = false)}
	/>
{/if}
{#if pendingDelivery}
	{@const { ids, outOfDate, overflow, delivery, proceed } = pendingDelivery}
	{@const { verb, cutter } = DELIVERY[delivery]}
	<ConfirmDialog
		title={outOfDate > 0 && overflow > 0
			? 'Out-of-date and overflowing reports'
			: outOfDate > 0
				? 'Out-of-date reports'
				: 'Overflowing reports'}
		description={[
			...(outOfDate > 0
				? [`${count(outOfDate, 'report')} ${agree(outOfDate, 'is', 'are')} out of date.`]
				: []),
			...(overflow > 0
				? [
						`${count(overflow, 'report')} ${agree(overflow, 'runs', 'run')} over the page; ${cutter} cuts the overflow off.`
					]
				: []),
			`${verb} anyway?`
		].join(' ')}
		actions={[
			{ label: `${verb} anyway`, onclick: proceed },
			...(rewritableOf(ids).length > 0
				? [
						{
							label: `Rewrite ${outOfDate === 1 ? 'it' : 'them'} first`,
							variant: 'outline' as const,
							onclick: () => onrewrite(rewritableOf(ids))
						}
					]
				: []),
			{ label: 'Keep editing', variant: 'outline', onclick: () => {} }
		]}
		onclose={() => (pendingDelivery = null)}
	/>
{/if}
