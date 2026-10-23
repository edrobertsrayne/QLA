<!--
	PROTOTYPE — Variant A "Tier cards": today's page with the Source files card
	turning into one card per tier. Each tier card carries its own run status and
	retry; matching gets its own strip under the cards.
-->
<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import * as Alert from '$lib/components/ui/alert';
	import * as Card from '$lib/components/ui/card';
	import FatalAlert from '$lib/components/parse/FatalAlert.svelte';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import CheckIcon from '@lucide/svelte/icons/check';
	import LinkIcon from '@lucide/svelte/icons/link-2';
	import { toast } from 'svelte-sonner';
	import PdfPicker from './PdfPicker.svelte';
	import OptionsFields from './OptionsFields.svelte';
	import { uploadRun, type TierSlot } from './run.svelte.js';

	const run = uploadRun();
	const busy = $derived(run.phase === 'running');

	function needed(index: number, kind: 'paper' | 'markscheme'): string | null {
		return run.mismatch.find((m) => m.tier === index && m.kind === kind)?.message ?? null;
	}

	function title(index: number): string {
		return run.twoTiers ? `Tier ${index + 1}` : 'Source files';
	}
</script>

{#snippet status(tier: TierSlot)}
	{#if tier.parse === 'running'}
		<Badge variant="secondary"><Loader2Icon class="animate-spin" />Parsing…</Badge>
	{:else if tier.parse === 'done'}
		<Badge variant="secondary"><CheckIcon />Parsed</Badge>
	{:else if tier.parse === 'failed'}
		<Badge variant="destructive">Failed</Badge>
	{/if}
{/snippet}

<main class="mx-auto max-w-4xl space-y-6 p-6 pb-24">
	<div class="space-y-2">
		<h1 class="text-2xl font-bold tracking-tight">Parse assessment paper</h1>
		<p class="text-sm text-muted-foreground">
			Attach an assessment paper and/or its markscheme PDF, then Run. For a tiered paper, add a
			second tier: each tier is parsed on its own, then the two are compared for common questions.
		</p>
	</div>

	<Separator />

	<div class="grid gap-6 lg:grid-cols-2">
		{#each run.tiers as tier, i (tier)}
			<Card.Root>
				<Card.Header>
					<Card.Title>{title(i)}</Card.Title>
					<Card.Description>
						{#if tier.parse === 'done'}
							{tier.tierName ?? 'No tier printed'} · {tier.entries} entries
						{:else}
							One or both PDFs, each up to 15&nbsp;MB — paper and/or markscheme.
						{/if}
					</Card.Description>
					<Card.Action>
						{#if i === 1 && run.phase === 'form'}
							<Button variant="ghost" size="sm" onclick={run.removeTier}>Remove tier</Button>
						{:else}
							{@render status(tier)}
						{/if}
					</Card.Action>
				</Card.Header>
				<Card.Content class="space-y-5">
					<PdfPicker
						id="a-paper-{i}"
						label="Assessment paper (PDF)"
						filename={tier.paper}
						error={tier.paperError}
						needed={needed(i, 'paper')}
						disabled={!run.canEditFiles(i)}
						onpick={(name) => run.setFile(i, 'paper', name)}
					/>
					<PdfPicker
						id="a-ms-{i}"
						label="Markscheme (PDF)"
						filename={tier.markscheme}
						error={tier.markschemeError}
						needed={needed(i, 'markscheme')}
						disabled={!run.canEditFiles(i)}
						onpick={(name) => run.setFile(i, 'markscheme', name)}
					/>
					{#if tier.parse === 'failed' && tier.error}
						<Alert.Root variant="destructive">
							<Alert.Title>{title(i)} failed ({tier.error.code})</Alert.Title>
							<Alert.Description>
								<p>{tier.error.message}</p>
								<p>
									{tier.error.retryable
										? 'This looks temporary.'
										: 'Replace the file above, then retry.'}
									{run.twoTiers ? `Tier ${i === 0 ? 2 : 1} is kept.` : ''}
								</p>
								<Button
									class="mt-2"
									size="sm"
									variant="outline"
									disabled={busy}
									onclick={() => run.retryTier(i)}>Retry {title(i)}</Button
								>
							</Alert.Description>
						</Alert.Root>
					{/if}
				</Card.Content>
			</Card.Root>
		{/each}

		{#if !run.twoTiers}
			<Card.Root class="overflow-visible">
				<Card.Header>
					<Card.Title>Options</Card.Title>
					<Card.Description
						>Pick a curated model with native PDF parsing, or choose Custom for any OpenRouter model
						id.</Card.Description
					>
				</Card.Header>
				<Card.Content><OptionsFields disabled={run.phase !== 'form'} /></Card.Content>
			</Card.Root>
		{/if}
	</div>

	{#if !run.twoTiers && run.phase === 'form'}
		<Button variant="outline" onclick={run.addTier}>
			<PlusIcon />Add a second tier
		</Button>
		<span class="ml-2 text-sm text-muted-foreground"
			>For a tiered paper, e.g. Foundation and Higher.</span
		>
	{/if}

	{#if run.twoTiers}
		<div class="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm" aria-live="polite">
			<LinkIcon class="size-4 text-muted-foreground" />
			<span class="font-medium">Common questions</span>
			<span class="text-muted-foreground">
				{#if run.match === 'idle'}
					Found once both tiers are parsed.
				{:else if run.match === 'running'}
					<Loader2Icon class="inline size-4 animate-spin" /> Comparing the two tiers…
				{:else if run.match === 'done'}
					{run.pairs} proposed, checked at breakdown review.
				{:else if run.match === 'skipped'}
					None proposed: pair them by hand at breakdown review.
				{:else if run.match === 'failed' && run.phase === 'done'}
					None proposed.
				{:else}
					Couldn't compare the tiers.
				{/if}
			</span>
		</div>

		<Card.Root class="overflow-visible">
			<Card.Header>
				<Card.Title>Options</Card.Title>
				<Card.Description>Used for both tiers.</Card.Description>
			</Card.Header>
			<Card.Content><OptionsFields disabled={run.phase !== 'form'} /></Card.Content>
		</Card.Root>
	{/if}

	{#if run.phase === 'form' || busy}
		<div>
			<Button type="button" size="lg" disabled={!run.canRun} onclick={run.run}>
				{#if busy}
					<Loader2Icon class="animate-spin" />Running…
				{:else}
					Run
				{/if}
			</Button>
		</div>
	{/if}

	{#if run.fatal}
		<FatalAlert fatal={run.fatal} retryable={false} />
	{/if}

	{#if run.phase === 'stopped' && run.match === 'failed' && run.matchError}
		<Alert.Root variant="destructive" aria-live="polite">
			<Alert.Title>Couldn't find common questions ({run.matchError.code})</Alert.Title>
			<Alert.Description>
				<p>{run.matchError.message} Both tiers' breakdowns are kept.</p>
				<div class="mt-2 flex gap-2">
					<Button size="sm" onclick={run.tryMatchAgain}>Try again</Button>
					<Button size="sm" variant="outline" onclick={run.continueWithoutPairs}
						>Continue without proposed pairs</Button
					>
				</div>
			</Alert.Description>
		</Alert.Root>
	{/if}

	{#if run.phase === 'done'}
		<Card.Root aria-live="polite">
			<Card.Header>
				<Card.Title>{run.twoTiers ? 'Breakdowns stored' : 'Breakdown stored'}</Card.Title>
				<Card.Description>
					{#each run.tiers as tier, i (tier)}
						{i > 0 ? ' · ' : ''}{tier.tierName ?? `Tier ${i + 1}`}: {tier.entries} entries
					{/each}
					{#if run.twoTiers}
						· {run.pairs} common questions proposed
					{/if}
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-3">
				{#if run.notice}
					<Alert.Root>
						<Alert.Title>No common questions proposed</Alert.Title>
						<Alert.Description
							>{run.notice} Pair them by hand at breakdown review.</Alert.Description
						>
					</Alert.Root>
				{/if}
				<Button onclick={() => toast.info('Prototype: would open the breakdown review')}
					>Open breakdown</Button
				>
			</Card.Content>
		</Card.Root>
	{/if}
</main>
