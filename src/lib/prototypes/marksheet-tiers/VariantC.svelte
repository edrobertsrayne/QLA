<!--
	PROTOTYPE (#114) — Variant C: Stacked tiers.
	No toggle: both tiers are on the page at once, one section each, stacked. Each
	section is a whole marksheet for its tier — its own heading, Hardest strip,
	boundaries, marks export and grid — and folds away. Students with no tier wait
	in a tray above the sections as chips: pick some, send them to a tier. A row
	control sends a student back to the tray or across.
-->
<script lang="ts">
	import ArrowLeftRightIcon from '@lucide/svelte/icons/arrow-left-right';
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import FileSpreadsheetIcon from '@lucide/svelte/icons/file-spreadsheet';
	import UndoIcon from '@lucide/svelte/icons/undo-2';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import { cn } from '$lib/utils.js';
	import BoundariesEditor from './BoundariesEditor.svelte';
	import HardestStrip from './HardestStrip.svelte';
	import OffTierBadge from './OffTierBadge.svelte';
	import SheetHeader from './SheetHeader.svelte';
	import TierGrid from './TierGrid.svelte';
	import { tieredSheet, type Student, type TierIndex } from './sheet.svelte.js';

	const sheet = tieredSheet();
	let picked = $state<string[]>([]);
	let folded = $state<Record<number, boolean>>({});
	let boundariesOpen = $state<Record<number, boolean>>({});

	const summary = $derived(`${sheet.students.length} students · two tiers`);

	function send(t: TierIndex) {
		const ids = picked.length > 0 ? picked : sheet.notSet.map((s) => s.id);
		sheet.setTierMany(ids, t);
		picked = [];
	}
</script>

{#snippet rowControls(student: Student)}
	<OffTierBadge {student} />
	{#if student.tier !== null}
		{@const to = (student.tier === 0 ? 1 : 0) as TierIndex}
		<button
			type="button"
			class="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground"
			title={`Move to ${sheet.tierLabel(to)}`}
			onclick={() => sheet.setTier(student.id, to)}
		>
			<ArrowLeftRightIcon class="size-3.5" />
		</button>
		<button
			type="button"
			class="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground"
			title="Back to Tier not set"
			onclick={() => sheet.setTier(student.id, null)}
		>
			<UndoIcon class="size-3.5" />
		</button>
	{/if}
{/snippet}

<main class="mx-auto max-w-6xl space-y-6 p-6">
	<SheetHeader {summary} />

	<div class="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
		<p>
			{sheet.reportable} of {sheet.students.length} students are fully marked and can have a report
		</p>
		<div class="flex gap-2">
			<Button
				size="sm"
				variant="outline"
				onclick={() => toast('Would open Edit breakdown (both tiers)')}
			>
				Edit breakdown
			</Button>
			{#if sheet.reportable > 0}
				<Button size="sm" onclick={() => toast('Would open the report flow')}>Make reports</Button>
			{/if}
		</div>
	</div>

	{#if sheet.notSet.length > 0}
		<section class="space-y-2 rounded-xl border border-amber-500/50 bg-amber-500/5 p-3">
			<div class="flex flex-wrap items-center gap-2">
				<h2 class="text-sm font-semibold">Tier not set ({sheet.notSet.length})</h2>
				<p class="text-xs text-muted-foreground">
					No mark columns and no report until they have a tier. Pick names, or send everyone left.
				</p>
				<div class="ml-auto flex gap-2">
					{#each [0, 1] as const as t (t)}
						<Button size="xs" onclick={() => send(t)}>
							{picked.length > 0 ? `Send ${picked.length}` : 'Send all'} to {sheet.tierLabel(t)}
						</Button>
					{/each}
				</div>
			</div>
			<div class="flex flex-wrap gap-1.5">
				{#each sheet.notSet as student (student.id)}
					{@const on = picked.includes(student.id)}
					<button
						type="button"
						aria-pressed={on}
						class={cn(
							'flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs',
							on
								? 'border-primary bg-primary text-primary-foreground'
								: 'bg-background hover:bg-muted'
						)}
						onclick={() =>
							(picked = on ? picked.filter((x) => x !== student.id) : [...picked, student.id])}
					>
						{sheet.studentName(student)}
						<OffTierBadge {student} />
					</button>
				{/each}
			</div>
		</section>
	{/if}

	{#each [0, 1] as const as t (t)}
		{@const tier = sheet.tiers[t]}
		{@const on = sheet.studentsOn(t)}
		<section class="space-y-2">
			<div class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b pb-2">
				<button
					type="button"
					class="flex items-center gap-1 text-base font-semibold"
					onclick={() => (folded[t] = !folded[t])}
				>
					{#if folded[t]}<ChevronRightIcon class="size-4" />{:else}<ChevronDownIcon
							class="size-4"
						/>{/if}
					{sheet.tierLabel(t)}
				</button>
				<span class="text-sm text-muted-foreground">
					{on.length} students · {tier.entries.length} entries · {sheet.tierMarks(t)} marks
				</span>
				<div class="ml-auto flex items-center gap-2">
					<Popover.Root
						bind:open={() => boundariesOpen[t] ?? false, (v) => (boundariesOpen[t] = v)}
					>
						<Popover.Trigger>
							{#snippet child({ props })}
								<Button {...props} size="xs" variant="outline">
									{tier.boundaries
										? `Grade boundaries (${tier.boundaries.length})`
										: 'Set grade boundaries'}
								</Button>
							{/snippet}
						</Popover.Trigger>
						<Popover.Content class="w-72">
							{#if boundariesOpen[t]}
								<BoundariesEditor tier={t} onDone={() => (boundariesOpen[t] = false)} />
							{/if}
						</Popover.Content>
					</Popover.Root>
					<Button
						variant="outline"
						size="xs"
						onclick={() => toast(`Would open the ${tier.name} analysis`)}
					>
						<ChartColumnIcon class="size-3.5" /> Analysis
					</Button>
					<Button
						variant="outline"
						size="xs"
						onclick={() => toast(`Would download ${sheet.exportName('marks', t)}`)}
					>
						<FileSpreadsheetIcon class="size-3.5" /> Export marks (.csv)
					</Button>
				</div>
			</div>
			{#if !folded[t]}
				<HardestStrip tier={t} />
				<TierGrid
					tier={t}
					students={on}
					nameExtra={rowControls}
					emptyText="No students on this tier yet: send some from Tier not set."
				/>
			{/if}
		</section>
	{/each}
</main>
