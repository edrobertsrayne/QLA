<!--
	The grade-boundaries dialog: the paper's grade scale as (grade label,
	lowest raw mark) rows, top grade first. It edits a working copy — nothing
	reaches the marksheet until Save boundaries — and a grade left blank reads
	as "not used" and is dropped on save, so a tiered paper awards what it awards.
-->
<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { isOverMax, totalMarks, type GradeBoundary } from '$lib/marksheet/document.js';
	import {
		boundaryIssues,
		gradeOf,
		GRADE_SCALES,
		keptRows,
		type BoundaryIssue,
		type BoundaryRow
	} from '$lib/marksheet/grades.js';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import { cn } from '$lib/utils.js';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const store = marksheetStore();
	const document = $derived(store.document);
	const paperTotal = $derived(document ? totalMarks(document.breakdown.entries) : 0);

	/** The working copy: rows as typed, plus the below-lowest label. */
	let rows = $state<BoundaryRow[]>([]);
	let below = $state('U');
	/** Which scale the working copy was started from; Custom makes labels editable. */
	let scale = $state('');

	function reset(): void {
		const stored = document?.paper.boundaries;
		const belowStored = document?.paper.belowLowestLabel ?? 'U';
		below = belowStored;
		if (!stored || stored.length === 0) {
			rows = [];
			scale = '';
			return;
		}
		rows = stored.map((boundary) => ({ label: boundary.label, min: String(boundary.minimum) }));
		// The scale is read from what is stored, never from the working copy:
		// reading `rows` here would make the reset effect re-run on every write.
		const labels = stored.map((boundary) => boundary.label).join('|');
		scale =
			GRADE_SCALES.find(
				(candidate) => candidate.labels.length > 0 && candidate.labels.join('|') === labels
			)?.name ?? 'Custom';
	}

	$effect(() => {
		if (open) reset();
	});
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

	const dropped = $derived((row: BoundaryRow) => row.min.trim() === '');
	/** The rows Save would store: blank and unawarded rows left out. */
	const kept = $derived(keptRows(rows));
	const issues = $derived.by(() => boundaryIssues(rows, below, paperTotal));
	const issueFor = $derived.by(() => {
		const byIndex: BoundaryIssue[][] = rows.map(() => []);
		for (const issue of issues) byIndex[issue.index]?.push(issue);
		return byIndex;
	});
	/** How many fully-marked students each draft grade would catch, once the draft is valid. */
	const counts = $derived.by(() => {
		if (!document || issues.length > 0 || kept.length === 0) return null;
		const keptList: GradeBoundary[] = kept.map((row) => ({
			label: row.label.trim(),
			minimum: Number(row.min.trim())
		}));
		const tally: Record<string, number> = {};
		for (const student of document.students) {
			if (student.absent) continue;
			const marks = document.marks[student.id] ?? {};
			const entries = document.breakdown.entries;
			// Fully marked like the columns read them: every entry answered and
			// none above the available marks.
			if (
				entries.some((entry) => marks[entry.id] === undefined || isOverMax(marks[entry.id], entry))
			) {
				continue;
			}
			const total = entries.reduce((sum, entry) => sum + marks[entry.id], 0);
			const grade = gradeOf(total, keptList, below);
			tally[grade.label] = (tally[grade.label] ?? 0) + 1;
		}
		return tally;
	});
	const footer = $derived(
		issues.length > 0
			? `${issues.length} ${issues.length === 1 ? 'problem' : 'problems'} to fix`
			: kept.length === 0
				? 'No grades: reports show marks only'
				: `${kept.length} ${kept.length === 1 ? 'grade' : 'grades'}`
	);

	function save(): void {
		if (issues.length > 0) return;
		store.saveBoundaries(
			kept.map((row) => ({ label: row.label.trim(), minimum: Number(row.min.trim()) })),
			below
		);
		open = false;
	}

	function remove(): void {
		store.removeBoundaries();
		open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-lg" data-testid="grade-boundaries-dialog">
		<Dialog.Header>
			<Dialog.Title>Grade boundaries</Dialog.Title>
			<Dialog.Description>Raw marks out of {paperTotal}.</Dialog.Description>
		</Dialog.Header>
		<div class="space-y-4 text-sm">
			<div class="space-y-1.5">
				<p class="text-xs text-muted-foreground">Grade scale</p>
				<div class="flex flex-wrap gap-1.5">
					{#each GRADE_SCALES as candidate (candidate.name)}
						<button
							type="button"
							class={cn(
								'rounded-full border px-3 py-1 text-xs',
								scale === candidate.name
									? 'border-primary bg-primary text-primary-foreground'
									: 'hover:bg-muted'
							)}
							onclick={() => pick(candidate.name)}
						>
							{candidate.name}
						</button>
					{/each}
				</div>
			</div>

			{#if scale === ''}
				<p class="text-muted-foreground">
					Pick a scale to start, or Custom to name your own grades.
				</p>
			{:else}
				<table class="w-full">
					<thead class="text-left text-xs text-muted-foreground">
						<tr>
							<th class="w-36 pb-1 font-normal">Grade</th>
							<th class="w-24 pb-1 font-normal">Lowest mark</th>
							<th class="w-20 pb-1 font-normal">Students</th>
							<th><span class="sr-only">Problems</span></th>
						</tr>
					</thead>
					<tbody>
						{#each rows as row, i (i)}
							{@const rowIssues = issueFor[i] ?? []}
							{@const off = dropped(row)}
							<tr class={cn('align-middle', off && scale !== 'Custom' && 'text-muted-foreground')}>
								<td class="py-0.5 pr-2">
									{#if scale === 'Custom'}
										<Input class="h-8" bind:value={row.label} aria-label="Grade {i + 1}" />
									{:else}
										<span class="font-semibold">{row.label}</span>
									{/if}
								</td>
								<td class="py-0.5 pr-2">
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
								</td>
								<td
									class="py-0.5 text-xs tabular-nums text-muted-foreground"
									data-testid="grade-row-count"
								>
									{counts && !off ? (counts[row.label.trim()] ?? 0) : ''}
								</td>
								<td
									class="py-0.5 text-xs text-destructive"
									data-testid="grade-row-issues"
									data-row-index={i}
								>
									{rowIssues.map((issue) => issue.message).join('; ')}
								</td>
							</tr>
						{/each}
						{#if scale === 'Custom'}
							<tr>
								<td colspan="4" class="pt-1">
									<Button
										variant="ghost"
										size="xs"
										onclick={() => rows.push({ label: '', min: '' })}
									>
										<PlusIcon class="size-3.5" /> Add grade
									</Button>
								</td>
							</tr>
						{/if}
						<tr class="text-muted-foreground">
							<td class="py-0.5 pr-2">
								<Input
									class="h-8 w-28"
									bind:value={below}
									aria-label="Label below the lowest grade"
								/>
							</td>
							<td class="py-0.5 text-xs">below the rest</td>
							<td class="py-0.5 text-xs tabular-nums">
								{counts ? (counts[below.trim() === '' ? 'U' : below.trim()] ?? 0) : ''}
							</td>
							<td></td>
						</tr>
					</tbody>
				</table>
				{#if rows.length === 0 && scale !== 'Custom'}
					<p class="text-xs text-muted-foreground">Every grade blank reads as “not used”.</p>
				{/if}
				<p class="text-xs text-muted-foreground">
					Top grade first, in raw marks. Leave a grade blank if this paper doesn't award it.
				</p>
			{/if}
		</div>
		<Dialog.Footer class="items-center">
			{#if document?.paper.boundaries}
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
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
