<script lang="ts">
	import * as Accordion from '$lib/components/ui/accordion';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Separator } from '$lib/components/ui/separator';
	import * as Table from '$lib/components/ui/table';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import type { RunResult } from './types.js';

	interface Props {
		result: RunResult;
		breakdownJson: string;
		running: boolean;
		onCopy: () => void;
		onDownload: () => void;
	}

	let { result, breakdownJson, running, onCopy, onDownload }: Props = $props();

	const copyDisabled = $derived(running || breakdownJson === '');
	const knownMarks = $derived(
		result.breakdown.questions.reduce(
			(sum, q) => sum + (typeof q.marks === 'number' ? q.marks : 0),
			0
		)
	);
	const unknownMarks = $derived(result.breakdown.questions.filter((q) => q.marks === null).length);
</script>

<Card.Root aria-live="polite">
	<Card.Header>
		<Card.Title>Breakdown</Card.Title>
		<Card.Description>
			{result.breakdown.questions.length} questions · {knownMarks} marks{#if unknownMarks > 0}
				{` (+ ${unknownMarks} unknown)`}{/if}
		</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-4">
		<div class="flex flex-wrap gap-2">
			<Badge variant="outline">
				{result.usage.totalTokens} tokens · ${result.usage.estCost.toFixed(4)}
			</Badge>
			{#if result.warnings.length > 0}
				<Badge variant="destructive">
					{result.warnings.length} warning{result.warnings.length === 1 ? '' : 's'}
				</Badge>
			{:else}
				<Badge>No warnings</Badge>
			{/if}
		</div>

		{#if result.warnings.length > 0}
			<Alert data-testid="warning-panel">
				<TriangleAlertIcon />
				<AlertTitle>
					{result.warnings.length} warning{result.warnings.length === 1 ? '' : 's'} — breakdown returned
					intact
				</AlertTitle>
				<AlertDescription>
					<ul class="list-disc pl-5">
						{#each result.warnings as warning (warning.code + warning.questionId + warning.message)}
							<li>
								<strong>{warning.code}</strong>{warning.questionId
									? ` (Q${warning.questionId})`
									: ''}: {warning.message}
							</li>
						{/each}
					</ul>
				</AlertDescription>
			</Alert>
		{/if}

		<Separator />

		<div class="overflow-hidden rounded-xl border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Q</Table.Head>
						<Table.Head>Summary</Table.Head>
						<Table.Head class="text-right">Marks</Table.Head>
						<Table.Head>Spec point</Table.Head>
						<Table.Head>AO</Table.Head>
						<Table.Head>Command</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each result.breakdown.questions as question (question.id)}
						<Table.Row>
							<Table.Cell class="font-medium whitespace-nowrap">{question.id}</Table.Cell>
							<Table.Cell class="max-w-56 truncate" title={question.summary}>
								{question.summary}
							</Table.Cell>
							<Table.Cell class="text-right">{question.marks ?? '—'}</Table.Cell>
							<Table.Cell>{question.specPoint ?? '—'}</Table.Cell>
							<Table.Cell class="whitespace-nowrap">{question.ao ?? '—'}</Table.Cell>
							<Table.Cell>{question.commandWord ?? '—'}</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>

		<div class="flex flex-wrap gap-2">
			<Button variant="outline" type="button" disabled={copyDisabled} onclick={onCopy}>
				Copy JSON
			</Button>
			<Button variant="outline" type="button" disabled={copyDisabled} onclick={onDownload}>
				Download JSON
			</Button>
		</div>

		<Accordion.Root type="single">
			<Accordion.Item value="raw-json">
				<Accordion.Trigger>Raw JSON</Accordion.Trigger>
				<Accordion.Content>
					<pre
						class="max-h-[480px] overflow-auto rounded-lg border bg-muted/50 p-4 text-xs"
						data-testid="breakdown-viewer">{breakdownJson}</pre>
				</Accordion.Content>
			</Accordion.Item>
		</Accordion.Root>
	</Card.Content>
</Card.Root>
