<!--
	PROTOTYPE (#159) — the class's topic rows as one table: topic name and code,
	facility on the track with its band, the coverage the figure rests on, and
	the questions behind every row, openable. The caption states the pooling
	rules in force so a teacher reads what was counted before the number.
-->
<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { facilityPercent, type RagBand } from '$lib/marksheet/analysis.js';
	import { count } from '$lib/prose.js';
	import { cn } from '$lib/utils.js';
	import { BAND_TEXT } from '$lib/components/marksheet/analysis-style.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { topicPrototype } from './prototype-state.svelte.js';
	import type { TopicRow } from './topic-rows.js';
	import TopicTrack from './TopicTrack.svelte';

	interface Props {
		/** The rows, ordered as the rules leave them. */
		rows: TopicRow[];
		/** The list's name for screen readers and the caption. */
		label: string;
	}

	let { rows, label }: Props = $props();

	const proto = topicPrototype();

	/** What the figures were counted over, in the words the rules mean. */
	const caption = $derived.by(() => {
		const parts = ['Marks gained out of marks available across every question carrying the topic'];
		parts.push(
			proto.rules.multiSpec === 'each'
				? 'a question carrying several spec points counts toward each'
				: 'a question carrying several spec points splits its marks between them'
		);
		if (proto.rules.aoRows !== 'none')
			parts.push(
				proto.rules.aoRows === 'mixed'
					? 'objectives in the same list'
					: 'objectives a separate list'
			);
		parts.push(
			proto.rules.tierScope === 'pooled'
				? 'topics both tiers carry also show both tiers pooled'
				: 'each tier stands alone'
		);
		parts.push(
			proto.rules.order === 'weakest'
				? 'weakest first, unscored last'
				: 'paper order, sorted as asked'
		);
		return `${parts.join('; ')}.`;
	});

	/** The rows a click opens: one key per row, `kind:code`. */
	let open = $state<string[]>([]);
	function toggle(key: string): void {
		open = open.includes(key) ? open.filter((kept) => kept !== key) : [...open, key];
	}

	let shownSort = $state<string>('paper');
	function chooseSort(next: string | string[] | undefined): void {
		if (next === 'paper' || next === 'weakest') {
			proto.sort = next;
			shownSort = next;
			return;
		}
		shownSort = proto.sort;
	}
</script>

<div class="space-y-2">
	<div class="flex flex-wrap items-center gap-3">
		<p class="text-xs text-muted-foreground">{caption}</p>
		{#if proto.rules.order === 'paper-switch'}
			<span class="ml-auto text-sm text-muted-foreground">Sort</span>
			<ToggleGroup.Root
				type="single"
				variant="outline"
				size="sm"
				aria-label={`Sort ${label}`}
				bind:value={shownSort}
				onValueChange={chooseSort}
			>
				<ToggleGroup.Item value="paper" class="px-3">Paper order</ToggleGroup.Item>
				<ToggleGroup.Item value="weakest" class="px-3">Weakest first</ToggleGroup.Item>
			</ToggleGroup.Root>
		{/if}
	</div>

	<div class="overflow-hidden rounded-lg border" role="table" aria-label={label}>
		<div
			class="grid grid-cols-[minmax(0,1fr)_minmax(8rem,1fr)_5.5rem] items-center gap-3 border-b px-3 py-1.5 text-xs text-muted-foreground"
			role="row"
		>
			<span role="columnheader">Topic</span>
			<div class="relative h-4" role="columnheader">
				<span class="sr-only">Facility</span>
				<span class="absolute left-0 tabular-nums">0%</span>
				<span class="absolute right-0 tabular-nums">100%</span>
			</div>
			<span class="text-right" role="columnheader">Facility</span>
		</div>

		{#each rows as row (`${row.kind}:${row.code}`)}
			{@const key = `${row.kind}:${row.code}`}
			{@const isOpen = open.includes(key)}
			<button
				type="button"
				class="grid w-full grid-cols-[minmax(0,1fr)_minmax(8rem,1fr)_5.5rem] items-center gap-3 border-b px-3 py-2 text-left last:border-0 hover:bg-muted/50"
				role="row"
				aria-expanded={isOpen}
				onclick={() => toggle(key)}
			>
				<div class="min-w-0" role="cell">
					<div class="flex items-center gap-1.5">
						<ChevronRightIcon
							class={cn('size-3.5 shrink-0 text-muted-foreground', isOpen && 'rotate-90')}
						/>
						{#if row.kind === 'ao'}
							<span class="truncate text-sm font-semibold">{row.code}</span>
						{:else}
							<span class="truncate text-sm font-semibold">{row.name ?? '—'}</span>
							<span
								class="shrink-0 rounded border px-1 text-[11px] tabular-nums text-muted-foreground"
							>
								{row.code}
							</span>
						{/if}
						{#if row.kind === 'specification' && row.name === null}
							<span class="shrink-0 text-[11px] text-muted-foreground">no topic name yet</span>
						{/if}
						<span class="shrink-0 text-[11px] text-muted-foreground">
							{count(row.sources.length, 'question')}
						</span>
						{#if row.pooled !== null && row.pooled.facility !== null}
							<span class="shrink-0 text-[11px] text-muted-foreground">
								both tiers {facilityPercent(row.pooled.facility)}%
							</span>
						{/if}
					</div>
					{#if row.description !== null}
						<div class="truncate text-xs text-muted-foreground" title={row.description}>
							{row.description}
						</div>
					{/if}
				</div>

				<div role="cell">
					<TopicTrack
						facility={row.facility}
						pooled={row.pooled?.facility ?? null}
						partMarked={row.partMarked}
						empty="Not scored"
					/>
				</div>

				<div class="text-right tabular-nums" role="cell">
					{#if row.facility !== null && row.band !== null}
						<span
							class={cn(
								'font-semibold',
								BAND_TEXT[row.band as RagBand],
								row.partMarked && 'italic'
							)}
						>
							{facilityPercent(row.facility)}%
						</span>
					{:else}
						<span class="text-xs text-muted-foreground">Not scored</span>
					{/if}
					<div
						class={cn(
							'text-[11px] text-muted-foreground',
							row.partMarked && 'text-amber-700 italic dark:text-amber-300'
						)}
					>
						{row.gained}/{row.available} marks
						{row.partMarked ? ' · part-marked' : ''}
					</div>
				</div>
			</button>

			{#if isOpen}
				<div class="border-b bg-muted/30 px-3 py-2 last:border-0">
					<p class="mb-1 text-xs font-medium text-muted-foreground">Questions behind this row</p>
					{#each row.sources as source (source.entryId)}
						<div
							class="grid grid-cols-[minmax(0,1fr)_7rem] items-baseline gap-3 py-0.5 text-xs"
							role="row"
						>
							<div class="min-w-0" role="cell">
								<span class="font-semibold">{source.label}</span>
								<span class="text-muted-foreground"> · {source.summary}</span>
								{#if source.splitFrom !== null}
									<span class="text-muted-foreground">
										· split from {source.splitFrom.gained}/{source.splitFrom.available} marks</span
									>
								{/if}
							</div>
							<div class="text-right tabular-nums text-muted-foreground" role="cell">
								{source.gained}/{source.available}
								{#if source.facility !== null}
									· {facilityPercent(source.facility)}%
								{:else}
									· not scored
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{:else}
			<p class="px-3 py-2 text-sm text-muted-foreground">No topics carry this assessment.</p>
		{/each}
	</div>
</div>
