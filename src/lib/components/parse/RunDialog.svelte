<!--
	The run dialog: one step per call. A parse failure keeps the other tier's
	result; a replaceable file closes the dialog on its tab; a stopped run can
	be retried or abandoned back to the form (keeping the files and unlocking
	the options); only a finished run offers Open breakdown.
-->
<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import FatalAlert from './FatalAlert.svelte';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import CheckCircleIcon from '@lucide/svelte/icons/circle-check';
	import CircleIcon from '@lucide/svelte/icons/circle';
	import XCircleIcon from '@lucide/svelte/icons/circle-x';
	import MinusCircleIcon from '@lucide/svelte/icons/circle-minus';
	import type { Snippet } from 'svelte';
	import { count } from '$lib/prose.js';
	import { isFileProblem, type UploadRun } from './run.svelte.js';
	import type { ApiFailure } from '$lib/api-error.js';

	interface Props {
		run: UploadRun;
		open: boolean;
		onReplaceFile: (index: number) => void;
		onBackToUpload: () => void;
		onOpenBreakdown: () => void;
	}

	let { run, open, onReplaceFile, onBackToUpload, onOpenBreakdown }: Props = $props();

	const busy = $derived(run.phase === 'running');
	const retryIndex = $derived(run.retryIndex);

	type StepState = 'idle' | 'running' | 'done' | 'failed' | 'skipped';
</script>

{#snippet step(
	label: string,
	state: StepState,
	detail: string | null,
	error: ApiFailure | null,
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
				<p class="text-destructive">{error.message} ({error.code ?? 'REQUEST_FAILED'})</p>
			{/if}
			{#if action}
				{@render action()}
			{/if}
		</div>
	</li>
{/snippet}

<Dialog.Root
	{open}
	onOpenChange={(next) => {
		if (!next) onBackToUpload();
	}}
>
	<Dialog.Content
		showCloseButton={false}
		interactOutsideBehavior={run.phase === 'stopped' ? 'close' : 'ignore'}
		escapeKeydownBehavior={run.phase === 'stopped' ? 'close' : 'ignore'}
	>
		<Dialog.Header>
			<Dialog.Title>
				{#if run.fatal}
					Run failed
				{:else if busy}
					Running…
				{:else if run.phase === 'done'}
					Ready for review
				{:else}
					Run stopped
				{/if}
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
			<!-- Step changes are progress: announce them without stealing focus. -->
			<div aria-live="polite">
				<ol class="space-y-4">
					{#each run.tiers as tier, index (tier)}
						{#snippet replaceAction()}
							<Button size="sm" variant="outline" onclick={() => onReplaceFile(index)}>
								Replace Tier {index + 1}'s file
							</Button>
						{/snippet}
						{@render step(
							run.twoTiers ? `Parse Tier ${index + 1}` : 'Parse',
							tier.parse,
							tier.parse === 'done'
								? `${tier.tierName ?? 'No tier printed'} · ${count(tier.entryCount ?? 0, 'entry', 'entries')}`
								: null,
							tier.parse === 'failed' ? tier.error : null,
							tier.parse === 'failed' && tier.error !== null && isFileProblem(tier.error)
								? replaceAction
								: null
						)}
					{/each}
					{#if run.twoTiers}
						{#snippet matchActions()}
							<div class="flex flex-wrap gap-2">
								<Button size="sm" onclick={() => void run.tryMatchAgain()}>Try again</Button>
								<Button size="sm" variant="outline" onclick={() => run.continueWithoutPairs()}>
									Continue without proposed pairs
								</Button>
							</div>
						{/snippet}
						{@render step(
							'Find common questions',
							run.match,
							run.match === 'done'
								? `${count(run.pairs ?? 0, 'pair')} proposed`
								: run.match === 'skipped'
									? 'Skipped: pair them by hand at review'
									: run.notice !== null
										? 'None proposed: pair them by hand at review'
										: null,
							run.match === 'failed' ? run.matchError : null,
							run.phase === 'stopped' && run.match === 'failed' ? matchActions : null
						)}
					{/if}
				</ol>
			</div>
		{/if}

		{#if run.fatal}
			<Dialog.Footer>
				<Button variant="outline" onclick={onBackToUpload}>Back to upload</Button>
			</Dialog.Footer>
		{:else if run.phase === 'stopped'}
			<Dialog.Footer>
				{#if retryIndex !== null && run.canRetry(retryIndex)}
					{@const index = retryIndex}
					<Button onclick={() => void run.retryTier(index)}>
						{run.twoTiers ? `Retry Tier ${index + 1}` : 'Retry'}
					</Button>
				{/if}
				<Button variant="outline" onclick={onBackToUpload}>Back to upload</Button>
			</Dialog.Footer>
		{:else if run.phase === 'done'}
			<Dialog.Footer>
				<Button onclick={onOpenBreakdown}>Open breakdown</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
