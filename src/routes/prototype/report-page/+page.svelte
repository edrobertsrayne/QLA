<!--
	PROTOTYPE (wayfinder #53): one student's report on one side of A4.
	Three layouts via `?variant=A|B|C`; what happens when edited feedback outgrows
	the page via the "When feedback overflows" control. Pages are edited in place,
	as on the review step. Throwaway route; sample data in memory only.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { Portal } from 'bits-ui';
	import { page as appPage } from '$app/state';
	import PrototypeSwitcher from '$lib/components/prototype/PrototypeSwitcher.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import Sheet from '$lib/prototypes/report-page/Sheet.svelte';
	import VariantA from '$lib/prototypes/report-page/VariantA.svelte';
	import VariantC from '$lib/prototypes/report-page/VariantC.svelte';
	import VariantD from '$lib/prototypes/report-page/VariantD.svelte';
	import VariantE from '$lib/prototypes/report-page/VariantE.svelte';
	import VariantF from '$lib/prototypes/report-page/VariantF.svelte';
	import { REPORTS, generatedProse } from '$lib/prototypes/report-page/sample.js';
	import { reportPage, wordCount, type FitMode } from '$lib/prototypes/report-page/state.svelte.js';

	// Round 2: A and C kept as the references; D–F iterate on C's straight table at larger type.
	const VARIANTS = [
		{ key: 'D', label: 'Split table, full-width bands' },
		{ key: 'E', label: 'Feedback first, table beside roll-up' },
		{ key: 'F', label: 'Sidebar, larger type' },
		{ key: 'A', label: 'Round 1: ledger' },
		{ key: 'C', label: 'Round 1: sidebar' }
	];
	const COMPONENTS = { A: VariantA, C: VariantC, D: VariantD, E: VariantE, F: VariantF };
	const variant = $derived(appPage.url.searchParams.get('variant') ?? 'D');
	const Variant = $derived(COMPONENTS[variant as keyof typeof COMPONENTS] ?? VariantD);

	const rp = reportPage();
	let printing = $state<string[]>([]);

	const edited = (id: string) =>
		JSON.stringify(rp.prose[id]) !== JSON.stringify(generatedProse(id));
	const words = (id: string) =>
		[...rp.prose[id].strengths, ...rp.prose[id].areas].reduce((n, t) => n + wordCount(t), 0);

	async function print(ids: string[]) {
		const over = ids.filter((id) => (rp.overMm[id] ?? 0) > 0);
		if (
			over.length > 0 &&
			!confirm(
				`${over.length} report${over.length === 1 ? '' : 's'} run over the page; print cuts the overflow off. Print anyway?`
			)
		)
			return;
		printing = ids;
		await tick();
		window.print();
	}
</script>

<svelte:head><title>Report page prototype · QLA</title></svelte:head>

<main class="mx-auto max-w-[230mm] space-y-4 p-6 pb-24">
	<div
		class="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border bg-background/95 p-3 text-sm shadow-sm backdrop-blur"
	>
		<span class="text-muted-foreground">When feedback overflows</span>
		<ToggleGroup.Root
			type="single"
			variant="outline"
			size="sm"
			value={rp.fit}
			onValueChange={(v) => v && (rp.fit = v as FitMode)}
		>
			<ToggleGroup.Item value="shrink">Shrink text</ToggleGroup.Item>
			<ToggleGroup.Item value="cap">Cap words</ToggleGroup.Item>
			<ToggleGroup.Item value="flag">Flag only</ToggleGroup.Item>
		</ToggleGroup.Root>
		<label class="flex items-center gap-1.5">
			<input type="checkbox" bind:checked={rp.greyscale} /> Greyscale preview
		</label>
		<Button
			variant="outline"
			size="sm"
			title="Stress test: appends a 30-word sentence to every area for improvement"
			onclick={() => rp.pad()}
		>
			Pad every report
		</Button>
		<Button class="ml-auto" size="sm" onclick={() => print(REPORTS.map((r) => r.id))}>
			Print all
		</Button>
	</div>

	{#each REPORTS as r (r.id)}
		{@const over = rp.overMm[r.id] ?? 0}
		{@const scale = rp.scale[r.id] ?? 1}
		<div class="space-y-1">
			<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
				<span class="font-medium">{r.name}</span>
				<span class="text-muted-foreground tabular-nums">{words(r.id)} words of feedback</span>
				{#if over > 0}
					<span class="rounded bg-red-600 px-1.5 py-0.5 font-medium text-white">
						Runs {over} mm over the page; print cuts it off
					</span>
				{:else if scale < 1}
					<span class="rounded bg-amber-300 px-1.5 py-0.5 text-black">
						Feedback shrunk to {Math.round(scale * 100)}% to fit
					</span>
				{:else}
					<span class="text-emerald-700 dark:text-emerald-400">Fits on one side</span>
				{/if}
				{#if edited(r.id)}
					<span class="text-muted-foreground">Edited</span>
					<Button variant="link" size="xs" class="h-auto p-0" onclick={() => rp.revert(r.id)}>
						Revert
					</Button>
				{/if}
				<Button variant="outline" size="xs" class="ml-auto" onclick={() => print([r.id])}>
					Print
				</Button>
			</div>
			<div class="overflow-x-auto" class:grayscale={rp.greyscale}>
				<Sheet id={r.id} measure>
					<Variant report={r} editable />
				</Sheet>
			</div>
		</div>
	{/each}
</main>

<Portal>
	<div class="qla-print-root">
		{#each printing as id (id)}
			{@const r = REPORTS.find((x) => x.id === id)!}
			<div class="qla-print-page">
				<Sheet {id} measure={false}><Variant report={r} editable={false} /></Sheet>
			</div>
		{/each}
	</div>
</Portal>

<PrototypeSwitcher variants={VARIANTS} current={variant} />

<style>
	:global(.report-sheet) {
		print-color-adjust: exact;
		-webkit-print-color-adjust: exact;
	}
	:global(.qla-print-root) {
		display: none;
	}
	@media print {
		@page {
			size: A4;
			margin: 0;
		}
		:global(body > :not(.qla-print-root)) {
			display: none !important;
		}
		:global(.qla-print-root) {
			display: block;
		}
		:global(.qla-print-page) {
			break-after: page;
		}
	}
</style>
