<!--
	PROTOTYPE (#115) — Variant A: Third tab.
	The analysis page's toggle row is Tier 1 / Tier 2 / Common questions. The common
	tab is a table like a tier's: one row per pair, grouped into band sections by the
	pooled facility (worst first, green folded), with each tier's facility, the pooled
	facility and the gap side by side. Print / PDF / CSV follow the open tab.
-->
<script lang="ts">
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { cn } from '$lib/utils.js';
	import CsvPreview from './CsvPreview.svelte';
	import TierAnalysis from './TierAnalysis.svelte';
	import { downloadPdf } from './exports.js';
	import {
		DOT,
		GREEN_FROM,
		RED_BELOW,
		TINT,
		pct,
		tieredAnalysis,
		worstFirst,
		type CommonRow,
		type Rag,
		type Row,
		type TierIndex
	} from './stub.svelte.js';

	const stub = tieredAnalysis();
	const [t1, t2] = stub.tiers;

	let tab = $state('0');
	const hasPairs = $derived(stub.pairs.length > 0);
	const shown = $derived(!hasPairs && tab === 'common' ? '0' : tab);
	const tier = $derived<TierIndex | null>(shown === 'common' ? null : (Number(shown) as TierIndex));

	let view = $state<HTMLElement>();
	let greenOpen = $state(false);
	let csvOpen = $state(false);

	const common = $derived(worstFirst(stub.common, (c) => c.pooled));
	const commonOf = (b: Rag | null) => common.filter((c) => c.pooledBand === b);

	const counted = (t: TierIndex) => stub.present(t).length;
	const facts = $derived(
		tier === null
			? `${stub.pairs.length} common questions · ${stub.commonMarks} marks · ${counted(0)} ${t1.name} + ${counted(1)} ${t2.name} students counted · ${stub.absentCount(0) + stub.absentCount(1)} absent excluded`
			: `${counted(tier)} students counted · ${stub.absentCount(tier)} absent excluded`
	);
	const csvRows = $derived(tier === null ? stub.commonCsv() : stub.tierCsv(tier));
	const csvName = $derived(
		stub.filename(
			tier === null ? 'common-questions' : `${stub.tiers[tier].name.toLowerCase()}-analysis`,
			'csv'
		)
	);

	async function pdf() {
		if (!view) return;
		const was = greenOpen;
		greenOpen = true;
		await new Promise((r) => setTimeout(r));
		await downloadPdf(
			view,
			stub.filename(
				tier === null ? 'common-questions' : `${stub.tiers[tier].name.toLowerCase()}-analysis`,
				'pdf'
			)
		);
		greenOpen = was;
	}
</script>

{#snippet fig(row: Row, short: string)}
	<span class={cn('inline-flex items-center gap-1.5 tabular-nums', row.partMarked && 'italic')}>
		{#if row.band}<span class={cn('size-2 rounded-full', DOT[row.band])}></span>{/if}
		{row.facility === null ? '—' : `${pct(row.facility)}%`}
		<span class="text-xs text-muted-foreground">{short} {row.marked}/{row.of}</span>
	</span>
{/snippet}

{#snippet commonTable(list: CommonRow[])}
	<table class="w-full overflow-hidden rounded-lg border text-sm">
		<thead>
			<tr class="border-b text-left text-xs text-muted-foreground">
				<th class="px-2 py-1.5 font-medium">{t1.name}</th>
				<th class="px-2 py-1.5 font-medium">{t2.name}</th>
				<th class="px-2 py-1.5 font-medium">Summary</th>
				<th class="px-2 py-1.5 text-right font-medium">Marks</th>
				<th class="px-2 py-1.5 font-medium">{t1.name} facility</th>
				<th class="px-2 py-1.5 font-medium">{t2.name} facility</th>
				<th class="px-2 py-1.5 font-medium">Pooled</th>
				<th class="px-2 py-1.5 text-right font-medium">Gap</th>
			</tr>
		</thead>
		<tbody>
			{#each list as c (c.a.entry.id)}
				<tr
					class={cn(
						'border-b last:border-0',
						c.pooledBand ? TINT[c.pooledBand] : 'text-muted-foreground'
					)}
				>
					<td class="px-2 py-1.5 font-semibold tabular-nums">{c.a.entry.label}</td>
					<td class="px-2 py-1.5 font-semibold tabular-nums">{c.b.entry.label}</td>
					<td class="max-w-xs truncate px-2 py-1.5" title={c.a.entry.summary}
						>{c.a.entry.summary}</td
					>
					<td class="px-2 py-1.5 text-right tabular-nums">{c.marks}</td>
					<td class="px-2 py-1.5 whitespace-nowrap">{@render fig(c.a, t1.short)}</td>
					<td class="px-2 py-1.5 whitespace-nowrap">{@render fig(c.b, t2.short)}</td>
					<td
						class={cn(
							'px-2 py-1.5 font-semibold whitespace-nowrap tabular-nums',
							c.partMarked && 'italic'
						)}
					>
						{c.pooled === null ? '—' : `${pct(c.pooled)}%`}
						<span class="text-xs font-normal text-muted-foreground">{c.marked}/{c.of}</span>
					</td>
					<td class="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">
						{#if c.gap === null}
							—
						{:else}
							{c.gap > 0 ? '+' : ''}{c.gap}
							<span class="text-xs text-muted-foreground">pts</span>
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/snippet}

<main class="mx-auto max-w-6xl space-y-4 p-6">
	<div class="flex flex-wrap items-center gap-2 print:hidden">
		<Button variant="ghost" size="sm" onclick={() => toast('Would go back to the marksheet')}>
			<ArrowLeftIcon class="size-4" /> Back to marksheet
		</Button>
		<Button variant="outline" size="sm" class="ml-auto" onclick={() => window.print()}>
			<PrinterIcon class="size-4" /> Print
		</Button>
		<Button variant="outline" size="sm" onclick={() => void pdf()}>
			<DownloadIcon class="size-4" /> Download PDF
		</Button>
		<Button variant="outline" size="sm" onclick={() => (csvOpen = true)}>
			<DownloadIcon class="size-4" /> Download CSV
		</Button>
	</div>

	<ToggleGroup.Root type="single" variant="outline" bind:value={tab} class="w-fit print:hidden">
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

	<div class="space-y-4" bind:this={view}>
		<header class="space-y-1">
			<h2 class="text-xl font-semibold">
				{tier === null
					? `Common questions — ${t1.name} and ${t2.name}`
					: `Question analysis — Tier ${tier + 1} · ${stub.tiers[tier].name}`}
				<span class="font-normal text-muted-foreground">— {stub.paperLabel} · {stub.className}</span
				>
			</h2>
			<p class="text-sm text-muted-foreground">{facts}</p>
			{#if tier === null}
				<p class="text-xs text-muted-foreground">
					Each tier's facility is over its own students. Pooled is over both tiers' students
					together. Gap is {t1.name} minus {t2.name}, in percentage points. Sections follow the
					pooled facility.
				</p>
			{/if}
		</header>

		{#if tier !== null}
			<TierAnalysis rows={stub.rows(tier)} bind:greenOpen />
		{:else}
			<section class="space-y-2">
				<h3 class="text-base font-semibold">
					Red — pooled below {pct(RED_BELOW)}%
					<span class="text-sm font-normal text-muted-foreground">({commonOf('red').length})</span>
				</h3>
				{#if commonOf('red').length}{@render commonTable(commonOf('red'))}{:else}<p
						class="text-sm text-muted-foreground"
					>
						None.
					</p>{/if}
			</section>
			<section class="space-y-2">
				<h3 class="text-base font-semibold">
					Amber — pooled {pct(RED_BELOW)}% to below {pct(GREEN_FROM)}%
					<span class="text-sm font-normal text-muted-foreground">({commonOf('amber').length})</span
					>
				</h3>
				{#if commonOf('amber').length}{@render commonTable(commonOf('amber'))}{:else}<p
						class="text-sm text-muted-foreground"
					>
						None.
					</p>{/if}
			</section>
			<section class="space-y-2">
				<button
					type="button"
					class="flex items-center gap-2 text-base font-semibold"
					aria-expanded={greenOpen}
					onclick={() => (greenOpen = !greenOpen)}
				>
					<ChevronRightIcon class={cn('size-4', greenOpen && 'rotate-90')} />
					Green — pooled {pct(GREEN_FROM)}% and above
					<span class="text-sm font-normal text-muted-foreground">({commonOf('green').length})</span
					>
				</button>
				{#if greenOpen}{@render commonTable(commonOf('green'))}{/if}
			</section>
			<section class="space-y-2">
				<h3 class="text-base font-semibold">Not scored ({commonOf(null).length})</h3>
				{#if commonOf(null).length}{@render commonTable(commonOf(null))}{:else}<p
						class="text-sm text-muted-foreground"
					>
						None.
					</p>{/if}
			</section>
		{/if}
	</div>
</main>

<CsvPreview bind:open={csvOpen} rows={csvRows} filename={csvName} />
