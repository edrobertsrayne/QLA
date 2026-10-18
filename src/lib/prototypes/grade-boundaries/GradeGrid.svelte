<!--
	PROTOTYPE (#55) — the marksheet grid with each variant's grade columns.
	A: one frozen "Grade" column beside Progress; its header opens the boundary list.
	B: one "Total · Grade" column at the far end, after the marks it sums.
	C: three end columns, Total | Grade | To next; part-marked rows show a provisional grade.
-->
<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import * as Table from '$lib/components/ui/table';
	import MarksheetGrid from '$lib/components/marksheet/MarksheetGrid.svelte';
	import { FROZEN_PROGRESS, GRADE_PIN } from '$lib/components/marksheet/grid-layout.js';
	import type { StoredStudent } from '$lib/marksheet/document.js';
	import { cn } from '$lib/utils';
	import BoundaryList from './BoundaryList.svelte';
	import {
		boundaries,
		grades,
		issuesOf,
		paperTotal,
		studentGrade,
		type StudentGrade
	} from './grades.svelte.js';

	let {
		variant,
		onViewAnalysis
	}: { variant: 'A' | 'B' | 'C'; onViewAnalysis: (entryId: string | null) => void } = $props();

	const set = $derived(boundaries().length > 0);
	/** Rows typed but not usable: no grades show until they are fixed. */
	const broken = $derived(!set && issuesOf(grades.rows, grades.below, paperTotal()).length > 0);
	const toNextText = (g: StudentGrade) =>
		(g.kind === 'complete' || g.kind === 'partial') && g.grade?.toNext != null
			? `${g.grade.toNext} to ${g.grade.nextLabel}`
			: '';
</script>

{#snippet headA()}
	<Table.Head class={cn(FROZEN_PROGRESS, 'p-0 text-xs')} style={GRADE_PIN}>
		<Popover.Root>
			<Popover.Trigger
				class={cn(
					'w-full rounded px-1 py-1 hover:bg-muted',
					!set && 'text-primary underline decoration-dotted',
					broken && 'text-destructive'
				)}
			>
				{set ? 'Grade ▾' : broken ? 'Grade ⚠' : 'Set grades'}
			</Popover.Trigger>
			<Popover.Content class="w-72" align="start">
				<p class="mb-2 font-medium">Grade boundaries</p>
				<BoundaryList />
			</Popover.Content>
		</Popover.Root>
	</Table.Head>
{/snippet}

{#snippet cellA(student: StoredStudent)}
	{@const g = studentGrade(student.id)}
	<Table.Cell
		class={cn(FROZEN_PROGRESS, 'px-1 py-0.5 text-center leading-tight tabular-nums')}
		style={GRADE_PIN}
		title={g.kind === 'partial' ? 'Graded once fully marked' : undefined}
	>
		{#if g.kind === 'complete' && g.grade}
			<span class="font-semibold">{g.grade.label}</span>
			{#if g.grade.toNext != null}<span class="block text-[10px] text-muted-foreground"
					>+{g.grade.toNext}</span
				>{/if}
		{:else if g.kind === 'partial' && set}
			<span class="text-muted-foreground">–</span>
		{:else if g.kind === 'over-max' && set}
			<span class="text-destructive">!</span>
		{/if}
	</Table.Cell>
{/snippet}

{#snippet headB()}
	<Table.Head class="border-l-2 px-1 text-center text-xs">Total · Grade</Table.Head>
{/snippet}

{#snippet cellB(student: StoredStudent)}
	{@const g = studentGrade(student.id)}
	<Table.Cell class="border-l-2 px-1 py-0.5 text-center leading-tight tabular-nums">
		{#if g.kind === 'complete'}
			<span>{g.total}</span>
			{#if g.grade}
				· <span class="font-semibold">{g.grade.label}</span>
				<span class="block text-[10px] text-muted-foreground">{toNextText(g) || 'top grade'}</span>
			{/if}
		{:else if g.kind === 'partial'}
			<span class="text-muted-foreground" title="{g.marked} of {g.of} marked">{g.total}…</span>
		{:else if g.kind === 'over-max'}
			<span class="text-destructive">check</span>
		{/if}
	</Table.Cell>
{/snippet}

{#snippet headC()}
	<Table.Head class="border-l-2 px-1 text-center text-xs">Total</Table.Head>
	<Table.Head class="px-1 text-center text-xs">Grade</Table.Head>
	<Table.Head class="px-1 text-center text-xs">To next</Table.Head>
{/snippet}

{#snippet cellC(student: StoredStudent)}
	{@const g = studentGrade(student.id)}
	{@const partial = g.kind === 'partial'}
	<Table.Cell
		class={cn(
			'border-l-2 px-1 text-center tabular-nums',
			partial && 'text-muted-foreground italic'
		)}
	>
		{#if g.kind === 'complete' || g.kind === 'partial'}{g.total}{/if}
	</Table.Cell>
	<Table.Cell
		class={cn(
			'px-1 text-center font-semibold',
			partial && 'font-normal text-muted-foreground italic'
		)}
		title={partial ? 'Provisional: not every mark is in' : undefined}
	>
		{#if (g.kind === 'complete' || g.kind === 'partial') && g.grade}{g.grade.label}{partial
				? '*'
				: ''}{:else if g.kind === 'over-max' && set}<span class="text-destructive">!</span>{/if}
	</Table.Cell>
	<Table.Cell
		class={cn('px-1 text-center text-xs tabular-nums', partial && 'text-muted-foreground italic')}
	>
		{#if partial && g.grade}so far{:else}{toNextText(g)}{/if}
	</Table.Cell>
{/snippet}

<MarksheetGrid
	{onViewAnalysis}
	grade={variant === 'A'
		? { placement: 'frozen', widths: ['4rem'], head: headA, cell: cellA }
		: variant === 'B'
			? { placement: 'end', widths: ['6rem'], head: headB, cell: cellB }
			: set
				? { placement: 'end', widths: ['3rem', '3rem', '5rem'], head: headC, cell: cellC }
				: { placement: 'end', widths: ['3rem'], head: headTotalOnly, cell: cellTotalOnly }}
/>

{#snippet headTotalOnly()}
	<Table.Head class="border-l-2 px-1 text-center text-xs">Total</Table.Head>
{/snippet}

{#snippet cellTotalOnly(student: StoredStudent)}
	{@const g = studentGrade(student.id)}
	<Table.Cell
		class={cn(
			'border-l-2 px-1 text-center tabular-nums',
			g.kind === 'partial' && 'text-muted-foreground italic'
		)}
	>
		{#if g.kind === 'complete' || g.kind === 'partial'}{g.total}{/if}
	</Table.Cell>
{/snippet}
