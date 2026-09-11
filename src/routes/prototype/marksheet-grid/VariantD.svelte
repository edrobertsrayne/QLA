<!--
	PROTOTYPE — Variant D (round 2, from the user's round-1 verdict): C's tiny header with popover
	detail and frozen name + Done block, but the full grid is always visible (no paging). A thin
	question band sits above the leaf header. Roster tools live inline in the name column — no sidebar:
	type or F2/double-click to rename, a hover × to remove, an "Add student" row at the foot, and an
	explicit empty-roster state that takes a pasted column of names.
-->
<script lang="ts">
	import type { GridEngine } from '$lib/prototypes/marksheet-grid/grid-state.svelte.js';
	import * as Popover from '$lib/components/ui/popover';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';
	import UserXIcon from '@lucide/svelte/icons/user-x';
	import XIcon from '@lucide/svelte/icons/x';
	import ClipboardPasteIcon from '@lucide/svelte/icons/clipboard-paste';
	import Undo2Icon from '@lucide/svelte/icons/undo-2';

	let { engine }: { engine: GridEngine } = $props();

	let proxyEl = $state<HTMLElement | null>(null);
	let proxyFocused = $state(false);
	$effect(() => {
		engine.proxyEl = proxyEl;
	});
	$effect(() => {
		engine.allowNameEdit = true;
		return () => {
			engine.allowNameEdit = false;
		};
	});

	let cornerFlash = $state<{ text: string; tone: 'info' | 'warn' } | null>(null);
	let flashTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const msg = engine.message;
		if (!msg) return;
		cornerFlash = msg;
		clearTimeout(flashTimer);
		flashTimer = setTimeout(() => {
			cornerFlash = null;
			engine.dismissMessage();
		}, 5000);
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
	const groupStarts = $derived(new Set(groups.map((g) => g.start)));
	const cursorGroup = $derived(
		groups.find((g) => engine.cursor.col >= g.start && engine.cursor.col <= g.end)
	);
	const totalCols = $derived(engine.leaves.length + 2);

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
	function jumpToQuestion(start: number) {
		selectCell(engine.cursor.row, start);
	}
	function addStudent() {
		engine.commitEditing();
		engine.addStudent();
	}
	function focusEmptyPasteTarget() {
		engine.cursor = { row: 0, col: -1 };
		engine.focusProxy();
	}
	function commitIfStill(row: number, col: number) {
		// Guard: when Enter commits and a new edit opens on another row, the old input's blur
		// must not commit (and so discard) the new blank row.
		if (engine.editing?.row === row && engine.editing?.col === col) engine.commitEditing();
	}

	let editInputEl = $state<HTMLInputElement | null>(null);
	$effect(() => {
		const editing = engine.editing;
		if (!editing || !editInputEl) return;
		editInputEl.focus();
		if (editing.selectAll) editInputEl.select();
		else editInputEl.setSelectionRange(editInputEl.value.length, editInputEl.value.length);
	});

	const cellBase = 'border-b border-l border-border';
	const groupEdge = 'border-l-2 border-l-foreground/25';
</script>

<div class="min-h-screen bg-background pt-4 pb-40">
	<div class="mx-4">
		<h1 class="text-lg font-semibold">Marksheet — Variant D</h1>
		<p class="mb-3 text-sm text-muted-foreground">
			C's tiny header, whole paper visible · question band on top · roster tools inline in the name
			column · corner-flash feedback with undo.
		</p>
		<div class="mb-2 flex items-center gap-3 text-xs text-muted-foreground">
			<span>{engine.students.length} students · {engine.leaves.length} leaves</span>
			<span class="hidden md:inline">
				Name column: type to rename · F2 or double-click to edit · paste a column of names
			</span>
		</div>
	</div>

	<div
		bind:this={proxyEl}
		contenteditable="true"
		role="application"
		aria-label="Marksheet grid input proxy"
		class="absolute h-px w-px overflow-hidden opacity-0"
		onkeydown={(e) => engine.handleKeydown(e)}
		onpaste={(e) => engine.handlePaste(e)}
		onfocus={() => (proxyFocused = true)}
		onblur={() => (proxyFocused = false)}
	></div>

	<div class="mx-4 overflow-x-auto rounded-lg border border-border" role="grid">
		<table class="border-collapse text-sm">
			<thead>
				<tr>
					<th class="sticky left-0 z-20 w-44 max-w-44 min-w-44 border-b border-border bg-card"></th>
					<th class="sticky left-44 z-20 w-14 min-w-14 border-b border-l border-border bg-card"
					></th>
					{#each groups as g (g.question)}
						<th
							colspan={g.end - g.start + 1}
							class={`border-b border-border px-0 py-0.5 text-[11px] font-semibold ${groupEdge} ${cursorGroup === g ? 'bg-primary/15 text-foreground' : 'bg-muted/50 text-muted-foreground'}`}
						>
							<button
								type="button"
								class="w-full hover:underline"
								title={`Jump to question ${g.question}`}
								onclick={() => jumpToQuestion(g.start)}>Q{g.question}</button
							>
						</th>
					{/each}
				</tr>
				<tr>
					<th
						class="sticky left-0 z-20 w-44 max-w-44 min-w-44 border-b border-border bg-card px-2 text-left text-xs font-medium"
						>Student</th
					>
					<th
						class="sticky left-44 z-20 w-14 min-w-14 border-b border-l border-border bg-card text-xs font-medium"
						>Done</th
					>
					{#each engine.leaves as leaf, col (leaf.id)}
						<th
							class={`w-10 min-w-10 border-b border-l border-border px-0 py-0.5 ${groupStarts.has(col) ? groupEdge : ''} ${engine.cursor.col === col ? 'bg-primary/15' : 'bg-muted/30'}`}
						>
							<Popover.Root>
								<Popover.Trigger>
									{#snippet child({ props })}
										<button
											{...props}
											type="button"
											class="flex w-full flex-col items-center text-[11px] leading-tight font-semibold hover:underline"
										>
											<span>{leaf.id}</span>
											<span class="font-normal text-muted-foreground">/{leaf.marks ?? '?'}</span>
										</button>
									{/snippet}
								</Popover.Trigger>
								<Popover.Content class="w-56 text-xs">
									<p class="mb-1 font-medium">{leaf.id} — {leaf.summary}</p>
									<dl class="space-y-0.5 text-muted-foreground">
										<div>
											<dt class="inline font-medium text-foreground">Max:</dt>
											<dd class="inline">{leaf.marks ?? 'unknown'}</dd>
										</div>
										<div>
											<dt class="inline font-medium text-foreground">Specification point:</dt>
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
				{#if engine.students.length === 0}
					<tr>
						<td colspan={totalCols} class="p-0">
							<div class="sticky left-0 flex w-[min(calc(100vw-2rem),44rem)] flex-col gap-3 p-6">
								<p class="text-sm font-medium">No students on this marksheet yet.</p>
								<button
									type="button"
									class={`flex items-center gap-3 rounded-lg border-2 border-dashed px-4 py-5 text-left ${proxyFocused ? 'border-primary bg-primary/5' : 'border-border hover:border-foreground/40'}`}
									onclick={focusEmptyPasteTarget}
								>
									<ClipboardPasteIcon class="size-6 shrink-0 text-muted-foreground" />
									<span class="text-sm">
										{#if proxyFocused}
											<strong>Ready — press Ctrl+V</strong> to paste a column of names (one per row),
											or just start typing a name.
										{:else}
											<strong>Click here, then paste</strong> a column of names copied from your class
											list or spreadsheet.
										{/if}
									</span>
								</button>
								<button
									type="button"
									class="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
									onclick={addStudent}
								>
									<UserPlusIcon class="size-4" /> Or add students one at a time
								</button>
							</div>
						</td>
					</tr>
				{/if}
				{#each engine.students as student, row (student.id)}
					{@const absent = engine.isAbsent(student.id)}
					{@const nameSelected = engine.cursor.row === row && engine.cursor.col === -1}
					{@const nameEditing = engine.editing?.row === row && engine.editing?.col === -1}
					<tr class={engine.cursor.row === row ? 'bg-muted/30' : ''}>
						<td
							class={`group sticky left-0 z-10 w-44 max-w-44 min-w-44 border-b border-border bg-card px-1.5 py-0.5 text-left ${nameSelected ? 'ring-2 ring-primary ring-inset' : ''}`}
							onclick={() => selectCell(row, -1)}
							ondblclick={() => editCell(row, -1)}
						>
							<div class="flex items-center gap-1">
								<button
									type="button"
									class={`shrink-0 rounded p-0.5 ${absent ? 'text-destructive' : 'text-muted-foreground/40 hover:text-foreground'}`}
									title={absent ? 'Absent — click to mark present' : 'Mark absent'}
									onclick={(e) => {
										e.stopPropagation();
										engine.cursor = { ...engine.cursor, row };
										engine.toggleAbsentAtCursor();
									}}><UserXIcon class="size-3.5" /></button
								>
								{#if nameEditing}
									<input
										bind:this={editInputEl}
										class="min-w-0 flex-1 rounded-sm bg-background px-1 outline-none"
										placeholder="Type a name, Enter for next"
										value={engine.editing?.value ?? ''}
										oninput={(e) => engine.updateEditingValue((e.target as HTMLInputElement).value)}
										onkeydown={(e) => engine.handleKeydown(e)}
										onblur={() => commitIfStill(row, -1)}
									/>
								{:else}
									<span
										class={`min-w-0 flex-1 truncate ${absent ? 'text-muted-foreground line-through' : ''}`}
										>{student.name}</span
									>
									<button
										type="button"
										class="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
										title={`Remove ${student.name}`}
										onclick={(e) => {
											e.stopPropagation();
											engine.removeStudent(row);
											engine.focusProxy();
										}}><XIcon class="size-3.5" /></button
									>
								{/if}
							</div>
						</td>
						<td
							class="sticky left-44 z-10 w-14 min-w-14 border-b border-l border-border bg-card px-1 text-center text-xs text-muted-foreground tabular-nums"
						>
							{absent ? 'absent' : progress(student.id)}
						</td>
						{#each engine.leaves as leaf, col (leaf.id)}
							{@const value = engine.markAt(student.id, leaf.id)}
							{@const over = engine.isOverMax(student.id, leaf)}
							{@const flash = engine.flashKind(student.id, leaf.id)}
							{@const isEditing = engine.editing?.row === row && engine.editing?.col === col}
							{@const isSelected = engine.cursor.row === row && engine.cursor.col === col}
							<td
								class={`w-10 min-w-10 ${cellBase} px-0 py-0.5 text-center tabular-nums ${groupStarts.has(col) ? groupEdge : ''} ${isSelected ? 'ring-2 ring-primary ring-inset' : ''} ${over ? 'bg-destructive/10 font-semibold text-destructive' : ''} ${flash === 'reject' ? 'bg-destructive/30' : ''} ${flash === 'clamp' ? 'bg-amber-400/30' : ''} ${absent ? 'bg-muted/60' : ''}`}
								title={over
									? `Over max: ${value} entered, question allows ${leaf.marks}`
									: undefined}
								onclick={() => selectCell(row, col)}
								ondblclick={() => editCell(row, col)}
							>
								{#if isEditing}
									<input
										bind:this={editInputEl}
										class="w-full bg-transparent text-center outline-none"
										value={engine.editing?.value ?? ''}
										oninput={(e) => engine.updateEditingValue((e.target as HTMLInputElement).value)}
										onkeydown={(e) => engine.handleKeydown(e)}
										onblur={() => commitIfStill(row, col)}
									/>
								{:else}
									{value ?? ''}
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
				{#if engine.students.length > 0}
					<tr>
						<td class="sticky left-0 z-10 w-44 max-w-44 min-w-44 bg-card px-1.5 py-1">
							<button
								type="button"
								class="flex items-center gap-1.5 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
								onclick={addStudent}
							>
								<UserPlusIcon class="size-3.5" /> Add student
							</button>
						</td>
						<td colspan={totalCols - 1}></td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>

	{#if cornerFlash}
		<div
			class={`fixed top-3 right-3 z-30 flex max-w-80 items-start gap-2 rounded-lg border bg-card px-3 py-2 text-xs shadow-lg ${cornerFlash.tone === 'warn' ? 'border-amber-500/60' : 'border-border'}`}
		>
			<span class="flex-1">{cornerFlash.text}</span>
			{#if engine.canUndo}
				<button
					type="button"
					class="flex shrink-0 items-center gap-1 font-medium text-primary hover:underline"
					onclick={() => engine.undo()}><Undo2Icon class="size-3" /> Undo</button
				>
			{/if}
		</div>
	{/if}
</div>
