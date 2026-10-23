<!--
	PROTOTYPE (#115) — Variant B: Inline in each tier.
	No separate view. Each tier's analysis keeps its own bands and order; a common
	question's row carries its partner on the other tier, that tier's facility, the
	pooled facility and the gap in four extra columns (blank on other rows). A filter
	narrows the tier to its common questions. The tier's PDF carries the extra
	columns; the CSV menu offers the tier's CSV or the common-questions CSV.
-->
<script lang="ts">
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import LinkIcon from '@lucide/svelte/icons/link-2';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import { Toggle } from '$lib/components/ui/toggle';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { cn } from '$lib/utils.js';
	import CsvPreview from './CsvPreview.svelte';
	import TierAnalysis from './TierAnalysis.svelte';
	import { downloadPdf } from './exports.js';
	import { DOT, TEXT, pct, tieredAnalysis, type Row, type TierIndex } from './stub.svelte.js';

	const stub = tieredAnalysis();

	let tab = $state('0');
	const tier = $derived(Number(tab) as TierIndex);
	const other = $derived((tier === 0 ? 1 : 0) as TierIndex);
	const self = $derived(stub.tiers[tier]);
	const them = $derived(stub.tiers[other]);

	let onlyCommon = $state(false);
	let greenOpen = $state(false);
	let view = $state<HTMLElement>();
	let csv = $state<'tier' | 'common' | null>(null);
	let csvOpen = $state(false);

	const commonById = $derived(
		new Map(stub.common.map((c) => [tier === 0 ? c.a.entry.id : c.b.entry.id, c]))
	);
	const rows = $derived(stub.rows(tier).filter((r) => !onlyCommon || commonById.has(r.entry.id)));
	const tierMarks = $derived(self.entries.reduce((s, e) => s + e.marks, 0));

	function openCsv(which: 'tier' | 'common') {
		csv = which;
		csvOpen = true;
	}

	async function pdf() {
		if (!view) return;
		const was = greenOpen;
		greenOpen = true;
		await new Promise((r) => setTimeout(r));
		await downloadPdf(view, stub.filename(`${self.name.toLowerCase()}-analysis`, 'pdf'));
		greenOpen = was;
	}
</script>

{#snippet extraHead()}
	{#if stub.pairs.length}
		<th class="border-l px-2 py-1.5 font-medium">Common with {them.short}</th>
		<th class="px-2 py-1.5 font-medium">{them.name}</th>
		<th class="px-2 py-1.5 font-medium">Pooled</th>
		<th class="px-2 py-1.5 text-right font-medium">Gap</th>
	{/if}
{/snippet}

{#snippet extraCell(row: Row)}
	{#if stub.pairs.length}
		{@const c = commonById.get(row.entry.id)}
		{#if c}
			{@const partner = tier === 0 ? c.b : c.a}
			{@const gap = c.gap === null ? null : tier === 0 ? c.gap : -c.gap}
			<td class="border-l px-2 py-1.5 font-semibold whitespace-nowrap tabular-nums">
				<LinkIcon class="inline size-3 text-muted-foreground" />
				{partner.entry.label}
			</td>
			<td class={cn('px-2 py-1.5 whitespace-nowrap tabular-nums', partner.partMarked && 'italic')}>
				{#if partner.band}<span
						class={cn('mr-1 inline-block size-2 rounded-full', DOT[partner.band])}
					></span>{/if}
				{partner.facility === null ? '—' : `${pct(partner.facility)}%`}
				<span class="text-xs text-muted-foreground">{partner.marked}/{partner.of}</span>
			</td>
			<td
				class={cn(
					'px-2 py-1.5 font-semibold whitespace-nowrap tabular-nums',
					c.pooledBand && TEXT[c.pooledBand],
					c.partMarked && 'italic'
				)}
			>
				{c.pooled === null ? '—' : `${pct(c.pooled)}%`}
			</td>
			<td class="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">
				{gap === null ? '—' : `${gap > 0 ? '+' : ''}${gap}`}
			</td>
		{:else}
			<td class="border-l"></td><td></td><td></td><td></td>
		{/if}
	{/if}
{/snippet}

<main class="mx-auto max-w-7xl space-y-4 p-6">
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
		<Popover.Root>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="outline" size="sm"
						><DownloadIcon class="size-4" /> Download CSV ▾</Button
					>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="grid w-64 gap-1 p-1" align="end">
				<Button variant="ghost" size="sm" class="justify-start" onclick={() => openCsv('tier')}>
					{self.name} analysis (.csv)
				</Button>
				<Button
					variant="ghost"
					size="sm"
					class="justify-start"
					disabled={!stub.pairs.length}
					onclick={() => openCsv('common')}
				>
					Common questions (.csv)
				</Button>
			</Popover.Content>
		</Popover.Root>
	</div>

	<div class="flex flex-wrap items-center gap-3 print:hidden">
		<ToggleGroup.Root type="single" variant="outline" bind:value={tab} class="w-fit">
			{#each [0, 1] as const as t (t)}
				<ToggleGroup.Item value={String(t)} class="px-4"
					>Tier {t + 1} · {stub.tiers[t].name}</ToggleGroup.Item
				>
			{/each}
		</ToggleGroup.Root>
		{#if stub.pairs.length}
			<Toggle variant="outline" size="sm" bind:pressed={onlyCommon}>
				<LinkIcon class="size-3.5" /> Only common questions ({stub.pairs.length})
			</Toggle>
		{/if}
	</div>

	<div class="space-y-4" bind:this={view}>
		<header class="space-y-1">
			<h2 class="text-xl font-semibold">
				Question analysis — Tier {tier + 1} · {self.name}
				<span class="font-normal text-muted-foreground">— {stub.paperLabel} · {stub.className}</span
				>
			</h2>
			<p class="text-sm text-muted-foreground">
				{stub.present(tier).length} students counted · {stub.absentCount(tier)} absent excluded
			</p>
			{#if stub.pairs.length}
				<p class="text-xs text-muted-foreground">
					{stub.pairs.length} of {self.entries.length} entries ({stub.commonMarks} of {tierMarks} marks)
					are common with {them.name}. {them.name} is that tier's facility over its own
					{stub.present(other).length} students; pooled is over both tiers'
					{stub.present(0).length + stub.present(1).length}; gap is {self.name} minus {them.name}.
				</p>
			{:else}
				<p class="text-xs text-muted-foreground">
					No common questions were confirmed with {them.name}.
				</p>
			{/if}
		</header>

		<TierAnalysis {rows} bind:greenOpen {extraHead} {extraCell} />
	</div>
</main>

<CsvPreview
	bind:open={csvOpen}
	rows={csv === 'common' ? stub.commonCsv() : stub.tierCsv(tier)}
	filename={stub.filename(
		csv === 'common' ? 'common-questions' : `${self.name.toLowerCase()}-analysis`,
		'csv'
	)}
/>
