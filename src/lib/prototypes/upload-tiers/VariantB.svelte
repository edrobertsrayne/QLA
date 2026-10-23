<!--
	PROTOTYPE — Variant B "Matrix": one Source files card laid out as a grid, inputs
	down the side and tiers across the top. "Same inputs" reads straight off the rows;
	the run fills in status rows under the files, matching spans both columns.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import * as Alert from '$lib/components/ui/alert';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import FatalAlert from '$lib/components/parse/FatalAlert.svelte';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import CheckIcon from '@lucide/svelte/icons/check';
	import OctagonXIcon from '@lucide/svelte/icons/octagon-x';
	import { toast } from 'svelte-sonner';
	import PdfPicker from './PdfPicker.svelte';
	import OptionsFields from './OptionsFields.svelte';
	import { uploadRun } from './run.svelte.js';

	const run = uploadRun();
	const busy = $derived(run.phase === 'running');
	const started = $derived(run.tiers.some((t) => t.parse !== 'idle'));

	const ROWS = [
		{ kind: 'paper', label: 'Assessment paper' },
		{ kind: 'markscheme', label: 'Markscheme' }
	] as const;

	function needed(index: number, kind: 'paper' | 'markscheme'): string | null {
		return run.mismatch.find((m) => m.tier === index && m.kind === kind) ? 'Needed' : null;
	}
</script>

<main class="mx-auto max-w-4xl space-y-6 p-6 pb-24">
	<div class="space-y-2">
		<h1 class="text-2xl font-bold tracking-tight">Parse assessment paper</h1>
		<p class="text-sm text-muted-foreground">
			Attach an assessment paper and/or its markscheme PDF, then Run. A tiered paper takes a second
			column: both tiers need the same inputs.
		</p>
	</div>

	<Separator />

	<Card.Root>
		<Card.Header>
			<Card.Title>Source files</Card.Title>
			<Card.Description>Each PDF up to 15&nbsp;MB.</Card.Description>
		</Card.Header>
		<Card.Content>
			<Table.Root class="table-fixed">
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-40"></Table.Head>
						{#each run.tiers as tier, i (tier)}
							<Table.Head>
								<div class="flex items-center justify-between">
									<span>{run.twoTiers ? `Tier ${i + 1}` : 'Files'}</span>
									{#if i === 1 && run.phase === 'form'}
										<Button
											variant="ghost"
											size="icon"
											class="size-7"
											aria-label="Remove Tier 2"
											onclick={run.removeTier}><XIcon /></Button
										>
									{/if}
								</div>
							</Table.Head>
						{/each}
						{#if !run.twoTiers}
							<Table.Head class="w-44 text-right">
								{#if run.phase === 'form'}
									<Button variant="ghost" size="sm" onclick={run.addTier}
										><PlusIcon />Add a tier</Button
									>
								{/if}
							</Table.Head>
						{/if}
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each ROWS as row (row.kind)}
						<Table.Row class="hover:bg-transparent">
							<Table.Cell class="font-medium">{row.label}</Table.Cell>
							{#each run.tiers as tier, i (tier)}
								<Table.Cell class="whitespace-normal">
									<PdfPicker
										id="b-{row.kind}-{i}"
										filename={tier[row.kind]}
										error={row.kind === 'paper' ? tier.paperError : tier.markschemeError}
										needed={needed(i, row.kind)}
										disabled={!run.canEditFiles(i)}
										onpick={(name) => run.setFile(i, row.kind, name)}
									/>
								</Table.Cell>
							{/each}
							{#if !run.twoTiers}<Table.Cell></Table.Cell>{/if}
						</Table.Row>
					{/each}

					{#if started}
						<Table.Row class="hover:bg-transparent">
							<Table.Cell class="font-medium">Parse</Table.Cell>
							{#each run.tiers as tier, i (tier)}
								<Table.Cell class="align-top whitespace-normal" aria-live="polite">
									{#if tier.parse === 'running'}
										<span class="flex items-center gap-2 text-muted-foreground"
											><Loader2Icon class="size-4 animate-spin" />Parsing…</span
										>
									{:else if tier.parse === 'done'}
										<span class="flex items-center gap-2"
											><CheckIcon class="size-4 text-emerald-600" />{tier.tierName ??
												'No tier printed'} · {tier.entries} entries</span
										>
									{:else if tier.parse === 'failed' && tier.error}
										<div class="space-y-1.5 text-destructive">
											<p class="flex items-center gap-2 font-medium">
												<OctagonXIcon class="size-4" />{tier.error.code}
											</p>
											<p class="text-sm">
												{tier.error.message}
												{tier.error.retryable ? '' : 'Replace the file, then retry.'}
											</p>
											<Button
												size="sm"
												variant="outline"
												disabled={busy}
												onclick={() => run.retryTier(i)}>Retry</Button
											>
										</div>
									{/if}
								</Table.Cell>
							{/each}
							{#if !run.twoTiers}<Table.Cell></Table.Cell>{/if}
						</Table.Row>
					{/if}

					{#if run.twoTiers && run.match !== 'idle'}
						<Table.Row class="hover:bg-transparent">
							<Table.Cell class="font-medium">Common questions</Table.Cell>
							<Table.Cell colspan={2} class="whitespace-normal" aria-live="polite">
								{#if run.match === 'running'}
									<span class="flex items-center gap-2 text-muted-foreground"
										><Loader2Icon class="size-4 animate-spin" />Comparing Tier 1 with Tier 2…</span
									>
								{:else if run.match === 'done'}
									<span class="flex items-center gap-2"
										><CheckIcon class="size-4 text-emerald-600" />{run.pairs} pairs proposed</span
									>
								{:else if run.match === 'skipped'}
									<span class="text-muted-foreground">Skipped: pair them by hand at review.</span>
								{:else if run.phase === 'done' && run.matchError}
									<span class="text-muted-foreground"
										>None proposed ({run.matchError.code}): {run.notice}</span
									>
								{:else if run.matchError}
									<div class="space-y-1.5">
										<p class="text-destructive">
											Couldn't compare the tiers ({run.matchError.code}). Both breakdowns are kept.
										</p>
										<div class="flex gap-2">
											<Button size="sm" onclick={run.tryMatchAgain}>Try again</Button>
											<Button size="sm" variant="outline" onclick={run.continueWithoutPairs}
												>Continue without proposed pairs</Button
											>
										</div>
									</div>
								{/if}
							</Table.Cell>
						</Table.Row>
					{/if}
				</Table.Body>
			</Table.Root>
			{#if run.mismatch.length > 0}
				<p class="mt-3 text-sm text-amber-700 dark:text-amber-400">
					Both tiers need the same inputs. {run.mismatch.map((m) => m.message).join(' ')}
				</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root class="overflow-visible">
		<Card.Header>
			<Card.Title>Options</Card.Title>
			<Card.Description>
				{run.twoTiers
					? 'One model and one specification for both tiers.'
					: 'Pick a curated model with native PDF parsing, or choose Custom for any OpenRouter model id.'}
			</Card.Description>
		</Card.Header>
		<Card.Content><OptionsFields disabled={run.phase !== 'form'} /></Card.Content>
	</Card.Root>

	<div class="flex items-center gap-4">
		{#if run.phase === 'done'}
			<Button size="lg" onclick={() => toast.info('Prototype: would open the breakdown review')}
				>Open breakdown</Button
			>
			{#if run.notice}
				<span class="text-sm text-muted-foreground"
					>No common questions were proposed — pair them by hand at review.</span
				>
			{/if}
		{:else}
			<Button type="button" size="lg" disabled={!run.canRun} onclick={run.run}>
				{#if busy}
					<Loader2Icon class="animate-spin" />Running…
				{:else}
					Run
				{/if}
			</Button>
		{/if}
	</div>

	{#if run.fatal}
		<FatalAlert fatal={run.fatal} retryable={false} />
	{/if}

	{#if run.phase === 'stopped' && run.tiers.some((t) => t.parse === 'failed')}
		<Alert.Root>
			<Alert.Description
				>The run stopped before comparing the tiers. Retry the failed tier to carry on.</Alert.Description
			>
		</Alert.Root>
	{/if}
</main>
