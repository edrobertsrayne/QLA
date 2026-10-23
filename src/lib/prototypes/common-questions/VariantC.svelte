<!--
	PROTOTYPE (#115) — Variant C: Comparison page.
	Each tier's analysis is today's page with a two-tier toggle. A "Compare common
	questions" button opens a page of its own: one line per pair on a 0–100% track
	shaded red/amber/green, each tier's facility a dot, the pooled facility a bar
	between them, the gap at the end. Sortable by biggest gap, pooled worst first or
	paper order. Its PDF is the chart page; its CSV is the common-questions CSV.
-->
<script lang="ts">
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import GitCompareIcon from '@lucide/svelte/icons/git-compare';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { cn } from '$lib/utils.js';
	import CsvPreview from './CsvPreview.svelte';
	import TierAnalysis from './TierAnalysis.svelte';
	import { downloadPdf } from './exports.js';
	import {
		GREEN_FROM,
		RED_BELOW,
		TEXT,
		pct,
		tieredAnalysis,
		worstFirst,
		type CommonRow,
		type TierIndex
	} from './stub.svelte.js';

	const stub = tieredAnalysis();
	const [t1, t2] = stub.tiers;

	let page = $state<'tier' | 'compare'>('tier');
	let tab = $state('0');
	const tier = $derived(Number(tab) as TierIndex);
	let sort = $state('gap');
	let greenOpen = $state(false);
	let view = $state<HTMLElement>();
	let csvOpen = $state(false);

	const sorted = $derived.by((): CommonRow[] => {
		const rows = stub.common;
		if (sort === 'paper') return rows;
		if (sort === 'pooled') return worstFirst(rows, (c) => c.pooled);
		return worstFirst(rows, (c) => (c.gap === null ? null : -Math.abs(c.gap)));
	});

	const x = (f: number) => `${pct(f)}%`;

	async function pdf() {
		if (!view) return;
		const was = greenOpen;
		greenOpen = true;
		await new Promise((r) => setTimeout(r));
		await downloadPdf(
			view,
			stub.filename(
				page === 'compare' ? 'common-questions' : `${stub.tiers[tier].name.toLowerCase()}-analysis`,
				'pdf'
			)
		);
		greenOpen = was;
	}
</script>

<main class="mx-auto max-w-6xl space-y-4 p-6">
	<div class="flex flex-wrap items-center gap-2 print:hidden">
		{#if page === 'compare'}
			<Button variant="ghost" size="sm" onclick={() => (page = 'tier')}>
				<ArrowLeftIcon class="size-4" /> Back to analysis
			</Button>
		{:else}
			<Button variant="ghost" size="sm" onclick={() => toast('Would go back to the marksheet')}>
				<ArrowLeftIcon class="size-4" /> Back to marksheet
			</Button>
		{/if}
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

	{#if page === 'tier'}
		<div class="flex flex-wrap items-center gap-3 print:hidden">
			<ToggleGroup.Root type="single" variant="outline" bind:value={tab} class="w-fit">
				{#each [0, 1] as const as t (t)}
					<ToggleGroup.Item value={String(t)} class="px-4"
						>Tier {t + 1} · {stub.tiers[t].name}</ToggleGroup.Item
					>
				{/each}
			</ToggleGroup.Root>
			<Button
				variant="secondary"
				size="sm"
				disabled={!stub.pairs.length}
				title={stub.pairs.length ? undefined : 'No common questions were confirmed'}
				onclick={() => (page = 'compare')}
			>
				<GitCompareIcon class="size-4" /> Compare common questions ({stub.pairs.length})
			</Button>
		</div>
		<div class="space-y-4" bind:this={view}>
			<header class="space-y-1">
				<h2 class="text-xl font-semibold">
					Question analysis — Tier {tier + 1} · {stub.tiers[tier].name}
					<span class="font-normal text-muted-foreground"
						>— {stub.paperLabel} · {stub.className}</span
					>
				</h2>
				<p class="text-sm text-muted-foreground">
					{stub.present(tier).length} students counted · {stub.absentCount(tier)} absent excluded
				</p>
			</header>
			<TierAnalysis rows={stub.rows(tier)} bind:greenOpen />
		</div>
	{:else}
		<div class="flex flex-wrap items-center gap-3 print:hidden">
			<span class="text-sm text-muted-foreground">Sort</span>
			<ToggleGroup.Root type="single" variant="outline" size="sm" bind:value={sort}>
				<ToggleGroup.Item value="gap" class="px-3">Biggest gap</ToggleGroup.Item>
				<ToggleGroup.Item value="pooled" class="px-3">Pooled, worst first</ToggleGroup.Item>
				<ToggleGroup.Item value="paper" class="px-3">{t1.name} paper order</ToggleGroup.Item>
			</ToggleGroup.Root>
		</div>
		<div class="space-y-4" bind:this={view}>
			<header class="space-y-1">
				<h2 class="text-xl font-semibold">
					Common questions — {t1.name} and {t2.name}
					<span class="font-normal text-muted-foreground"
						>— {stub.paperLabel} · {stub.className}</span
					>
				</h2>
				<p class="text-sm text-muted-foreground">
					{stub.pairs.length} common questions · {stub.commonMarks} marks · {stub.present(0).length}
					{t1.name} + {stub.present(1).length}
					{t2.name} students counted
				</p>
				<div class="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
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
					<span>Gap = {t1.name} − {t2.name}, points. Hollow/italic = part-marked.</span>
				</div>
			</header>

			<div class="overflow-hidden rounded-lg border">
				<div
					class="grid grid-cols-[14rem_1fr_4.5rem] items-center gap-3 border-b px-3 py-1.5 text-xs text-muted-foreground"
				>
					<span>{t1.short} ↔ {t2.short}</span>
					<div class="relative h-4">
						{#each [0, 0.25, RED_BELOW, 0.5, GREEN_FROM, 1] as tick (tick)}
							<span class="absolute -translate-x-1/2 tabular-nums" style:left={x(tick)}
								>{pct(tick)}</span
							>
						{/each}
					</div>
					<span class="text-right">Gap</span>
				</div>
				{#each sorted as c (c.a.entry.id)}
					{@const lo = Math.min(c.a.facility ?? 1, c.b.facility ?? 1)}
					{@const hi = Math.max(c.a.facility ?? 0, c.b.facility ?? 0)}
					<div
						class="grid grid-cols-[14rem_1fr_4.5rem] items-center gap-3 border-b px-3 py-2 last:border-0"
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
						<div class="relative h-8">
							<div
								class="absolute inset-y-2 left-0 rounded-l bg-red-500/15"
								style:width={x(RED_BELOW)}
							></div>
							<div
								class="absolute inset-y-2 bg-amber-400/20"
								style:left={x(RED_BELOW)}
								style:width={x(GREEN_FROM - RED_BELOW)}
							></div>
							<div
								class="absolute inset-y-2 right-0 rounded-r bg-emerald-500/15"
								style:left={x(GREEN_FROM)}
							></div>
							{#if c.a.facility !== null && c.b.facility !== null}
								<div
									class="absolute top-1/2 h-0.5 -translate-y-1/2 bg-foreground/50"
									style:left={x(lo)}
									style:width={x(hi - lo)}
								></div>
							{/if}
							{#if c.pooled !== null}
								<div
									class="absolute top-1 h-6 w-1 -translate-x-1/2 rounded-sm bg-primary"
									style:left={x(c.pooled)}
									title="Pooled {pct(c.pooled)}%"
								></div>
							{/if}
							{#if c.a.facility !== null}
								<div
									class={cn(
										'absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground',
										c.a.partMarked && 'opacity-50'
									)}
									style:left={x(c.a.facility)}
									title="{t1.name} {pct(c.a.facility)}%"
								></div>
								<span
									class="absolute -top-1.5 -translate-x-1/2 text-[10px] tabular-nums"
									style:left={x(c.a.facility)}>{pct(c.a.facility)}</span
								>
							{/if}
							{#if c.b.facility !== null}
								<div
									class={cn(
										'absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground bg-background',
										c.b.partMarked && 'border-dashed'
									)}
									style:left={x(c.b.facility)}
									title="{t2.name} {pct(c.b.facility)}%"
								></div>
								<span
									class="absolute -bottom-1.5 -translate-x-1/2 text-[10px] tabular-nums"
									style:left={x(c.b.facility)}>{pct(c.b.facility)}</span
								>
							{:else}
								<span
									class="absolute top-1/2 right-1 -translate-y-1/2 text-[11px] text-muted-foreground"
									>{t2.name} not marked yet</span
								>
							{/if}
						</div>
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
			</div>
		</div>
	{/if}
</main>

<CsvPreview
	bind:open={csvOpen}
	rows={page === 'compare' ? stub.commonCsv() : stub.tierCsv(tier)}
	filename={stub.filename(
		page === 'compare' ? 'common-questions' : `${stub.tiers[tier].name.toLowerCase()}-analysis`,
		'csv'
	)}
/>
