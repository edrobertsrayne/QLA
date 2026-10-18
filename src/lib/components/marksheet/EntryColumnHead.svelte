<!--
	One entry's column head: its label and available marks, and the popover that
	says what the column is.
-->
<script lang="ts">
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import * as Popover from '$lib/components/ui/popover';
	import * as Table from '$lib/components/ui/table';
	import { entryName, warningsForEntry } from '$lib/marksheet/breakdown.js';
	import type { BreakdownEntry } from '$lib/marksheet/document.js';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import { cn } from '$lib/utils.js';

	let { entry, active }: { entry: BreakdownEntry; active: boolean } = $props();

	const store = marksheetStore();
	const warnings = $derived(store.warnings);
</script>

<Table.Head
	role="columnheader"
	class={cn('border-l p-0', active ? 'bg-primary/15' : 'bg-muted/30')}
>
	<Popover.Root>
		<Popover.Trigger>
			{#snippet child({ props })}
				<button
					{...props}
					type="button"
					class="flex w-full flex-col items-center px-0.5 font-semibold hover:underline"
					aria-label={`Details for ${entryName(entry)}`}
					title={`${entryName(entry)} — what this column is`}
				>
					<span class="w-full truncate text-xs">{entry.label}</span>
					<span class="text-[11px] font-normal text-muted-foreground">
						/{entry.marks ?? '?'}
					</span>
				</button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-72 text-xs">
			<p class="font-medium">{entryName(entry)} — {entry.summary}</p>
			<dl class="mt-1 space-y-0.5 text-muted-foreground">
				<div>
					<dt class="inline font-medium text-foreground">Available marks:</dt>
					<dd class="inline">{entry.marks ?? 'unknown'}</dd>
				</div>
				<div>
					<dt class="inline font-medium text-foreground">Specification point:</dt>
					<dd class="inline">{entry.specPoint ?? '—'}</dd>
				</div>
				<div>
					<dt class="inline font-medium text-foreground">Assessment objective:</dt>
					<dd class="inline">{entry.ao ?? '—'}</dd>
				</div>
				<div>
					<dt class="inline font-medium text-foreground">Command word:</dt>
					<dd class="inline">{entry.commandWord ?? '—'}</dd>
				</div>
			</dl>
			{#each warningsForEntry(warnings, entry.id) as warning (warning.code + warning.message)}
				<p class="mt-1 text-amber-800 dark:text-amber-300">
					<TriangleAlertIcon class="mr-1 inline size-3" /><strong>{warning.code}</strong>:
					{warning.message}
				</p>
			{/each}
		</Popover.Content>
	</Popover.Root>
</Table.Head>
