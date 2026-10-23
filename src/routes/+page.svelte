<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import FatalAlert from '$lib/components/parse/FatalAlert.svelte';
	import OptionsCard from '$lib/components/parse/OptionsCard.svelte';
	import RunDialog from '$lib/components/parse/RunDialog.svelte';
	import SourceFilesCard from '$lib/components/parse/SourceFilesCard.svelte';
	import { UploadRun } from '$lib/components/parse/run.svelte.js';
	import CorruptDocumentAlert from '$lib/components/shell/CorruptDocumentAlert.svelte';
	import RestoreCard from '$lib/components/shell/RestoreCard.svelte';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	const store = marksheetStore();
	const run = new UploadRun();

	let dialogOpen = $state(false);
	let tierTab = $state(0);

	const canRun = $derived(run.canRun && store.document === null);
	const retryIndex = $derived(run.retryIndex);

	function startRun(): void {
		if (!canRun) return;
		dialogOpen = true;
		void run.run();
	}

	function retryRun(index: number): void {
		dialogOpen = true;
		void run.retryTier(index);
	}

	/** The run keeps the other tier; the page goes to the tab whose file must change. */
	function replaceFile(index: number): void {
		dialogOpen = false;
		tierTab = index;
	}

	function openBreakdown(): void {
		if (run.phase !== 'done') return;
		const tiers = run.tierResults();
		if (tiers === null) return;
		store.createFromAssessment({
			tiers,
			pairs: run.match === 'done' ? run.matchPairs : [],
			usage: run.usage,
			matchNotice: run.notice
		});
		dialogOpen = false;
		void goto(resolve('/breakdown'));
	}
</script>

<svelte:head>
	<title>Upload · QLA</title>
</svelte:head>

<main class="mx-auto max-w-4xl space-y-6 p-6">
	<CorruptDocumentAlert />

	<div class="space-y-2">
		<h1 class="text-2xl font-bold tracking-tight">Parse assessment paper</h1>
		<p class="text-sm text-muted-foreground">
			Attach an assessment paper and/or its markscheme PDF, then Run. You get one JSON entry per
			marked question with marks, a short summary, spec point (exact lift or null), command word and
			assessment objective.
		</p>
	</div>

	<Separator />

	{#if !store.document}
		<RestoreCard />
	{/if}

	<div class="grid gap-6 lg:grid-cols-2">
		<SourceFilesCard {run} tab={tierTab} onTabChange={(index) => (tierTab = index)} />
		<OptionsCard {run} />
	</div>

	<div>
		{#if retryIndex !== null}
			{@const index = retryIndex}
			<Button
				type="button"
				size="lg"
				disabled={!run.canRetry(index)}
				onclick={() => retryRun(index)}
			>
				Retry Tier {index + 1}
			</Button>
		{:else}
			<Button type="button" size="lg" disabled={!canRun} onclick={startRun}>Run</Button>
		{/if}
	</div>

	{#if run.fatal && !dialogOpen}
		<FatalAlert fatal={run.fatal} retryable={false} />
	{/if}

	<RunDialog
		{run}
		open={dialogOpen}
		onReplaceFile={replaceFile}
		onBackToUpload={() => (dialogOpen = false)}
		onOpenBreakdown={openBreakdown}
	/>
</main>
