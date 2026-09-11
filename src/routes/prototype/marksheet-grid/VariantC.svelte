<!--
	PROTOTYPE — Variant C: entry-by-question is the primary frame (a question rail pages the grid),
	tiny single-row header with details in a popover, frozen name+progress+absent block,
	paste feedback as a corner flash rather than a banner or toast.
-->
<script lang="ts">
	import type { GridEngine } from '$lib/prototypes/marksheet-grid/grid-state.svelte.js';
	import * as Popover from '$lib/components/ui/popover';
	import GridIcon from '@lucide/svelte/icons/grid-3x3';
	import RowsIcon from '@lucide/svelte/icons/rows-3';

	let { engine }: { engine: GridEngine } = $props();

	let proxyEl = $state<HTMLElement | null>(null);
	$effect(() => {
		engine.proxyEl = proxyEl;
	});

	let paged = $state(true);
	let cornerFlash = $state<string | null>(null);
	let flashTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		const msg = engine.message;
		if (!msg) return;
		cornerFlash = msg.text;
		clearTimeout(flashTimer);
		flashTimer = setTimeout(() => {
			cornerFlash = null;
			engine.dismissMessage();
		}, 3200);
	});

	const groups = $derived.by(() => {
		const out: { question: string; start: number; end: number }[] = [];
		let start = 0;
		while (start < engine.leaves.length) {
			const q = engine.leaves[start].id.match(/^\d+/)?.[0] ?? engine.leaves[start].id;
			let end = start;
			while (
				end + 1 < engine.leaves.length &&
				(engine.leaves[end + 1].id.match(/^\d+/)?.[0] ?? '') === q
			) {
				end++;
			}
			out.push({ question: q, start, end });
			start = end + 1;
		}
		return out;
	});
	const currentGroupIndex = $derived(
		Math.max(
			0,
			groups.findIndex((g) => engine.cursor.col >= g.start && engine.cursor.col <= g.end)
		)
	);
	const visible = $derived(
		paged && groups[currentGroupIndex]
			? groups[currentGroupIndex]
			: { start: 0, end: engine.leaves.length - 1 }
	);

	function gotoGroup(idx: number) {
		engine.cursor = { ...engine.cursor, col: groups[idx].start };
		engine.focusProxy();
	}

	function progress(studentId: string) {
		let n = 0;
		for (const leaf of engine.leaves) if (engine.markAt(studentId, leaf.id) != null) n++;
		return `${n}/${engine.leaves.length}`;
	}

	function selectCell(row: number, col: number) {
		engine.commitEditing();
		engine.cursor = { row, col };
		engine.focusProxy();
	}
	function editCell(row: number, col: number) {
		selectCell(row, col);
		engine.startEditingBlank();
	}
	function onProxyKeydown(e: KeyboardEvent) {
		engine.handleKeydown(e);
	}
	function onInputKeydown(e: KeyboardEvent) {
		engine.handleKeydown(e);
	}
	let editInputEl = $state<HTMLInputElement | null>(null);
	$effect(() => {
		if (engine.editing && editInputEl) {
			editInputEl.focus();
			editInputEl.select();
		}
	});
</script>

<div class="min-h-screen bg-background pt-4 pb-24">
	<div class="mx-4">
		<h1 class="text-lg font-semibold">Marksheet — Variant C</h1>
		<p class="mb-3 text-sm text-muted-foreground">
			Question-paged primary view · tiny header with popover detail · corner-flash paste feedback.
		</p>

		<div class="mb-2 flex items-center gap-2">
			<button
				type="button"
				class="flex items-center gap-1.5 rounded-full border border-border bg-input/30 px-3 py-1.5 text-sm hover:bg-input/50"
				onclick={() => (paged = !paged)}
			>
				{#if paged}<GridIcon class="size-3.5" /> Show full grid{:else}<RowsIcon class="size-3.5" /> Page
					by question{/if}
			</button>
			<div class="text-xs text-muted-foreground">
				{engine.students.length} students · {engine.leaves.length} leaves
			</div>
		</div>

		{#if paged}
			<div class="mb-2 flex flex-wrap gap-1">
				{#each groups as g, i (g.question)}
					<button
						type="button"
						class={`rounded-full border px-2.5 py-1 text-xs font-medium ${i === currentGroupIndex ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-muted/40 hover:bg-muted'}`}
						onclick={() => gotoGroup(i)}
					>
						Q{g.question}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<div
		bind:this={proxyEl}
		contenteditable="true"
		role="application"
		aria-label="Marksheet grid input proxy"
		class="absolute h-px w-px overflow-hidden opacity-0"
		onkeydown={onProxyKeydown}
		onpaste={(e) => engine.handlePaste(e)}
	></div>

	<div
		class="mx-4 overflow-x-auto rounded-lg border border-border"
		role="grid"
		aria-rowcount={engine.students.length + 1}
	>
		<table class="border-collapse text-sm">
			<thead>
				<tr>
					<th class="sticky left-0 z-20 w-40 border-b border-border bg-card"></th>
					<th class="sticky left-40 z-20 w-16 border-b border-l border-border bg-card text-xs"
						>Done</th
					>
					{#each engine.leaves.slice(visible.start, visible.end + 1) as leaf (leaf.id)}
						<th class="w-14 border-b border-l border-border bg-muted/30 px-0.5 py-1">
							<Popover.Root>
								<Popover.Trigger>
									{#snippet child({ props })}
										<button
											{...props}
											type="button"
											class="flex w-full flex-col items-center text-xs font-semibold hover:underline"
										>
											<span>{leaf.id}</span>
											<span class="font-normal text-muted-foreground">/{leaf.marks ?? '?'}</span>
										</button>
									{/snippet}
								</Popover.Trigger>
								<Popover.Content class="w-56 text-xs">
									<p class="mb-1 font-medium">{leaf.summary}</p>
									<dl class="space-y-0.5 text-muted-foreground">
										<div>
											<dt class="inline font-medium text-foreground">Max:</dt>
											<dd class="inline">{leaf.marks ?? 'unknown'}</dd>
										</div>
										<div>
											<dt class="inline font-medium text-foreground">Spec point:</dt>
											<dd class="inline">{leaf.specPoint ?? '—'}</dd>
										</div>
										<div>
											<dt class="inline font-medium text-foreground">AO:</dt>
											<dd class="inline">{leaf.ao ?? '—'}</dd>
										</div>
										<div>
											<dt class="inline font-medium text-foreground">Command word:</dt>
											<dd class="inline">{leaf.commandWord ?? '—'}</dd>
										</div>
									</dl>
								</Popover.Content>
							</Popover.Root>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each engine.students as student, row (student.id)}
					<tr class={engine.isAbsent(student.id) ? 'opacity-50' : ''}>
						<td
							class={`sticky left-0 z-10 w-40 border-b border-border bg-card px-2 py-1 text-left ${engine.cursor.row === row && engine.cursor.col === -1 ? 'ring-2 ring-inset ring-primary' : ''}`}
							onclick={() => selectCell(row, -1)}
						>
							<div class="flex items-center gap-1">
								<button
									type="button"
									class="text-muted-foreground"
									title="Toggle absent"
									onclick={(e) => {
										e.stopPropagation();
										engine.cursor = { ...engine.cursor, row };
										engine.toggleAbsentAtCursor();
									}}>{engine.isAbsent(student.id) ? '🚫' : '·'}</button
								>
								<span class="truncate">{student.name}</span>
							</div>
						</td>
						<td
							class="sticky left-40 z-10 w-16 border-b border-l border-border bg-card px-1 py-1 text-center text-xs text-muted-foreground tabular-nums"
						>
							{engine.isAbsent(student.id) ? '—' : progress(student.id)}
						</td>
						{#each engine.leaves.slice(visible.start, visible.end + 1) as leaf, i (leaf.id)}
							{@const col = visible.start + i}
							{@const value = engine.markAt(student.id, leaf.id)}
							{@const over = engine.isOverMax(student.id, leaf)}
							{@const flash = engine.flashKind(student.id, leaf.id)}
							{@const isEditing = engine.editing?.row === row && engine.editing?.col === col}
							{@const isSelected = engine.cursor.row === row && engine.cursor.col === col}
							<td
								class={`w-14 border-b border-l border-border px-0.5 py-0.5 text-center tabular-nums ${isSelected ? 'ring-2 ring-inset ring-primary' : ''} ${over ? 'bg-destructive/10 text-destructive' : ''} ${flash === 'reject' ? 'bg-destructive/30' : ''} ${flash === 'clamp' ? 'bg-amber-400/30' : ''}`}
								onclick={() => selectCell(row, col)}
								ondblclick={() => editCell(row, col)}
							>
								{#if isEditing}
									<input
										bind:this={editInputEl}
										class="w-full bg-transparent text-center outline-none"
										value={engine.editing?.value ?? ''}
										oninput={(e) => engine.updateEditingValue((e.target as HTMLInputElement).value)}
										onkeydown={onInputKeydown}
										onblur={() => engine.commitEditing()}
									/>
								{:else}
									{value ?? ''}
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if cornerFlash}
		<div
			class="fixed top-3 right-3 z-30 max-w-64 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg"
		>
			{cornerFlash}
		</div>
	{/if}
</div>
