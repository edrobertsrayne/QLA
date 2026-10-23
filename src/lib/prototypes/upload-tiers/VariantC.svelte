<!--
	PROTOTYPE — Variant C "Tabs + run dialog": one Source files card whose tiers are
	tabs (only one tier's files on screen at once), and the run lives in a dialog
	with one step per call. Failures and their actions stay inside the dialog.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import FatalAlert from '$lib/components/parse/FatalAlert.svelte';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import CheckCircleIcon from '@lucide/svelte/icons/circle-check';
	import CircleIcon from '@lucide/svelte/icons/circle';
	import XCircleIcon from '@lucide/svelte/icons/circle-x';
	import MinusCircleIcon from '@lucide/svelte/icons/circle-minus';
	import { toast } from 'svelte-sonner';
	import type { Snippet } from 'svelte';
	import PdfPicker from './PdfPicker.svelte';
	import OptionsFields from './OptionsFields.svelte';
	import { uploadRun, type StepError } from './run.svelte.js';

	const run = uploadRun();
	const busy = $derived(run.phase === 'running');

	let tab = $state('0');
	let dialogOpen = $state(false);

	const current = $derived(Math.min(Number(tab), run.tiers.length - 1));
	const tier = $derived(run.tiers[current]);
	const failedIndex = $derived(run.tiers.findIndex((t) => t.parse === 'failed'));

	function needed(index: number, kind: 'paper' | 'markscheme'): string | null {
		return run.mismatch.find((m) => m.tier === index && m.kind === kind)?.message ?? null;
	}

	function tabHasProblem(index: number): boolean {
		return run.mismatch.some((m) => m.tier === index) || run.tiers[index].parse === 'failed';
	}

	function addTier(): void {
		run.addTier();
		tab = '1';
	}

	function removeTier(): void {
		run.removeTier();
		tab = '0';
	}

	function start(): void {
		dialogOpen = true;
		void run.run();
	}

	function retry(index: number): void {
		dialogOpen = true;
		void run.retryTier(index);
	}

	function closeDialog(open: boolean): void {
		if (busy) return;
		dialogOpen = open;
		if (!open && failedIndex >= 0) tab = String(failedIndex);
	}

	type StepState = 'idle' | 'running' | 'done' | 'failed' | 'skipped';
</script>

{#snippet step(
	label: string,
	state: StepState,
	detail: string | null,
	error: StepError | null,
	action: Snippet | null
)}
	<li class="flex gap-3">
		<span class="mt-0.5">
			{#if state === 'running'}
				<Loader2Icon class="size-5 animate-spin text-muted-foreground" />
			{:else if state === 'done'}
				<CheckCircleIcon class="size-5 text-emerald-600" />
			{:else if state === 'failed'}
				<XCircleIcon class="size-5 text-destructive" />
			{:else if state === 'skipped'}
				<MinusCircleIcon class="size-5 text-muted-foreground" />
			{:else}
				<CircleIcon class="size-5 text-muted-foreground/50" />
			{/if}
		</span>
		<div class="min-w-0 flex-1 space-y-1">
			<p class={['font-medium', state === 'idle' && 'text-muted-foreground']}>{label}</p>
			{#if detail}<p class="text-muted-foreground">{detail}</p>{/if}
			{#if error}
				<p class="text-destructive">{error.message} ({error.code})</p>
			{/if}
			{#if action}
				{@render action()}
			{/if}
		</div>
	</li>
{/snippet}

<main class="mx-auto max-w-4xl space-y-6 p-6 pb-24">
	<div class="space-y-2">
		<h1 class="text-2xl font-bold tracking-tight">Parse assessment paper</h1>
		<p class="text-sm text-muted-foreground">
			Attach an assessment paper and/or its markscheme PDF, then Run. You get one JSON entry per
			marked question with marks, a short summary, spec point (exact lift or null), command word and
			assessment objective.
		</p>
	</div>

	<Separator />

	<div class="grid gap-6 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>Source files</Card.Title>
				<Card.Description>
					{run.twoTiers
						? 'Both tiers need the same inputs.'
						: 'One or both PDFs, each up to 15 MB — paper and/or markscheme.'}
				</Card.Description>
				<Card.Action>
					{#if !run.twoTiers && run.phase === 'form'}
						<Button variant="ghost" size="sm" onclick={addTier}><PlusIcon />Add tier</Button>
					{/if}
				</Card.Action>
			</Card.Header>
			<Card.Content class="space-y-5">
				{#if run.twoTiers}
					<div class="flex items-center justify-between gap-2">
						<ToggleGroup.Root type="single" variant="outline" bind:value={tab}>
							{#each run.tiers as t, i (t)}
								<ToggleGroup.Item value={String(i)} class="relative px-4">
									Tier {i + 1}{t.tierName ? ` · ${t.tierName}` : ''}
									{#if tabHasProblem(i)}
										<span class="absolute top-1 right-1 size-2 rounded-full bg-destructive"></span>
									{/if}
								</ToggleGroup.Item>
							{/each}
						</ToggleGroup.Root>
						{#if current === 1 && run.phase === 'form'}
							<Button variant="ghost" size="sm" onclick={removeTier}>Remove Tier 2</Button>
						{/if}
					</div>
				{/if}
				{#key current}
					<PdfPicker
						id="c-paper-{current}"
						label="Assessment paper (PDF)"
						filename={tier.paper}
						error={tier.paperError}
						needed={needed(current, 'paper')}
						disabled={!run.canEditFiles(current)}
						onpick={(name) => run.setFile(current, 'paper', name)}
					/>
					<PdfPicker
						id="c-ms-{current}"
						label="Markscheme (PDF)"
						filename={tier.markscheme}
						error={tier.markschemeError}
						needed={needed(current, 'markscheme')}
						disabled={!run.canEditFiles(current)}
						onpick={(name) => run.setFile(current, 'markscheme', name)}
					/>
				{/key}
			</Card.Content>
		</Card.Root>

		<Card.Root class="overflow-visible">
			<Card.Header>
				<Card.Title>Options</Card.Title>
				<Card.Description>
					{run.twoTiers
						? 'Used for both tiers.'
						: 'Pick a curated model with native PDF parsing, or choose Custom for any OpenRouter model id.'}
				</Card.Description>
			</Card.Header>
			<Card.Content><OptionsFields disabled={run.phase !== 'form'} /></Card.Content>
		</Card.Root>
	</div>

	<div class="flex items-center gap-3">
		{#if run.phase === 'stopped' && failedIndex >= 0}
			<Button size="lg" onclick={() => retry(failedIndex)}>Retry Tier {failedIndex + 1}</Button>
			<span class="text-sm text-muted-foreground"
				>Tier {failedIndex + 1} failed{run.twoTiers
					? `; Tier ${failedIndex === 0 ? 2 : 1} is kept`
					: ''}.</span
			>
		{:else if run.phase === 'form'}
			<Button size="lg" disabled={!run.canRun} onclick={start}>Run</Button>
		{:else}
			<Button size="lg" variant="outline" onclick={() => (dialogOpen = true)}>Show run</Button>
		{/if}
	</div>

	{#if run.fatal}
		<FatalAlert fatal={run.fatal} retryable={false} />
	{/if}
</main>

<Dialog.Root open={dialogOpen} onOpenChange={closeDialog}>
	<Dialog.Content
		showCloseButton={!busy}
		interactOutsideBehavior={busy ? 'ignore' : 'close'}
		escapeKeydownBehavior={busy ? 'ignore' : 'close'}
	>
		<Dialog.Header>
			<Dialog.Title>
				{#if run.fatal}Run failed{:else if busy}Running…{:else if run.phase === 'done'}Ready for
					review{:else}Run stopped{/if}
			</Dialog.Title>
			<Dialog.Description>
				{run.twoTiers
					? 'Each tier is parsed on its own, then the two are compared.'
					: 'The paper is parsed into a breakdown.'}
			</Dialog.Description>
		</Dialog.Header>

		{#if run.fatal}
			<FatalAlert fatal={run.fatal} retryable={false} />
		{:else}
			<ol class="space-y-4">
				{#each run.tiers as t, i (t)}
					{#snippet retryAction()}
						<Button size="sm" variant="outline" onclick={() => run.retryTier(i)}>Retry</Button>
					{/snippet}
					{#snippet replaceAction()}
						<p class="text-muted-foreground">
							Close this, replace Tier {i + 1}'s file, then retry.
						</p>
					{/snippet}
					{@render step(
						run.twoTiers ? `Parse Tier ${i + 1}` : 'Parse',
						t.parse,
						t.parse === 'done' ? `${t.tierName ?? 'No tier printed'} · ${t.entries} entries` : null,
						t.parse === 'failed' ? t.error : null,
						t.parse === 'failed' ? (t.error?.retryable ? retryAction : replaceAction) : null
					)}
				{/each}
				{#if run.twoTiers}
					{#snippet matchActions()}
						<div class="flex flex-wrap gap-2">
							<Button size="sm" onclick={run.tryMatchAgain}>Try again</Button>
							<Button size="sm" variant="outline" onclick={run.continueWithoutPairs}
								>Continue without proposed pairs</Button
							>
						</div>
					{/snippet}
					{@render step(
						'Find common questions',
						run.match,
						run.match === 'done'
							? `${run.pairs} pairs proposed`
							: run.match === 'skipped'
								? 'Skipped: pair them by hand at review'
								: run.notice
									? 'None proposed: pair them by hand at review'
									: null,
						run.match === 'failed' ? run.matchError : null,
						run.match === 'failed' && run.phase === 'stopped' ? matchActions : null
					)}
				{/if}
			</ol>
		{/if}

		{#if run.phase === 'done'}
			<Dialog.Footer>
				<Button onclick={() => toast.info('Prototype: would open the breakdown review')}
					>Open breakdown</Button
				>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
