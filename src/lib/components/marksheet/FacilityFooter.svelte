<!--
	The figures under the columns they belong to: one per entry, on its band's
	tint, so a weak question is visible while marks are entered. Part-marked ones
	are drawn as the estimate they are, with their coverage in the row beneath.
-->
<script lang="ts">
	import * as Table from '$lib/components/ui/table';
	import { facilityDescription, facilityPercent, type RagBand } from '$lib/marksheet/analysis.js';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import { cn } from '$lib/utils.js';
	import { FROZEN_PROGRESS, NAME_COLUMN, PROGRESS_PIN } from './grid-layout.js';

	let { onViewAnalysis }: { onViewAnalysis: (entryId: string) => void } = $props();

	const store = marksheetStore();
	const analysis = $derived(store.analysis);

	/**
	 * What a facility figure is tinted with, per band. A mark cell is a fraction
	 * of a 40&nbsp;px column, so it takes a heavier fill than the analysis view's
	 * full-width rows to read as the same colour.
	 */
	const FACILITY_TINT: Record<RagBand, string> = {
		red: 'bg-red-500/25',
		amber: 'bg-amber-400/30',
		green: 'bg-emerald-500/20'
	};
</script>

<Table.Footer>
	<Table.Row class="hover:bg-transparent">
		<Table.Cell class={cn(NAME_COLUMN, 'px-1.5 py-1 text-xs font-semibold')}>Facility</Table.Cell>
		<Table.Cell class={FROZEN_PROGRESS} style={PROGRESS_PIN} />
		{#each analysis.entries as row (row.entry.id)}
			<Table.Cell
				class="border-l p-0 text-center"
				aria-invalid={row.overMax > 0 ? 'true' : undefined}
			>
				<!-- An entry with no figure opens the analysis just as a scored one
				     does: it is the entry a teacher most often needs to look into,
				     and the cell still says which one it is. -->
				<button
					type="button"
					data-testid="facility-cell"
					data-entry-id={row.entry.id}
					title={facilityDescription(row)}
					class={cn(
						'my-0.5 w-[calc(100%-4px)] rounded-sm py-0.5 hover:ring-2 hover:ring-primary',
						row.band !== null
							? [
									'text-[11px] font-semibold tabular-nums',
									FACILITY_TINT[row.band],
									row.coverage.partMarked &&
										'italic outline-1 -outline-offset-2 outline-dashed outline-foreground',
									row.overMax > 0 && 'text-destructive'
								]
							: 'text-xs text-muted-foreground'
					)}
					onclick={() => onViewAnalysis(row.entry.id)}
				>
					{row.facility === null ? '—' : `${facilityPercent(row.facility)}%`}
				</button>
			</Table.Cell>
		{/each}
	</Table.Row>
	<Table.Row class="hover:bg-transparent">
		<Table.Cell class={cn(NAME_COLUMN, 'px-1.5 text-[11px] text-muted-foreground')}>
			Marked
		</Table.Cell>
		<Table.Cell class={FROZEN_PROGRESS} style={PROGRESS_PIN} />
		{#each analysis.entries as row (row.entry.id)}
			<Table.Cell
				data-testid="coverage-cell"
				data-entry-id={row.entry.id}
				class="border-l text-center text-[10px] text-amber-700 tabular-nums dark:text-amber-300"
			>
				{row.coverage.partMarked ? `${row.coverage.marked}/${row.coverage.of}` : ''}
			</Table.Cell>
		{/each}
	</Table.Row>
</Table.Footer>
