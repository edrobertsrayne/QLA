<!--
	The row of bands over the entry columns: one label per question, flagged
	where the parse could not read its number, and highlighting the band the
	cursor is in.
-->
<script lang="ts">
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import * as Popover from '$lib/components/ui/popover';
	import * as Table from '$lib/components/ui/table';
	import {
		bandName,
		fallbackExplanation,
		isFallbackBand,
		type QuestionBand
	} from '$lib/marksheet/breakdown.js';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import { cn } from '$lib/utils.js';
	import { BAND_LABEL_PIN, FROZEN_PROGRESS, NAME_COLUMN, PROGRESS_PIN } from './grid-layout.js';

	let {
		cursorEntryId,
		onJump
	}: { cursorEntryId: string | null; onJump: (band: QuestionBand) => void } = $props();

	const store = marksheetStore();
	const bands = $derived(store.questionBands);
	const warnings = $derived(store.warnings);
	/** The band the cursor's column belongs to, which the band row highlights. */
	const cursorBand = $derived(
		bands.find((band) => band.entries.some((entry) => entry.id === cursorEntryId)) ?? null
	);
</script>

<Table.Row role="row" class="bg-muted/50 hover:bg-muted/50">
	<Table.Head class={NAME_COLUMN} />
	<Table.Head class={FROZEN_PROGRESS} style={PROGRESS_PIN} />
	{#each bands as band (band.entries[0].id)}
		{@const fallback = isFallbackBand(band, warnings)}
		<Table.Head
			colspan={band.entries.length}
			role="columnheader"
			class={cn(
				'p-0.5 text-xs',
				cursorBand === band ? 'bg-primary/15' : 'bg-muted/50',
				fallback && 'text-amber-700 dark:text-amber-300'
			)}
		>
			<span class="sticky inline-flex items-center gap-1" style={BAND_LABEL_PIN} data-band-label>
				<button
					type="button"
					class="font-semibold hover:underline"
					aria-label={`Jump to question ${bandName(band)}`}
					onclick={() => onJump(band)}
				>
					{band.questionNumber === '' ? bandName(band) : `Q${bandName(band)}`}
				</button>
				{#if fallback}
					<Popover.Root>
						<Popover.Trigger
							class="text-amber-600 dark:text-amber-400"
							aria-label={`Why question ${bandName(band)} is flagged`}
						>
							<TriangleAlertIcon class="size-3.5" />
						</Popover.Trigger>
						<Popover.Content class="w-80 text-xs">
							<p class="font-medium">Question number not read from the paper.</p>
							<p class="mt-1 text-muted-foreground">
								{fallbackExplanation(band, warnings)}
							</p>
						</Popover.Content>
					</Popover.Root>
				{/if}
			</span>
		</Table.Head>
	{/each}
</Table.Row>
