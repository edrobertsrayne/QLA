<!--
	PROTOTYPE — Variant A: toolbar above the grid, two-row grouped header (question → leaf),
	frozen name+absent block, inline banner for paste feedback, dedicated "entry by question" mode.
-->
<script lang="ts">
	import type { GridEngine } from '$lib/prototypes/marksheet-grid/grid-state.svelte.js';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import ListIcon from '@lucide/svelte/icons/list';
	import ColumnsIcon from '@lucide/svelte/icons/columns-3';
	import SquareIcon from '@lucide/svelte/icons/square';
	import SquareCheckIcon from '@lucide/svelte/icons/square-check';

	let { engine }: { engine: GridEngine } = $props();

	let entryMode = $state<'full' | 'byQuestion'>('full');
	let proxyEl = $state<HTMLElement | null>(null);
	$effect(() => {
		engine.proxyEl = proxyEl;
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
		entryMode === 'byQuestion' && groups[currentGroupIndex]
			? groups[currentGroupIndex]
			: { start: 0, end: engine.leaves.length - 1 }
	);

	const visibleGroups = $derived(
		groups.filter((g) => g.start <= visible.end && g.end >= visible.start)
	);

	function gotoQuestion(delta: number) {
		const idx = Math.max(0, Math.min(groups.length - 1, currentGroupIndex + delta));
		engine.cursor = { ...engine.cursor, col: groups[idx].start };
		engine.focusProxy();
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
	<div class="mx-auto max-w-[1400px] px-4">
		<h1 class="text-lg font-semibold">Marksheet — Variant A</h1>
		<p class="mb-3 text-sm text-muted-foreground">
			Toolbar + two-row grouped header · frozen name/absent block · inline paste banner.
		</p>

		<div class="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2">
			<button
				type="button"
				class="flex items-center gap-1.5 rounded-full border border-border bg-input/30 px-3 py-1.5 text-sm hover:bg-input/50"
				onclick={() => (entryMode = entryMode === 'full' ? 'byQuestion' : 'full')}
			>
				{#if entryMode === 'full'}
					<ColumnsIcon class="size-3.5" /> Full grid
				{:else}
					<ListIcon class="size-3.5" /> By question
				{/if}
			</button>
			{#if entryMode === 'byQuestion'}
				<div class="flex items-center gap-1 text-sm">
					<button
						type="button"
						class="flex size-7 items-center justify-center rounded-full border border-border hover:bg-input/30"
						onclick={() => gotoQuestion(-1)}
						aria-label="Previous question"><ChevronLeftIcon class="size-4" /></button
					>
					<span class="min-w-24 text-center font-medium"
						>Question {groups[currentGroupIndex]?.question}</span
					>
					<button
						type="button"
						class="flex size-7 items-center justify-center rounded-full border border-border hover:bg-input/30"
						onclick={() => gotoQuestion(1)}
						aria-label="Next question"><ChevronRightIcon class="size-4" /></button
					>
				</div>
			{/if}
			<div class="ml-auto text-xs text-muted-foreground">
				{engine.students.length} students · {engine.leaves.length} marked leaves · click the name column
				then paste to add students
			</div>
		</div>

		{#if engine.message}
			<div
				class={`mb-2 flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${engine.message.tone === 'warn' ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'border-border bg-muted/50'}`}
			>
				<span>{engine.message.text}</span>
				<button type="button" class="text-xs underline" onclick={() => engine.dismissMessage()}
					>dismiss</button
				>
			</div>
		{/if}

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
			class="overflow-x-auto rounded-lg border border-border"
			role="grid"
			aria-rowcount={engine.students.length + 2}
		>
			<table class="border-collapse text-sm">
				<thead>
					<tr>
						<th class="sticky left-0 z-20 w-48 border-b border-border bg-card"></th>
						{#each visibleGroups as g (g.question)}
							<th
								class="border-b border-l border-border bg-muted/60 px-2 py-1 text-center text-xs font-semibold"
								colspan={Math.min(g.end, visible.end) - Math.max(g.start, visible.start) + 1}
							>
								Q{g.question}
							</th>
						{/each}
					</tr>
					<tr>
						<th
							class="sticky left-0 z-20 w-48 border-b border-border bg-card px-2 py-1.5 text-left text-xs"
						>
							Student
						</th>
						{#each engine.leaves.slice(visible.start, visible.end + 1) as leaf (leaf.id)}
							<th
								class="w-24 border-b border-l border-border bg-muted/30 px-1.5 py-1.5 align-top text-left"
							>
								<div class="text-xs font-semibold">
									{leaf.id}
									<span class="font-normal text-muted-foreground">/{leaf.marks ?? '?'}</span>
								</div>
								<div class="mt-0.5 truncate text-[10px] text-muted-foreground" title={leaf.summary}>
									{leaf.summary}
								</div>
								<div class="mt-0.5 flex gap-1">
									{#if leaf.specPoint}
										<span
											class="rounded bg-secondary px-1 text-[10px] text-secondary-foreground"
											title={leaf.specPoint}>{leaf.specPoint}</span
										>
									{/if}
									{#if leaf.ao}
										<span class="rounded bg-secondary px-1 text-[10px] text-secondary-foreground"
											>{leaf.ao}</span
										>
									{/if}
								</div>
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each engine.students as student, row (student.id)}
						<tr class={engine.isAbsent(student.id) ? 'opacity-50' : ''}>
							<td
								class={`sticky left-0 z-10 w-48 border-b border-border bg-card px-2 py-1 text-left ${engine.cursor.row === row && engine.cursor.col === -1 ? 'ring-2 ring-inset ring-primary' : ''}`}
								onclick={() => selectCell(row, -1)}
							>
								<div class="flex items-center gap-1.5">
									<button
										type="button"
										class="text-muted-foreground hover:text-foreground"
										title="Mark absent"
										onclick={(e) => {
											e.stopPropagation();
											engine.cursor = { ...engine.cursor, row };
											engine.toggleAbsentAtCursor();
										}}
									>
										{#if engine.isAbsent(student.id)}
											<SquareCheckIcon class="size-3.5" />
										{:else}
											<SquareIcon class="size-3.5" />
										{/if}
									</button>
									<span class={`truncate ${engine.isAbsent(student.id) ? 'line-through' : ''}`}
										>{student.name}</span
									>
								</div>
							</td>
							{#each engine.leaves.slice(visible.start, visible.end + 1) as leaf, i (leaf.id)}
								{@const col = visible.start + i}
								{@const value = engine.markAt(student.id, leaf.id)}
								{@const over = engine.isOverMax(student.id, leaf)}
								{@const flash = engine.flashKind(student.id, leaf.id)}
								{@const isEditing = engine.editing?.row === row && engine.editing?.col === col}
								{@const isSelected = engine.cursor.row === row && engine.cursor.col === col}
								<td
									class={`w-24 border-b border-l border-border px-1 py-0.5 text-center tabular-nums ${isSelected ? 'ring-2 ring-inset ring-primary' : ''} ${over ? 'bg-destructive/10 text-destructive' : ''} ${flash === 'reject' ? 'bg-destructive/30' : ''} ${flash === 'clamp' ? 'bg-amber-400/30' : ''}`}
									onclick={() => selectCell(row, col)}
									ondblclick={() => editCell(row, col)}
								>
									{#if isEditing}
										<input
											bind:this={editInputEl}
											class="w-full bg-transparent text-center outline-none"
											value={engine.editing?.value ?? ''}
											oninput={(e) =>
												engine.updateEditingValue((e.target as HTMLInputElement).value)}
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
	</div>
</div>
