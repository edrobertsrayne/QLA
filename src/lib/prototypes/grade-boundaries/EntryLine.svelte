<!--
	PROTOTYPE (#55) — dialog entry 3: the boundaries on a line from 0 to the paper total,
	with every fully-marked student as a dot at their total. Drag a marker, or type its
	mark in the row under the line. A marker can't pass its neighbours, so the order
	can't go wrong. Starts from a scale with evenly spaced marks.
-->
<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { cn } from '$lib/utils';
	import { SCALES, classTotals, draftIssues, paperTotal, type Draft } from './grades.svelte.js';

	let { draft }: { draft: Draft } = $props();

	const total = $derived(paperTotal());
	const issues = $derived(draftIssues(draft));
	const totals = $derived(classTotals());
	let track = $state<HTMLDivElement>();
	let dragging = $state<number | null>(null);

	const num = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : null);
	const pct = (mark: number) => `${(mark / total) * 100}%`;

	/** Dots stacked where totals collide, so a crowded mark reads as a column. */
	const dots = $derived.by(() => {
		const seen: Record<number, number> = {};
		return totals.map((t) => ({ ...t, stack: (seen[t.total] = (seen[t.total] ?? -1) + 1) }));
	});
	const tallest = $derived(Math.max(1, ...dots.map((d) => d.stack + 1)));

	function seed(labels: string[]) {
		const n = labels.length;
		// Evenly between 85% and 20% of the paper: a start to drag from, not a guess.
		draft.rows = labels.map((label, i) => ({
			label,
			min: String(Math.round(total * (0.85 - (0.65 * i) / Math.max(1, n - 1))))
		}));
	}

	function markAt(clientX: number): number {
		const box = track!.getBoundingClientRect();
		return Math.round(Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * total);
	}

	function onMove(event: PointerEvent) {
		if (dragging === null) return;
		const i = dragging;
		const above = i > 0 ? num(draft.rows[i - 1].min) : null;
		const below = i < draft.rows.length - 1 ? num(draft.rows[i + 1].min) : null;
		let mark = markAt(event.clientX);
		if (above !== null) mark = Math.min(mark, above - 1);
		if (below !== null) mark = Math.max(mark, below + 1);
		draft.rows[i].min = String(Math.max(0, Math.min(total, mark)));
	}

	function addBelow() {
		const lowest = num(draft.rows.at(-1)?.min ?? '') ?? total;
		draft.rows.push({ label: '', min: String(Math.max(0, lowest - Math.ceil(total / 10))) });
	}
</script>

<svelte:window onpointermove={onMove} onpointerup={() => (dragging = null)} />

<div class="space-y-4 text-sm">
	{#if draft.rows.length === 0}
		<p class="text-muted-foreground">Start from a scale, then drag the markers into place.</p>
		<div class="flex flex-wrap gap-1.5">
			{#each SCALES as s (s.name)}
				<Button variant="outline" size="sm" onclick={() => seed(s.labels)}>{s.name}</Button>
			{/each}
			<Button variant="outline" size="sm" onclick={() => seed(['', ''])}>Custom</Button>
		</div>
	{:else}
		<div class="px-3 pt-2">
			<!-- the class, one dot per fully-marked student at their total -->
			<div class="relative" style="height: {tallest * 9 + 4}px">
				{#each dots as d (d.name)}
					<span
						class="absolute size-2 -translate-x-1/2 rounded-full bg-foreground/60"
						style="left: {pct(d.total)}; bottom: {d.stack * 9}px"
						title="{d.name}: {d.total}"
					></span>
				{/each}
			</div>
			<!-- the bands and the markers -->
			<div bind:this={track} class="relative h-8 rounded bg-muted">
				{#each draft.rows as row, i (i)}
					{@const min = num(row.min)}
					{@const top = i === 0 ? total : num(draft.rows[i - 1].min)}
					{#if min !== null && top !== null && top >= min}
						<div
							class={cn(
								'absolute inset-y-0 flex items-center justify-center overflow-hidden text-xs font-semibold',
								i % 2 === 0 ? 'bg-primary/25' : 'bg-primary/10'
							)}
							style="left: {pct(min)}; width: {pct(top - min)}"
						>
							{row.label}
						</div>
					{/if}
				{/each}
				{#each draft.rows as row, i (i)}
					{@const min = num(row.min)}
					{#if min !== null}
						<button
							type="button"
							class={cn(
								'absolute -inset-y-1 w-3 -translate-x-1/2 cursor-ew-resize rounded-sm bg-primary ring-2 ring-background',
								dragging === i && 'scale-125'
							)}
							style="left: {pct(min)}"
							aria-label="Drag boundary for {row.label || `grade ${i + 1}`}"
							onpointerdown={(e) => {
								e.preventDefault();
								dragging = i;
							}}
						></button>
					{/if}
				{/each}
			</div>
			<div class="mt-1 flex justify-between text-[10px] text-muted-foreground tabular-nums">
				<span>0</span><span>{Math.round(total / 2)}</span><span>{total}</span>
			</div>
		</div>

		<div class="flex flex-wrap items-start gap-2">
			{#each draft.rows as row, i (i)}
				{@const rowIssues = issues.filter((x) => x.index === i)}
				<div class="w-20 space-y-1 rounded-md border p-1.5">
					<div class="flex items-center gap-1">
						<Input
							class={cn(
								'h-7 px-1 font-semibold',
								rowIssues.some((x) => x.field === 'label') && 'border-destructive'
							)}
							bind:value={row.label}
							aria-label="Grade {i + 1}"
						/>
						<button
							type="button"
							class="text-muted-foreground hover:text-foreground"
							aria-label="Remove grade"
							onclick={() => draft.rows.splice(i, 1)}
						>
							<XIcon class="size-3" />
						</button>
					</div>
					<Input
						class={cn(
							'h-7 px-1 tabular-nums',
							rowIssues.some((x) => x.field === 'min') && 'border-destructive'
						)}
						inputmode="numeric"
						bind:value={row.min}
						aria-label="Lowest mark for {row.label}"
					/>
					{#if rowIssues.length > 0}
						<p class="text-[10px] leading-tight text-destructive">
							{rowIssues.map((x) => x.message).join('; ')}
						</p>
					{/if}
				</div>
			{/each}
			<div class="w-20 space-y-1 rounded-md border border-dashed p-1.5">
				<Input
					class="h-7 px-1"
					bind:value={draft.below}
					aria-label="Label below the lowest grade"
				/>
				<p class="text-[10px] text-muted-foreground">below the rest</p>
			</div>
			<Button variant="ghost" size="xs" class="self-center" onclick={addBelow}>
				<PlusIcon class="size-3.5" /> Grade
			</Button>
		</div>
		<p class="text-xs text-muted-foreground">
			Raw marks out of {total}. Each dot is a fully-marked student at their total.
		</p>
	{/if}
</div>
