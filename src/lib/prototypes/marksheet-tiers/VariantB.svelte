<!--
	PROTOTYPE (#114) — Variant B: One roster.
	Every student is always on the sheet, with a frozen Tier column beside the name
	(click H/F, or focus it and type 1/2/H/F to set and drop to the next row). A
	Columns toggle picks which tier's entries are showing. Students on the other tier
	stay in place, their cells hatched and locked, any kept off-tier marks greyed in
	them; not-set students are hatched amber. Totals and grades always read each
	student's own tier. Boundaries for both tiers sit in one dialog; exports are
	chosen in one Export dialog.
-->
<script lang="ts">
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import UserXIcon from '@lucide/svelte/icons/user-x';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { cn } from '$lib/utils.js';
	import BoundariesEditor from './BoundariesEditor.svelte';
	import HardestStrip from './HardestStrip.svelte';
	import SheetHeader from './SheetHeader.svelte';
	import { facilityTint, tieredSheet, type Student, type TierIndex } from './sheet.svelte.js';

	const sheet = tieredSheet();

	let shown = $state('0');
	const tier = $derived(Number(shown) as TierIndex);
	const entries = $derived(sheet.tiers[tier].entries);
	const bands = $derived(sheet.bands(tier));
	const facility = $derived(sheet.facility(tier));
	const hasGrades = $derived(sheet.tiers[tier].boundaries !== null);
	let order = $state<'name' | 'tier'>('name');
	const rows = $derived(
		order === 'tier'
			? [...sheet.students].sort((a, b) => (a.tier ?? 2) - (b.tier ?? 2))
			: sheet.students
	);
	let boundariesOpen = $state(false);
	let exportOpen = $state(false);
	let picks = $state<string[]>(['marks-0', 'marks-1']);

	const summary = $derived(
		`${sheet.students.length} students (${sheet.studentsOn(0).length} ${sheet.tiers[0].name}, ${sheet.studentsOn(1).length} ${sheet.tiers[1].name}, ${sheet.notSet.length} not set)`
	);

	const HATCH =
		'background-image: repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in oklab, currentColor 10%, transparent) 4px 5px)';

	function letter(t: TierIndex) {
		return sheet.tiers[t].name[0];
	}

	/** Typing on a focused tier cell sets it and moves down: tiers go in as fast as marks. */
	function onTierKey(student: Student, index: number, e: KeyboardEvent) {
		const k = e.key.toLowerCase();
		let t: TierIndex | null | undefined;
		if (k === '1' || k === letter(0).toLowerCase()) t = 0;
		else if (k === '2' || k === letter(1).toLowerCase()) t = 1;
		else if (k === 'delete' || k === 'backspace') t = null;
		else if (k === 'arrowdown' || k === 'enter') t = undefined;
		else if (k === 'arrowup') {
			e.preventDefault();
			focusTier(index - 1);
			return;
		} else return;
		e.preventDefault();
		if (t !== undefined) sheet.setTier(student.id, t);
		focusTier(index + 1);
	}

	function focusTier(index: number) {
		document.querySelector<HTMLElement>(`[data-tier-row="${index}"]`)?.focus();
	}

	const EXPORTS = $derived([
		{ key: 'marks-0', label: `${sheet.tiers[0].name} marks`, file: sheet.exportName('marks', 0) },
		{ key: 'marks-1', label: `${sheet.tiers[1].name} marks`, file: sheet.exportName('marks', 1) }
	]);
</script>

<main class="mx-auto max-w-6xl space-y-4 p-6">
	<SheetHeader {summary} />

	<div class="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
		<p>
			{sheet.reportable} of {sheet.students.length} students are fully marked and can have a report
			{#if sheet.notSet.length > 0}
				<span class="text-muted-foreground">· {sheet.notSet.length} have no tier yet</span>
			{/if}
		</p>
		<div class="flex gap-2">
			<Button size="sm" variant="outline" onclick={() => (boundariesOpen = true)}>
				Grade boundaries ({sheet.tiers[0].name[0]}
				{sheet.tiers[0].boundaries?.length ?? '–'} · {sheet.tiers[1].name[0]}
				{sheet.tiers[1].boundaries?.length ?? '–'})
			</Button>
			{#if sheet.reportable > 0}
				<Button size="sm" onclick={() => toast('Would open the report flow')}>Make reports</Button>
			{/if}
		</div>
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<Button variant="outline" size="xs" onclick={() => toast(`Would open the analysis`)}>
			<ChartColumnIcon class="size-3.5" /> View analysis
		</Button>
		<span class="text-xs text-muted-foreground">Columns</span>
		<ToggleGroup.Root type="single" variant="outline" size="sm" bind:value={shown}>
			{#each [0, 1] as const as t (t)}
				<ToggleGroup.Item value={String(t)} class="h-6 px-3 text-xs"
					>{sheet.tierLabel(t)}</ToggleGroup.Item
				>
			{/each}
		</ToggleGroup.Root>
		<HardestStrip {tier} />
		<span class="text-xs text-muted-foreground">Sort</span>
		<Button variant="outline" size="xs" onclick={() => (order = 'name')}>By first name</Button>
		<Button variant="outline" size="xs" onclick={() => (order = 'tier')}>By tier</Button>
		<div class="ml-auto flex items-center gap-2">
			<Button
				variant="outline"
				size="xs"
				onclick={() => toast('Would open Edit breakdown (both tiers)')}
			>
				Edit breakdown
			</Button>
			<Button variant="outline" size="xs" onclick={() => (exportOpen = true)}>
				<DownloadIcon class="size-3.5" /> Export…
			</Button>
		</div>
	</div>

	<p class="text-xs text-muted-foreground">
		Tier column: click {letter(0)} or {letter(1)}, or select it and type 1/2 ({letter(0)}/{letter(
			1
		)}); it drops to the next student. Delete clears it.
	</p>

	<div class="relative overflow-x-auto rounded-xl border">
		<table class="w-fit table-fixed border-collapse text-sm">
			<colgroup>
				<col style="width: 10rem" />
				<col style="width: 3.5rem" />
				<col style="width: 3.5rem" />
				{#each entries as entry (entry.id)}
					<col style="width: 2.5rem" />
				{/each}
				<col style="width: 3rem" />
				<col style="width: 3rem" />
				<col style="width: 5rem" />
			</colgroup>
			<thead>
				<tr class="border-b">
					<th class="sticky left-0 z-20 border-r bg-background" colspan="3"></th>
					{#each bands as band, i (band.questionNumber + i)}
						<th
							colspan={band.entries.length}
							class={cn(
								'border-l px-1 py-0.5 text-left text-xs font-medium',
								i % 2 === 1 && 'bg-muted/50'
							)}
						>
							{sheet.tiers[tier].name[0]} Q{band.questionNumber}
						</th>
					{/each}
					<th colspan="3" class="border-l-2 text-xs font-normal text-muted-foreground">own tier</th>
				</tr>
				<tr class="border-b">
					<th class="sticky left-0 z-20 bg-background px-1.5 text-left text-xs">Student</th>
					<th class="sticky left-40 z-20 bg-background px-1 text-xs">Tier</th>
					<th class="sticky left-54 z-20 border-r bg-background px-1 text-xs">Prog.</th>
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
					<th class="px-1 text-center text-xs">Grade</th>
					<th class="px-1 text-center text-xs">To next</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as student, index (student.id)}
					{@const onShown = student.tier === tier}
					{@const progress = sheet.progress(student)}
					{@const g = sheet.graded(student)}
					<tr
						class={cn(
							'border-b',
							!onShown && 'text-muted-foreground',
							student.tier === null && 'bg-amber-500/5'
						)}
					>
						<td class="sticky left-0 z-10 bg-background px-1 py-0.5">
							<span class="flex items-center gap-1">
								<button
									type="button"
									class={cn(
										'shrink-0 rounded p-0.5',
										student.absent
											? 'text-destructive'
											: 'text-muted-foreground/40 hover:text-foreground'
									)}
									title="Mark absent"
									onclick={() => sheet.setAbsent(student.id, !student.absent)}
								>
									<UserXIcon class="size-3.5" />
								</button>
								<span class={cn('min-w-0 flex-1 truncate', student.absent && 'line-through')}>
									{sheet.studentName(student)}
								</span>
							</span>
						</td>
						<td
							class="sticky left-40 z-10 bg-background px-0.5 focus:ring-2 focus:ring-primary focus:outline-none focus:ring-inset"
							tabindex="0"
							data-tier-row={index}
							onkeydown={(e) => onTierKey(student, index, e)}
						>
							<span class="flex justify-center gap-0.5">
								{#each [0, 1] as const as t (t)}
									<button
										type="button"
										tabindex="-1"
										class={cn(
											'size-5 rounded text-[11px] font-semibold',
											student.tier === t
												? 'bg-primary text-primary-foreground'
												: student.tier === null
													? 'border border-amber-500/70 text-amber-700 dark:text-amber-300'
													: 'text-muted-foreground/50 hover:bg-muted'
										)}
										title={sheet.tierLabel(t)}
										onclick={() => sheet.setTier(student.id, t)}
									>
										{letter(t)}
									</button>
								{/each}
							</span>
						</td>
						<td
							class="sticky left-54 z-10 border-r bg-background px-1 text-center text-xs tabular-nums"
						>
							{student.absent ? 'absent' : progress ? `${progress.marked}/${progress.total}` : '—'}
						</td>
						{#each entries as entry (entry.id)}
							{@const m = sheet.mark(student.id, entry.id)}
							{#if onShown}
								<td class={cn('border-l p-0', student.absent && 'bg-muted/40')}>
									<input
										aria-label={`Mark for ${sheet.studentName(student)} on ${entry.label}`}
										inputmode="numeric"
										class="block w-full bg-transparent py-1 text-center tabular-nums outline-none focus:ring-2 focus:ring-primary focus:ring-inset"
										value={m ?? ''}
										onchange={(e) => sheet.setMark(student.id, entry.id, e.currentTarget.value)}
									/>
								</td>
							{:else}
								<td
									class={cn(
										'border-l py-1 text-center text-xs tabular-nums',
										student.tier === null ? 'text-amber-700/70' : 'text-muted-foreground/60'
									)}
									style={HATCH}
									title={student.tier === null
										? 'No tier set: set one to enter marks'
										: `On ${sheet.tiers[student.tier].name}${m !== undefined ? ': this mark is kept but not counted' : ''}`}
								>
									{m ?? ''}
								</td>
							{/if}
						{/each}
						<td
							class={cn(
								'border-l-2 px-1 text-center tabular-nums',
								g.kind === 'partial' && 'italic'
							)}
						>
							{#if g.kind !== 'none'}{g.total}{#if !onShown}<sup class="ml-0.5 text-[9px]"
										>{letter(student.tier ?? 0)}</sup
									>{/if}{/if}
						</td>
						<td
							class={cn(
								'px-1 text-center font-semibold',
								g.kind === 'partial' && 'font-normal italic'
							)}
						>
							{g.kind === 'none'
								? ''
								: `${g.grade ?? ''}${g.kind === 'partial' && g.grade ? '*' : ''}`}
						</td>
						<td class="px-1 text-center text-xs tabular-nums">
							{g.kind === 'partial' && g.grade ? 'so far' : g.kind === 'complete' ? g.toNext : ''}
						</td>
					</tr>
				{/each}
			</tbody>
			<tfoot class="border-t">
				<tr>
					<td
						class="sticky left-0 z-10 bg-background px-1.5 py-1 text-xs font-semibold"
						colspan="3"
					>
						Facility ({sheet.tiers[tier].name} students)
					</td>
					{#each facility as row (row.entry.id)}
						<td class="border-l p-0 text-center">
							<span
								class={cn(
									'my-0.5 block w-[calc(100%-4px)] rounded-sm py-0.5',
									row.facility === null
										? 'text-xs text-muted-foreground'
										: ['text-[11px] font-semibold tabular-nums', facilityTint(row.band)]
								)}
							>
								{row.facility === null ? '—' : `${Math.round(row.facility * 100)}%`}
							</span>
						</td>
					{/each}
					<td class="border-l-2" colspan="3"></td>
				</tr>
			</tfoot>
		</table>
	</div>
	{#if !hasGrades}
		<p class="text-xs text-muted-foreground">
			Grade and To next read each student's own tier: blank where that tier has no boundaries.
		</p>
	{/if}
</main>

<Dialog.Root bind:open={boundariesOpen}>
	<Dialog.Content class="sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>Grade boundaries</Dialog.Title>
			<Dialog.Description
				>Each tier has its own. A grade is always on its student's tier.</Dialog.Description
			>
		</Dialog.Header>
		{#if boundariesOpen}
			<div class="grid grid-cols-2 gap-6">
				{#each [0, 1] as const as t (t)}
					<section class="space-y-2">
						<h3 class="text-sm font-semibold">{sheet.tierLabel(t)}</h3>
						<BoundariesEditor tier={t} />
					</section>
				{/each}
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={exportOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Export marks</Dialog.Title>
			<Dialog.Description
				>One spreadsheet (.csv) per tier, in today's format. Not a backup.</Dialog.Description
			>
		</Dialog.Header>
		<div class="space-y-2 text-sm">
			{#each EXPORTS as x (x.key)}
				<label class="flex items-center gap-2">
					<Checkbox
						checked={picks.includes(x.key)}
						onCheckedChange={(on) =>
							(picks = on ? [...picks, x.key] : picks.filter((p) => p !== x.key))}
					/>
					{x.label}
					<span class="text-xs text-muted-foreground">{x.file}</span>
				</label>
			{/each}
		</div>
		<Dialog.Footer>
			<Button
				disabled={picks.length === 0}
				onclick={() => {
					for (const x of EXPORTS.filter((e) => picks.includes(e.key)))
						toast(`Would download ${x.file}`);
					exportOpen = false;
				}}
			>
				Download {picks.length === 1 ? '1 file' : `${picks.length} files`}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
