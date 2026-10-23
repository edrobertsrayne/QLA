<!--
	PROTOTYPE (#115) — Variant D: Tabs + comparison tracks (A's tabs, C's chart).
	Toggle row Tier 1 / Tier 2 / Common questions. Every tab is the track chart: one
	line per entry (tier tabs) or per pair (common tab) on a 0–100% track shaded
	red/amber/green. On a tier tab the filled dot is that tier's facility; a common
	question also shows the other tier as a faint hollow dot and the pooled bar. The
	common tab is C's page. Sort, Print, PDF and CSV follow the open tab.

	PROTOTYPE (#118) — `single`: the same design on a single-tier assessment. No
	toggle row and no partner chip, other tier or pooled bar; the one tier's track
	sits in today's band sections. Exports are the tier tab's.
-->
<script lang="ts">
	import { tick, untrack } from 'svelte';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import LinkIcon from '@lucide/svelte/icons/link-2';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { cn } from '$lib/utils.js';
	import CsvPreview from './CsvPreview.svelte';
	import Track from './Track.svelte';
	import { downloadPdf } from './exports.js';
	import {
		GREEN_FROM,
		RED_BELOW,
		TEXT,
		pct,
		singleTierAnalysis,
		tieredAnalysis,
		worstFirst,
		type CommonRow,
		type Row,
		type TierIndex
	} from './stub.svelte.js';

	let { single = false }: { single?: boolean } = $props();

	const stub = untrack(() => (single ? singleTierAnalysis() : tieredAnalysis()));
	const [t1, t2] = stub.tiers;

	let tab = $state('0');
	const hasPairs = $derived(stub.pairs.length > 0);
	const shown = $derived(!hasPairs && tab === 'common' ? '0' : tab);
	const tier = $derived<TierIndex | null>(
		single ? 0 : shown === 'common' ? null : (Number(shown) as TierIndex)
	);

	let tierSort = $state('worst');
	let commonSort = $state('gap');
	let greenOpen = $state(false);
	let view = $state<HTMLElement>();
	let csvOpen = $state(false);

	const tierRows = $derived.by((): Row[] => {
		if (tier === null) return [];
		const rows = stub.rows(tier);
		return tierSort === 'paper' ? rows : worstFirst(rows, (r) => r.facility);
	});
	/** One tier, so today's band sections carry the order: worst first within each. */
	const singleSections = $derived.by(() => {
		const ordered = worstFirst(stub.rows(0), (r) => r.facility);
		const inBand = (wanted: Row['band']) => ordered.filter((r) => r.band === wanted);
		return {
			red: inBand('red'),
			amber: inBand('amber'),
			green: inBand('green'),
			notScored: inBand(null)
		};
	});
	const commonById = $derived(
		new Map(stub.common.flatMap((c) => [[c.a.entry.id, c] as const, [c.b.entry.id, c] as const]))
	);
	const commonRows = $derived.by((): CommonRow[] => {
		const rows = stub.common;
		if (commonSort === 'paper') return rows;
		if (commonSort === 'pooled') return worstFirst(rows, (c) => c.pooled);
		return worstFirst(rows, (c) => (c.gap === null ? null : -Math.abs(c.gap)));
	});

	const slug = $derived(
		tier === null ? 'common-questions' : `${stub.tiers[tier].name.toLowerCase()}-analysis`
	);
	/**
	 * PROTOTYPE (#118): with no tab row there is no tab number, so the one tier's
	 * name stands alone; a blank tier name simply leaves today's heading.
	 */
	const heading = $derived.by(() => {
		if (single) return ['Question analysis', stub.tiers[0].name].filter(Boolean).join(' — ');
		if (tier === null) return `Common questions — ${t1.name} and ${t2.name}`;
		return `Question analysis — Tier ${tier + 1} · ${stub.tiers[tier].name}`;
	});
	const ticks = [0, 0.25, RED_BELOW, 0.5, GREEN_FROM, 1];
	const x = (f: number) => `${pct(f)}%`;

	/** Green unfolded for the file, as today's analysis does, then put back as it was. */
	async function exportPdf(): Promise<void> {
		if (!view) return;
		const wasOpen = greenOpen;
		if (single) greenOpen = true;
		await tick();
		try {
			await downloadPdf(view, stub.filename(slug, 'pdf'));
		} finally {
			if (single) greenOpen = wasOpen;
		}
	}

	/** A print of the tab unfolds green too, so the paper copy holds every band. */
	async function printPage(): Promise<void> {
		if (!single) {
			window.print();
			return;
		}
		const wasOpen = greenOpen;
		greenOpen = true;
		await tick();
		try {
			window.print();
		} finally {
			greenOpen = wasOpen;
		}
	}
</script>

{#snippet axis(left: string, right: string)}
	<div
		class="grid grid-cols-[15rem_1fr_5rem] items-center gap-3 border-b px-3 py-1.5 text-xs text-muted-foreground"
	>
		<span>{left}</span>
		<div class="relative h-4">
			{#each ticks as tick (tick)}
				<span class="absolute -translate-x-1/2 tabular-nums" style:left={x(tick)}>{pct(tick)}</span>
			{/each}
		</div>
		<span class="text-right">{right}</span>
	</div>
{/snippet}

{#snippet singleChart(list: Row[])}
	<div class="overflow-hidden rounded-lg border">
		{@render axis('Question', 'Facility')}
		{#each list as row (row.entry.id)}
			<div
				class="grid grid-cols-[15rem_1fr_5rem] items-center gap-3 border-b px-3 py-1.5 last:border-0"
			>
				<div class="min-w-0">
					<div class="text-sm font-semibold tabular-nums">
						{row.entry.label}
						<span class="font-normal text-muted-foreground"
							>· {row.entry.marks}
							{row.entry.marks === 1 ? 'mark' : 'marks'} · {row.entry.ao ?? '—'}</span
						>
					</div>
					<div class="truncate text-xs text-muted-foreground" title={row.entry.summary}>
						{row.entry.summary}
					</div>
				</div>
				<Track filled={row} />
				<div class="text-right tabular-nums">
					{#if row.facility !== null && row.band}
						<span class={cn('font-semibold', TEXT[row.band], row.partMarked && 'italic')}
							>{pct(row.facility)}%</span
						>
					{:else}
						<span class="text-muted-foreground">—</span>
					{/if}
					<div
						class={cn(
							'text-[11px] text-muted-foreground',
							row.partMarked && 'text-amber-700 italic dark:text-amber-300'
						)}
					>
						{stub.tiers[0].short}
						{row.marked}/{row.of}
					</div>
				</div>
			</div>
		{/each}
	</div>
{/snippet}

<main class="mx-auto max-w-6xl space-y-4 p-6">
	<div class="flex flex-wrap items-center gap-2 print:hidden">
		<Button variant="ghost" size="sm" onclick={() => toast('Would go back to the marksheet')}>
			<ArrowLeftIcon class="size-4" /> Back to marksheet
		</Button>
		<Button variant="outline" size="sm" class="ml-auto" onclick={() => void printPage()}>
			<PrinterIcon class="size-4" /> Print
		</Button>
		<Button variant="outline" size="sm" onclick={() => void exportPdf()}>
			<DownloadIcon class="size-4" /> Download PDF
		</Button>
		<Button variant="outline" size="sm" onclick={() => (csvOpen = true)}>
			<DownloadIcon class="size-4" /> Download CSV
		</Button>
	</div>

	{#if !single}
		<div class="flex flex-wrap items-center gap-3 print:hidden">
			<ToggleGroup.Root type="single" variant="outline" bind:value={tab} class="w-fit">
				{#each [0, 1] as const as t (t)}
					<ToggleGroup.Item value={String(t)} class="px-4">
						Tier {t + 1} · {stub.tiers[t].name}
					</ToggleGroup.Item>
				{/each}
				{#if hasPairs}
					<ToggleGroup.Item value="common" class="px-4">
						Common questions <span class="text-muted-foreground tabular-nums"
							>({stub.pairs.length})</span
						>
					</ToggleGroup.Item>
				{/if}
			</ToggleGroup.Root>
			<span class="ml-auto text-sm text-muted-foreground">Sort</span>
			{#if tier === null}
				<ToggleGroup.Root type="single" variant="outline" size="sm" bind:value={commonSort}>
					<ToggleGroup.Item value="gap" class="px-3">Biggest gap</ToggleGroup.Item>
					<ToggleGroup.Item value="pooled" class="px-3">Pooled, worst first</ToggleGroup.Item>
					<ToggleGroup.Item value="paper" class="px-3">{t1.name} paper order</ToggleGroup.Item>
				</ToggleGroup.Root>
			{:else}
				<ToggleGroup.Root type="single" variant="outline" size="sm" bind:value={tierSort}>
					<ToggleGroup.Item value="worst" class="px-3">Worst first</ToggleGroup.Item>
					<ToggleGroup.Item value="paper" class="px-3">Paper order</ToggleGroup.Item>
				</ToggleGroup.Root>
			{/if}
		</div>
	{/if}

	<div class="space-y-4" bind:this={view}>
		<header class="space-y-1">
			<h2 class="text-xl font-semibold">
				{heading}
				<span class="font-normal text-muted-foreground">— {stub.paperLabel} · {stub.className}</span
				>
			</h2>
			{#if tier === null}
				<p class="text-sm text-muted-foreground">
					{stub.pairs.length} common questions · {stub.commonMarks} marks · {stub.present(0).length}
					{t1.name} + {stub.present(1).length}
					{t2.name} students counted · {stub.absentCount(0) + stub.absentCount(1)} absent excluded
				</p>
			{:else}
				<p class="text-sm text-muted-foreground">
					{stub.present(tier).length} students counted · {stub.absentCount(tier)} absent excluded
				</p>
			{/if}
			<div class="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
				{#if tier === null}
					<span class="inline-flex items-center gap-1.5"
						><span class="size-3 rounded-full bg-foreground"></span>{t1.name}</span
					>
					<span class="inline-flex items-center gap-1.5"
						><span class="size-3 rounded-full border-2 border-foreground bg-background"
						></span>{t2.name}</span
					>
					<span class="inline-flex items-center gap-1.5"
						><span class="h-3.5 w-1 rounded-sm bg-primary"></span>Pooled (both tiers' students)</span
					>
					<span>Gap = {t1.name} − {t2.name}, points.</span>
				{:else}
					{@const other = stub.tiers[tier === 0 ? 1 : 0]}
					<span class="inline-flex items-center gap-1.5"
						><span class="size-3 rounded-full bg-foreground"></span>{stub.tiers[tier].name}</span
					>
					{#if hasPairs}
						<span class="inline-flex items-center gap-1.5"
							><span class="size-3 rounded-full border-2 border-foreground bg-background opacity-40"
							></span>{other.name}, on common questions</span
						>
						<span class="inline-flex items-center gap-1.5"
							><span class="h-3.5 w-1 rounded-sm bg-primary"></span>Pooled</span
						>
					{/if}
				{/if}
				<span>Faded / dashed = part-marked.</span>
			</div>
		</header>

		{#if single}
			<section class="space-y-2">
				<h3 class="text-base font-semibold">
					Red — below {pct(RED_BELOW)}%
					<span class="text-sm font-normal text-muted-foreground"
						>({singleSections.red.length})</span
					>
				</h3>
				{#if singleSections.red.length}
					{@render singleChart(singleSections.red)}
				{:else}
					<p class="text-sm text-muted-foreground">None.</p>
				{/if}
			</section>
			<section class="space-y-2">
				<h3 class="text-base font-semibold">
					Amber — {pct(RED_BELOW)}% to below {pct(GREEN_FROM)}%
					<span class="text-sm font-normal text-muted-foreground"
						>({singleSections.amber.length})</span
					>
				</h3>
				{#if singleSections.amber.length}
					{@render singleChart(singleSections.amber)}
				{:else}
					<p class="text-sm text-muted-foreground">None.</p>
				{/if}
			</section>
			<section class="space-y-2">
				<Button
					variant="ghost"
					class="h-auto gap-2 p-0 text-base font-semibold hover:bg-transparent"
					aria-expanded={greenOpen}
					onclick={() => (greenOpen = !greenOpen)}
				>
					<ChevronRightIcon class={cn('size-4', greenOpen && 'rotate-90')} />
					Green — {pct(GREEN_FROM)}% and above
					<span class="text-sm font-normal text-muted-foreground"
						>({singleSections.green.length})</span
					>
				</Button>
				{#if greenOpen}
					{@render singleChart(singleSections.green)}
				{/if}
			</section>
			<section class="space-y-2">
				<h3 class="text-base font-semibold">
					Not scored
					<span class="text-sm font-normal text-muted-foreground"
						>({singleSections.notScored.length})</span
					>
				</h3>
				{#if singleSections.notScored.length}
					{@render singleChart(singleSections.notScored)}
				{:else}
					<p class="text-sm text-muted-foreground">None.</p>
				{/if}
			</section>
		{:else}
			<div class="overflow-hidden rounded-lg border">
				{#if tier !== null}
					{@const self = stub.tiers[tier]}
					{@const other = stub.tiers[tier === 0 ? 1 : 0]}
					{@render axis('Question', 'Facility')}
					{#each tierRows as row (row.entry.id)}
						{@const c = commonById.get(row.entry.id)}
						{@const partner = c ? (tier === 0 ? c.b : c.a) : null}
						<div
							class="grid grid-cols-[15rem_1fr_5rem] items-center gap-3 border-b px-3 py-1.5 last:border-0"
						>
							<div class="min-w-0">
								<div class="text-sm font-semibold tabular-nums">
									{row.entry.label}
									<span class="font-normal text-muted-foreground"
										>· {row.entry.marks}
										{row.entry.marks === 1 ? 'mark' : 'marks'} · {row.entry.ao ?? '—'}</span
									>
									{#if partner}
										<span
											class="ml-1 inline-flex items-center gap-0.5 rounded border px-1 text-[11px] font-normal text-muted-foreground"
											title="Common with {other.name} {partner.entry.label}"
										>
											<LinkIcon class="size-3" />{other.short}
											{partner.entry.label}
										</span>
									{/if}
								</div>
								<div class="truncate text-xs text-muted-foreground" title={row.entry.summary}>
									{row.entry.summary}
								</div>
							</div>
							<Track filled={row} hollow={partner} pooled={c?.pooled ?? null} dimHollow />
							<div class="text-right tabular-nums">
								{#if row.facility !== null && row.band}
									<span class={cn('font-semibold', TEXT[row.band], row.partMarked && 'italic')}
										>{pct(row.facility)}%</span
									>
								{:else}
									<span class="text-muted-foreground">—</span>
								{/if}
								<div
									class={cn(
										'text-[11px] text-muted-foreground',
										row.partMarked && 'text-amber-700 italic dark:text-amber-300'
									)}
								>
									{self.short}
									{row.marked}/{row.of}
								</div>
							</div>
						</div>
					{/each}
				{:else}
					{@render axis(`${t1.short} ↔ ${t2.short}`, 'Gap')}
					{#each commonRows as c (c.a.entry.id)}
						<div
							class="grid grid-cols-[15rem_1fr_5rem] items-center gap-3 border-b px-3 py-1.5 last:border-0"
						>
							<div class="min-w-0">
								<div class="text-sm font-semibold tabular-nums">
									{c.a.entry.label} ↔ {c.b.entry.label}
									<span class="font-normal text-muted-foreground"
										>· {c.marks} {c.marks === 1 ? 'mark' : 'marks'}</span
									>
								</div>
								<div class="truncate text-xs text-muted-foreground" title={c.a.entry.summary}>
									{c.a.entry.summary}
								</div>
								<div class="text-[11px] text-muted-foreground tabular-nums">
									{t1.short}
									{c.a.marked}/{c.a.of} · {t2.short}
									{c.b.marked}/{c.b.of}
								</div>
							</div>
							<Track filled={c.a} hollow={c.b} pooled={c.pooled} />
							<div class="text-right tabular-nums">
								{#if c.gap === null}
									<span class="text-muted-foreground">—</span>
								{:else}
									<span class="font-semibold">{c.gap > 0 ? '+' : ''}{c.gap}</span>
								{/if}
								{#if c.pooled !== null && c.pooledBand}
									<div class={cn('text-[11px]', TEXT[c.pooledBand], c.partMarked && 'italic')}>
										pooled {pct(c.pooled)}%
									</div>
								{/if}
							</div>
						</div>
					{/each}
				{/if}
			</div>
		{/if}
	</div>
</main>

<CsvPreview
	bind:open={csvOpen}
	rows={tier === null ? stub.commonCsv() : stub.tierCsv(tier)}
	filename={stub.filename(slug, 'csv')}
/>
