<!--
	PROTOTYPE (#114) — Variant A: Tier tabs.
	One grid at a time. The toggle row (as on upload and review) picks Tier 1, Tier 2
	or "Tier not set"; a tier tab shows only that tier's columns and students, with its
	own Total | Grade | To next, facility footer, Hardest strip, boundaries and marks
	export. Not-set students live on their own tab with no mark columns, where tiers
	are set one by one or in bulk. A row control moves a student to the other tier.
-->
<script lang="ts">
	import ArrowLeftRightIcon from '@lucide/svelte/icons/arrow-left-right';
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import FileSpreadsheetIcon from '@lucide/svelte/icons/file-spreadsheet';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import BoundariesEditor from './BoundariesEditor.svelte';
	import HardestStrip from './HardestStrip.svelte';
	import OffTierBadge from './OffTierBadge.svelte';
	import SheetHeader from './SheetHeader.svelte';
	import TierGrid from './TierGrid.svelte';
	import { tieredSheet, type Student, type TierIndex } from './sheet.svelte.js';

	const sheet = tieredSheet();

	/** '0' | '1' | 'none'. Opens on Tier not set while nobody has a tier. */
	let tab = $state(sheet.students.every((s) => s.tier === null) ? 'none' : '0');
	const tier = $derived<TierIndex | null>(tab === 'none' ? null : (Number(tab) as TierIndex));
	let selected = $state<string[]>([]);
	let boundariesOpen = $state(false);

	const summary = $derived(
		`${sheet.students.length} students · ${sheet.tierLabel(0)} ${sheet.tiers[0].entries.length} entries, ${sheet.tierMarks(0)} marks · ${sheet.tierLabel(1)} ${sheet.tiers[1].entries.length} entries, ${sheet.tierMarks(1)} marks`
	);

	function other(t: TierIndex): TierIndex {
		return t === 0 ? 1 : 0;
	}

	function toggle(id: string, on: boolean) {
		selected = on ? [...selected, id] : selected.filter((x) => x !== id);
	}

	function bulk(t: TierIndex) {
		sheet.setTierMany(selected, t);
		selected = [];
	}
</script>

{#snippet moveControl(student: Student)}
	<OffTierBadge {student} />
	{#if student.tier !== null}
		{@const to = other(student.tier)}
		<button
			type="button"
			class="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground"
			title={`Move to ${sheet.tierLabel(to)}`}
			aria-label={`Move ${sheet.studentName(student)} to ${sheet.tierLabel(to)}`}
			onclick={() => {
				sheet.setTier(student.id, to);
				toast(`${sheet.studentName(student)} moved to ${sheet.tierLabel(to)}`, {
					description: 'Their marks on the tier they left are kept, not counted.'
				});
			}}
		>
			<ArrowLeftRightIcon class="size-3.5" />
		</button>
	{/if}
{/snippet}

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
			{#if tier !== null}
				{@const b = sheet.tiers[tier].boundaries}
				<Button size="sm" variant="outline" onclick={() => (boundariesOpen = true)}>
					{b
						? `${sheet.tiers[tier].name} boundaries (${b.length})`
						: `Set ${sheet.tiers[tier].name} boundaries`}
				</Button>
			{/if}
			{#if sheet.reportable > 0}
				<Button size="sm" onclick={() => toast('Would open the report flow')}>Make reports</Button>
			{/if}
		</div>
	</div>

	<ToggleGroup.Root type="single" variant="outline" bind:value={tab} class="w-fit">
		{#each [0, 1] as const as t (t)}
			<ToggleGroup.Item value={String(t)} class="px-4">
				{sheet.tierLabel(t)}
				<span class="text-muted-foreground tabular-nums">({sheet.studentsOn(t).length})</span>
			</ToggleGroup.Item>
		{/each}
		<ToggleGroup.Item value="none" class="relative px-4">
			Tier not set
			<span class="text-muted-foreground tabular-nums">({sheet.notSet.length})</span>
			{#if sheet.notSet.length > 0}
				<span class="absolute top-1 right-1 size-2 rounded-full bg-amber-500"></span>
			{/if}
		</ToggleGroup.Item>
	</ToggleGroup.Root>

	{#if tier !== null}
		<div class="flex flex-wrap items-center gap-2">
			<Button
				variant="outline"
				size="xs"
				onclick={() => toast(`Would open the ${sheet.tiers[tier].name} analysis`)}
			>
				<ChartColumnIcon class="size-3.5" /> View analysis
			</Button>
			<HardestStrip {tier} />
			<span class="text-xs text-muted-foreground">Sort the class</span>
			<Button variant="outline" size="xs">By first name</Button>
			<Button variant="outline" size="xs">By surname</Button>
			<div class="ml-auto flex items-center gap-2">
				<Button
					variant="outline"
					size="xs"
					onclick={() => toast('Would open Edit breakdown (both tiers)')}
				>
					Edit breakdown
				</Button>
				<Button
					variant="outline"
					size="xs"
					onclick={() => toast(`Would download ${sheet.exportName('marks', tier)}`)}
				>
					<FileSpreadsheetIcon class="size-3.5" /> Export {sheet.tiers[tier].name} marks (.csv)
				</Button>
				<span class="text-[11px] text-muted-foreground">Not a backup</span>
			</div>
		</div>
		{#key tier}
			<TierGrid
				{tier}
				students={sheet.studentsOn(tier)}
				nameExtra={moveControl}
				emptyText={`No students on ${sheet.tiers[tier].name} yet. Set tiers on the Tier not set tab.`}
			/>
		{/key}
	{:else}
		<section class="space-y-3">
			<p class="text-sm text-muted-foreground">
				A student needs a tier before their marks can go in. They have no mark columns until then
				and cannot have a report.
			</p>
			{#if sheet.notSet.length === 0}
				<p class="rounded-md border px-3 py-6 text-sm text-muted-foreground">
					Every student has a tier.
				</p>
			{:else}
				<div class="flex flex-wrap items-center gap-2">
					<span class="text-xs text-muted-foreground">
						{selected.length > 0
							? `${selected.length} selected`
							: 'Select students to move several at once'}
					</span>
					{#each [0, 1] as const as t (t)}
						<Button
							size="xs"
							variant="outline"
							disabled={selected.length === 0}
							onclick={() => bulk(t)}
						>
							Move to {sheet.tierLabel(t)}
						</Button>
					{/each}
				</div>
				<div class="w-fit rounded-xl border">
					<table class="text-sm">
						<thead>
							<tr class="border-b text-xs">
								<th class="px-2 py-1.5">
									<Checkbox
										checked={selected.length === sheet.notSet.length}
										indeterminate={selected.length > 0 && selected.length < sheet.notSet.length}
										onCheckedChange={(on) => (selected = on ? sheet.notSet.map((s) => s.id) : [])}
										aria-label="Select all"
									/>
								</th>
								<th class="px-2 text-left">Student</th>
								<th class="px-2 text-left" colspan="2">Tier</th>
							</tr>
						</thead>
						<tbody>
							{#each sheet.notSet as student (student.id)}
								<tr class="border-b last:border-0">
									<td class="px-2 py-1">
										<Checkbox
											checked={selected.includes(student.id)}
											onCheckedChange={(on) => toggle(student.id, on)}
											aria-label={`Select ${sheet.studentName(student)}`}
										/>
									</td>
									<td class="px-2">
										<span class="flex items-center gap-2">
											{sheet.studentName(student)}
											<OffTierBadge {student} />
										</span>
									</td>
									{#each [0, 1] as const as t (t)}
										<td class="px-1 py-1">
											<Button
												size="xs"
												variant="outline"
												onclick={() => {
													sheet.setTier(student.id, t);
													selected = selected.filter((x) => x !== student.id);
												}}
											>
												{sheet.tierLabel(t)}
											</Button>
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	{/if}
</main>

{#if tier !== null}
	<Dialog.Root bind:open={boundariesOpen}>
		<Dialog.Content class="sm:max-w-sm">
			<Dialog.Header>
				<Dialog.Title>Grade boundaries · {sheet.tierLabel(tier)}</Dialog.Title>
			</Dialog.Header>
			{#if boundariesOpen}
				<BoundariesEditor {tier} onDone={() => (boundariesOpen = false)} />
			{/if}
		</Dialog.Content>
	</Dialog.Root>
{/if}
