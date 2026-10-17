<script lang="ts">
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Input } from '$lib/components/ui/input';
	import * as Table from '$lib/components/ui/table';
	import NewUploadDialog from '$lib/components/marksheet/NewUploadDialog.svelte';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import { totalMarks } from '$lib/marksheet/document.js';

	// The route's load guard has read storage by the time this renders.
	const store = marksheetStore();

	const entries = $derived(store.document?.breakdown.entries ?? []);
	const warnings = $derived(store.document?.breakdown.warnings ?? []);
	const usage = $derived(store.runUsage);
	const marks = $derived(totalMarks(entries));
	const labelById = $derived(new Map(entries.map((entry) => [entry.id, entry.label] as const)));

	function onLabelInput(event: Event): void {
		store.setPaperLabel((event.target as HTMLInputElement).value);
	}
</script>

<main class="mx-auto max-w-5xl space-y-6 p-6">
	<header class="flex items-start justify-between gap-4">
		<div class="space-y-2">
			<Input
				aria-label="Paper label"
				class="h-auto border-transparent bg-transparent px-1 text-2xl font-bold tracking-tight shadow-none hover:border-input"
				placeholder="Name this paper"
				value={store.document?.paper.label ?? ''}
				oninput={onLabelInput}
			/>
			<p class="px-1 text-sm text-muted-foreground">
				{entries.length} entries · {marks} marks{#if usage}
					· this run: {usage.totalTokens} tokens · ${usage.estCost.toFixed(4)}{/if}
			</p>
		</div>
		<NewUploadDialog />
	</header>

	{#if warnings.length > 0}
		<Alert data-testid="warning-panel">
			<TriangleAlertIcon />
			<AlertTitle>
				{warnings.length} warning{warnings.length === 1 ? '' : 's'} from the parse
			</AlertTitle>
			<AlertDescription>
				<ul class="list-disc pl-5">
					{#each warnings as warning, index (warning.code + '::' + index)}
						<li>
							<strong>{warning.code}</strong
							>{#if warning.questionId && labelById.get(warning.questionId)}
								{` (${labelById.get(warning.questionId)})`}{/if}: {warning.message}
						</li>
					{/each}
				</ul>
			</AlertDescription>
		</Alert>
	{/if}

	<div class="overflow-hidden rounded-xl border">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Q</Table.Head>
					<Table.Head>In question</Table.Head>
					<Table.Head>Summary</Table.Head>
					<Table.Head class="text-right">Marks</Table.Head>
					<Table.Head>Spec point</Table.Head>
					<Table.Head>AO</Table.Head>
					<Table.Head>Command</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each entries as entry (entry.id)}
					<Table.Row>
						<Table.Cell class="font-medium whitespace-nowrap">{entry.label}</Table.Cell>
						<Table.Cell class="whitespace-nowrap">{entry.questionNumber}</Table.Cell>
						<Table.Cell class="max-w-56 truncate" title={entry.summary}>
							{entry.summary}
						</Table.Cell>
						<Table.Cell class="text-right">{entry.marks ?? '—'}</Table.Cell>
						<Table.Cell>{entry.specPoint ?? '—'}</Table.Cell>
						<Table.Cell class="whitespace-nowrap">{entry.ao ?? '—'}</Table.Cell>
						<Table.Cell>{entry.commandWord ?? '—'}</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>

	{#if entries.length === 0}
		<p class="text-sm text-muted-foreground">
			The parse returned no entries. Start a new upload to try another paper.
		</p>
	{/if}
</main>
