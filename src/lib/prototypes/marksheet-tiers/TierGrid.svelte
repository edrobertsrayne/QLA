<!--
	PROTOTYPE (#114) — one tier's marksheet grid: that tier's entries across the top,
	the given students down the side, its own Total | Grade | To next and facility
	footer. Mark cells are plain inputs: the grid's real keyboard model is not in question.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import UserXIcon from '@lucide/svelte/icons/user-x';
	import { toast } from 'svelte-sonner';
	import { cn } from '$lib/utils.js';
	import { facilityTint, tieredSheet, type Student, type TierIndex } from './sheet.svelte.js';

	let {
		tier,
		students,
		nameExtra,
		emptyText = 'No students on this tier yet.'
	}: {
		tier: TierIndex;
		students: Student[];
		nameExtra?: Snippet<[Student]>;
		emptyText?: string;
	} = $props();

	const sheet = tieredSheet();
	const entries = $derived(sheet.tiers[tier].entries);
	const bands = $derived(sheet.bands(tier));
	const facility = $derived(sheet.facility(tier));
	const hasGrades = $derived(sheet.tiers[tier].boundaries !== null);
	const endColumns = $derived(hasGrades ? 3 : 1);
</script>

<div class="relative overflow-x-auto rounded-xl border">
	<table class="w-fit table-fixed border-collapse text-sm">
		<colgroup>
			<col style="width: 11rem" />
			<col style="width: 4rem" />
			{#each entries as entry (entry.id)}
				<col style="width: 2.5rem" />
			{/each}
			<col style="width: 3rem" />
			{#if hasGrades}
				<col style="width: 3rem" />
				<col style="width: 5rem" />
			{/if}
		</colgroup>
		<thead>
			<tr class="border-b">
				<th class="sticky left-0 z-20 border-r bg-background"></th>
				<th class="sticky left-44 z-20 border-r bg-background"></th>
				{#each bands as band, i (band.questionNumber + i)}
					<th
						colspan={band.entries.length}
						class={cn(
							'border-l px-1 py-0.5 text-left text-xs font-medium',
							i % 2 === 1 && 'bg-muted/50'
						)}
					>
						Q{band.questionNumber}
					</th>
				{/each}
				<th colspan={endColumns} class="border-l-2"></th>
			</tr>
			<tr class="border-b">
				<th class="sticky left-0 z-20 border-r bg-background px-1.5 text-left text-xs">Student</th>
				<th class="sticky left-44 z-20 border-r bg-background px-1 text-xs">Progress</th>
				{#each entries as entry (entry.id)}
					<th
						class="border-l px-0 py-1 text-center text-[10px] leading-tight font-normal"
						title={entry.summary}
					>
						<div class="font-medium">{entry.label}</div>
						<div class="text-muted-foreground">/{entry.marks}</div>
					</th>
				{/each}
				<th class="border-l-2 px-1 text-center text-xs">Total</th>
				{#if hasGrades}
					<th class="px-1 text-center text-xs">Grade</th>
					<th class="px-1 text-center text-xs">To next</th>
				{/if}
			</tr>
		</thead>
		<tbody>
			{#each students as student (student.id)}
				{@const progress = sheet.progress(student)}
				{@const g = sheet.graded(student)}
				<tr
					class={cn('group border-b hover:bg-muted/30', student.absent && 'text-muted-foreground')}
				>
					<td class="sticky left-0 z-10 border-r bg-background px-1 py-0.5">
						<span class="flex items-center gap-1">
							<button
								type="button"
								class={cn(
									'shrink-0 rounded p-0.5',
									student.absent
										? 'text-destructive'
										: 'text-muted-foreground/40 hover:text-foreground'
								)}
								title={student.absent ? 'Absent — click to mark present' : 'Mark absent'}
								onclick={() => sheet.setAbsent(student.id, !student.absent)}
							>
								<UserXIcon class="size-3.5" />
							</button>
							<span class={cn('min-w-0 flex-1 truncate', student.absent && 'line-through')}>
								{sheet.studentName(student)}
							</span>
							{@render nameExtra?.(student)}
						</span>
					</td>
					<td
						class="sticky left-44 z-10 border-r bg-background px-1 text-center text-xs text-muted-foreground tabular-nums"
					>
						{student.absent ? 'absent' : progress ? `${progress.marked}/${progress.total}` : ''}
					</td>
					{#each entries as entry (entry.id)}
						{@const m = sheet.mark(student.id, entry.id)}
						<td class={cn('border-l p-0', student.absent && 'bg-muted/40')}>
							<input
								aria-label={`Mark for ${sheet.studentName(student)} on ${entry.label}`}
								inputmode="numeric"
								class={cn(
									'block w-full bg-transparent py-1 text-center tabular-nums outline-none focus:ring-2 focus:ring-primary focus:ring-inset',
									m !== undefined && m > entry.marks && 'font-semibold text-destructive'
								)}
								value={m ?? ''}
								onchange={(e) => sheet.setMark(student.id, entry.id, e.currentTarget.value)}
							/>
						</td>
					{/each}
					<td
						class={cn(
							'border-l-2 px-1 text-center tabular-nums',
							g.kind === 'partial' && 'text-muted-foreground italic'
						)}
					>
						{g.kind === 'none' ? '' : g.total}
					</td>
					{#if hasGrades}
						<td
							class={cn(
								'px-1 text-center font-semibold',
								g.kind === 'partial' && 'font-normal text-muted-foreground italic'
							)}
						>
							{g.kind === 'none' ? '' : `${g.grade ?? ''}${g.kind === 'partial' ? '*' : ''}`}
						</td>
						<td
							class={cn(
								'px-1 text-center text-xs tabular-nums',
								g.kind === 'partial' && 'text-muted-foreground italic'
							)}
						>
							{g.kind === 'partial' ? 'so far' : g.kind === 'complete' ? g.toNext : ''}
						</td>
					{/if}
				</tr>
			{:else}
				<tr>
					<td
						colspan={entries.length + 2 + endColumns}
						class="px-3 py-6 text-sm text-muted-foreground"
					>
						{emptyText}
					</td>
				</tr>
			{/each}
		</tbody>
		<tfoot class="border-t bg-muted/30">
			<tr>
				<td class="sticky left-0 z-10 border-r bg-background px-1.5 py-1 text-xs font-semibold"
					>Facility</td
				>
				<td class="sticky left-44 z-10 border-r bg-background"></td>
				{#each facility as row (row.entry.id)}
					<td class="border-l p-0 text-center">
						<button
							type="button"
							class={cn(
								'my-0.5 w-[calc(100%-4px)] rounded-sm py-0.5 hover:ring-2 hover:ring-primary',
								row.facility === null
									? 'text-xs text-muted-foreground'
									: ['text-[11px] font-semibold tabular-nums', facilityTint(row.band)]
							)}
							onclick={() =>
								toast(`Would open the ${sheet.tiers[tier].name} analysis at ${row.entry.label}`)}
						>
							{row.facility === null ? '—' : `${Math.round(row.facility * 100)}%`}
						</button>
					</td>
				{/each}
				<td class="border-l-2" colspan={endColumns}></td>
			</tr>
		</tfoot>
	</table>
</div>
