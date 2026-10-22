<!--
	The grade-boundaries editor: the paper's grade scale as (grade label,
	lowest raw mark) rows, top grade first. It edits a working copy — nothing
	reaches the marksheet until Save boundaries — and a grade left blank reads
	as "not used" and is dropped on save, so a tiered paper awards what it awards.
	The marksheet banner dialog and the report flow's Grades step share this
	editor; both mount it fresh when they open.
-->
<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Table from '$lib/components/ui/table';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { studentTotal, totalMarks } from '$lib/marksheet/document.js';
	import {
		belowLabelOf,
		boundariesFrom,
		formatPercent,
		marksToPercent,
		parsePercent,
		percentIssues,
		percentToMarks,
		boundariesOf,
		boundaryIssues,
		gradeOf,
		GRADE_SCALES,
		isUnused,
		workingCopyOf,
		type BoundaryIssue,
		type BoundaryRow
	} from '$lib/marksheet/grades.js';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import { isEligible } from '$lib/marksheet/report-eligibility.js';
	import { cn } from '$lib/utils.js';

	let { onDone }: { /** After Save boundaries or Remove grades. */ onDone?: () => void } = $props();

	const store = marksheetStore();
	const document = $derived(store.document);
	const paperTotal = $derived(document ? totalMarks(document.breakdown.entries) : 0);

	/** The working copy: rows as typed, plus the below-lowest label. */
	const initial = workingCopyOf(store.document);
	let rows = $state<BoundaryRow[]>(initial.rows);
	let below = $state(initial.below);
	/** Which scale the working copy was started from; Custom makes labels editable. */
	let scale = $state(initial.scale);

	/** Whether `min` is typed as raw marks or as a percentage of the paper total. */
	let mode = $state<'marks' | 'percent'>('marks');

	function setMode(next: 'marks' | 'percent'): void {
		mode = next;
		// Boundaries are raw marks; only what the teacher types in % mode converts.
		if (next === 'marks') for (const row of rows) delete row.percent;
	}

	/** The % input's text: what was typed, else the stored mark worked out again. */
	function percentText(row: BoundaryRow): string {
		if (row.percent !== undefined) return row.percent;
		const min = row.min.trim();
		return /^\d+$/.test(min) ? formatPercent(marksToPercent(Number(min), paperTotal)) : min;
	}

	function typePercent(row: BoundaryRow, text: string): void {
		row.percent = text;
		const percent = parsePercent(text);
		// Blank clears the boundary, as Marks mode does. Other invalid text
		// leaves the stored raw mark alone: switching back to Marks must
		// restore exactly what was there, and the percent issue blocks Save
		// until the teacher fixes or abandons the text.
		if (percent !== null) row.min = String(percentToMarks(percent, paperTotal));
		else if (text.trim() === '') row.min = '';
	}
	/** Start the working copy from one scale, keeping marks typed against carried-over labels. */
	function pick(name: string): void {
		scale = name;
		if (name === 'Custom') {
			if (rows.length === 0) rows = [{ label: '', min: '' }];
			return;
		}
		const labels = GRADE_SCALES.find((candidate) => candidate.name === name)?.labels ?? [];
		const previous = (label: string): string =>
			rows.find((row) => row.label.trim() === label)?.min ?? '';
		rows = labels.map((label) => ({ label, min: previous(label) }));
	}

	/** The boundaries Save would store: blank and unawarded rows left out. */
	const draft = $derived(boundariesFrom(rows));
	const issues = $derived.by(() => [
		...boundaryIssues(rows, below, paperTotal),
		...percentIssues(rows)
	]);
	const issueFor = $derived.by(() => {
		const byIndex: BoundaryIssue[][] = rows.map(() => []);
		for (const issue of issues) byIndex[issue.index]?.push(issue);
		return byIndex;
	});
	/** How many students with a final total each draft grade would catch, once the draft is valid. */
	const counts = $derived.by(() => {
		if (!document || issues.length > 0 || draft.length === 0) return null;
		const tally: Record<string, number> = {};
		for (const student of document.students) {
			if (!isEligible(document, student.id)) continue;
			const grade = gradeOf(studentTotal(document, student.id), draft, belowLabelOf(below));
			tally[grade.label] = (tally[grade.label] ?? 0) + 1;
		}
		return tally;
	});
	const footer = $derived(
		issues.length > 0
			? `${issues.length} ${issues.length === 1 ? 'problem' : 'problems'} to fix`
			: draft.length === 0
				? 'No grades: reports show marks only'
				: `${draft.length} ${draft.length === 1 ? 'grade' : 'grades'}`
	);

	function save(): void {
		if (issues.length > 0) return;
		store.saveBoundaries(draft, below);
		onDone?.();
	}

	function remove(): void {
		store.removeBoundaries();
		onDone?.();
	}
</script>

<div class="space-y-4 text-sm">
	<p class="text-xs text-muted-foreground">
		{mode === 'percent'
			? `Percentages of ${paperTotal} marks, rounded up to a whole mark.`
			: `Raw marks out of ${paperTotal}.`}
	</p>
	<div class="space-y-1.5">
		<p class="text-xs text-muted-foreground">Grade scale</p>
		<ToggleGroup.Root
			type="single"
			size="sm"
			variant="outline"
			aria-label="Grade scale"
			class="flex-wrap"
			value={scale}
			onValueChange={(next) => {
				if (next) pick(next);
			}}
		>
			{#each GRADE_SCALES as candidate (candidate.name)}
				<ToggleGroup.Item value={candidate.name}>{candidate.name}</ToggleGroup.Item>
			{/each}
		</ToggleGroup.Root>
	</div>

	<div class="space-y-1.5">
		<p class="text-xs text-muted-foreground">Enter boundaries as</p>
		<ToggleGroup.Root
			type="single"
			size="sm"
			variant="outline"
			aria-label="Boundary entry"
			value={mode}
			onValueChange={(next) => {
				if (next === 'marks' || next === 'percent') setMode(next);
			}}
		>
			<ToggleGroup.Item value="marks">Marks</ToggleGroup.Item>
			<ToggleGroup.Item value="percent" disabled={paperTotal === 0}>%</ToggleGroup.Item>
		</ToggleGroup.Root>
	</div>

	{#if scale === ''}
		<p class="text-muted-foreground">Pick a scale to start, or Custom to name your own grades.</p>
	{:else}
		<Table.Root class="w-full">
			<Table.Header class="text-left text-xs text-muted-foreground">
				<Table.Row>
					<Table.Head class="w-36 pb-1 font-normal">Grade</Table.Head>
					<Table.Head
						class={mode === 'percent' ? 'w-40 pb-1 font-normal' : 'w-24 pb-1 font-normal'}
					>
						{mode === 'percent' ? 'Lowest %' : 'Lowest mark'}
					</Table.Head>
					<Table.Head class="w-20 pb-1 font-normal">Students</Table.Head>
					<Table.Head><span class="sr-only">Problems</span></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each rows as row, i (i)}
					{@const rowIssues = issueFor[i] ?? []}
					{@const off = isUnused(row)}
					<Table.Row
						class={cn('align-middle', off && scale !== 'Custom' && 'text-muted-foreground')}
					>
						<Table.Cell class="py-0.5 pr-2">
							{#if scale === 'Custom'}
								<Input class="h-8" bind:value={row.label} aria-label="Grade {i + 1}" />
							{:else}
								<span class="font-semibold">{row.label}</span>
							{/if}
						</Table.Cell>
						<Table.Cell class="py-0.5 pr-2">
							{#if mode === 'percent'}
								<div class="flex items-center gap-2">
									<Input
										class={cn(
											'h-8 w-20 tabular-nums',
											rowIssues.some((issue) => issue.field === 'min') && 'border-destructive'
										)}
										inputmode="decimal"
										placeholder={scale === 'Custom' ? '' : 'not used'}
										value={percentText(row)}
										oninput={(event) => typePercent(row, event.currentTarget.value)}
										aria-label="Lowest percentage for {row.label || `grade ${i + 1}`}"
									/>
									{#if !off && /^\d+$/.test(row.min)}
										<span class="text-xs tabular-nums text-muted-foreground">
											→ {row.min}/{paperTotal}
										</span>
									{/if}
								</div>
							{:else}
								<Input
									class={cn(
										'h-8 w-20 tabular-nums',
										rowIssues.some((issue) => issue.field === 'min') && 'border-destructive'
									)}
									inputmode="numeric"
									placeholder={scale === 'Custom' ? '' : 'not used'}
									bind:value={row.min}
									aria-label="Lowest mark for {row.label || `grade ${i + 1}`}"
								/>
							{/if}
						</Table.Cell>
						<Table.Cell
							class="py-0.5 text-xs tabular-nums text-muted-foreground"
							data-testid="grade-row-count"
						>
							{counts && !off ? (counts[row.label.trim()] ?? 0) : ''}
						</Table.Cell>
						<Table.Cell
							class="py-0.5 text-xs text-destructive"
							data-testid="grade-row-issues"
							data-row-index={i}
						>
							{rowIssues.map((issue) => issue.message).join('; ')}
						</Table.Cell>
					</Table.Row>
				{/each}
				{#if scale === 'Custom'}
					<Table.Row>
						<Table.Cell colspan={4} class="pt-1">
							<Button variant="ghost" size="xs" onclick={() => rows.push({ label: '', min: '' })}>
								<PlusIcon class="size-3.5" /> Add grade
							</Button>
						</Table.Cell>
					</Table.Row>
				{/if}
				<Table.Row class="text-muted-foreground">
					<Table.Cell class="py-0.5 pr-2">
						<Input class="h-8 w-28" bind:value={below} aria-label="Label below the lowest grade" />
					</Table.Cell>
					<Table.Cell class="py-0.5 text-xs">below the rest</Table.Cell>
					<Table.Cell class="py-0.5 text-xs tabular-nums">
						{counts ? (counts[belowLabelOf(below)] ?? 0) : ''}
					</Table.Cell>
					<Table.Cell></Table.Cell>
				</Table.Row>
			</Table.Body>
		</Table.Root>
		{#if rows.length === 0 && scale !== 'Custom'}
			<p class="text-xs text-muted-foreground">Every grade blank reads as “not used”.</p>
		{/if}
		<p class="text-xs text-muted-foreground">
			Top grade first, {mode === 'percent' ? 'as percentages' : 'in raw marks'}. Leave a grade blank
			if this paper doesn't award it.
		</p>
	{/if}
</div>
<div class="flex items-center">
	{#if document && boundariesOf(document)}
		<Button variant="ghost" size="sm" class="mr-auto text-muted-foreground" onclick={remove}>
			Remove grades
		</Button>
	{/if}
	<span class="mr-auto text-xs text-muted-foreground" data-testid="grade-boundaries-footer">
		{footer}
	</span>
	<Button size="sm" disabled={issues.length > 0 || scale === ''} onclick={save}>
		Save boundaries
	</Button>
</div>
