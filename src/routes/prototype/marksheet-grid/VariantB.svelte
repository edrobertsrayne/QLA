<!--
	PROTOTYPE — Variant B: rotated single-row header, frozen name column only (absent merged into
	the name cell), roster tools live in a right-hand side rail, fill mini-map strip up top,
	toast feedback instead of a banner. Deliberately always a scrolling surface — no "fit" toggle.
-->
<script lang="ts">
	import type { GridEngine } from '$lib/prototypes/marksheet-grid/grid-state.svelte.js';
	import { toast } from 'svelte-sonner';
	import PanelRightIcon from '@lucide/svelte/icons/panel-right';
	import UserXIcon from '@lucide/svelte/icons/user-x';

	let { engine }: { engine: GridEngine } = $props();

	let proxyEl = $state<HTMLElement | null>(null);
	$effect(() => {
		engine.proxyEl = proxyEl;
	});

	let railOpen = $state(true);
	let pasteNamesText = $state('');

	$effect(() => {
		const msg = engine.message;
		if (!msg) return;
		if (msg.tone === 'warn') toast.warning(msg.text);
		else toast(msg.text);
		engine.dismissMessage();
	});

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

	function fillRatio(leaf: (typeof engine.leaves)[number]) {
		if (!engine.students.length) return 0;
		let n = 0;
		for (const s of engine.students) if (engine.markAt(s.id, leaf.id) != null) n++;
		return n / engine.students.length;
	}

	function applyPastedNames() {
		const names = pasteNamesText
			.split('\n')
			.map((n) => n.trim())
			.filter(Boolean);
		engine.students = names.map((name, i) => ({
			id: engine.students[i]?.id ?? `s-rail-${i}`,
			name
		}));
		pasteNamesText = '';
		engine.message = {
			text: `Set roster to ${names.length} students from the side rail.`,
			tone: 'info'
		};
	}

	function removeStudent(id: string) {
		engine.students = engine.students.filter((s) => s.id !== id);
	}
</script>

<div class="flex min-h-screen bg-background">
	<div class="flex-1 overflow-hidden pt-4 pb-24">
		<div class="px-4">
			<h1 class="text-lg font-semibold">Marksheet — Variant B</h1>
			<p class="mb-3 text-sm text-muted-foreground">
				Rotated header · side rail for roster tools · fill mini-map · toast feedback.
			</p>

			<div class="mb-1 flex h-1.5 overflow-hidden rounded-full border border-border">
				{#each engine.leaves as leaf (leaf.id)}
					<div
						class="flex-1 bg-primary"
						style={`opacity:${0.15 + fillRatio(leaf) * 0.85}`}
						title={`${leaf.id}: ${Math.round(fillRatio(leaf) * 100)}% marked`}
					></div>
				{/each}
			</div>
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
						<th class="sticky left-0 z-20 w-44 border-b border-border bg-card"></th>
						{#each engine.leaves as leaf (leaf.id)}
							<th
								class="h-28 w-10 border-b border-l border-border bg-muted/30 align-bottom px-0.5 pb-1"
							>
								<div
									class="flex origin-bottom-left translate-x-3 -rotate-45 items-center gap-1 whitespace-nowrap text-[11px]"
								>
									<span class="font-semibold">{leaf.id}</span>
									<span class="text-muted-foreground">/{leaf.marks ?? '?'}</span>
									{#if leaf.specPoint}<span class="text-muted-foreground">· {leaf.specPoint}</span
										>{/if}
								</div>
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each engine.students as student, row (student.id)}
						<tr class={engine.isAbsent(student.id) ? 'opacity-50' : ''}>
							<td
								class={`sticky left-0 z-10 w-44 border-b border-border bg-card px-2 py-1 text-left ${engine.cursor.row === row && engine.cursor.col === -1 ? 'ring-2 ring-inset ring-primary' : ''}`}
								onclick={() => selectCell(row, -1)}
							>
								<div class="flex items-center justify-between gap-1">
									<span class={`truncate ${engine.isAbsent(student.id) ? 'line-through' : ''}`}
										>{student.name}</span
									>
									<button
										type="button"
										class="text-muted-foreground hover:text-destructive"
										title="Toggle absent"
										onclick={(e) => {
											e.stopPropagation();
											engine.cursor = { ...engine.cursor, row };
											engine.toggleAbsentAtCursor();
										}}
									>
										<UserXIcon class="size-3.5" />
									</button>
								</div>
							</td>
							{#each engine.leaves as leaf, col (leaf.id)}
								{@const value = engine.markAt(student.id, leaf.id)}
								{@const over = engine.isOverMax(student.id, leaf)}
								{@const flash = engine.flashKind(student.id, leaf.id)}
								{@const isEditing = engine.editing?.row === row && engine.editing?.col === col}
								{@const isSelected = engine.cursor.row === row && engine.cursor.col === col}
								<td
									class={`w-10 border-b border-l border-border px-0.5 py-0.5 text-center tabular-nums ${isSelected ? 'ring-2 ring-inset ring-primary' : ''} ${over ? 'bg-destructive/10 text-destructive' : ''} ${flash === 'reject' ? 'bg-destructive/30' : ''} ${flash === 'clamp' ? 'bg-amber-400/30' : ''}`}
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

	<button
		type="button"
		class="fixed top-3 right-3 z-30 flex size-8 items-center justify-center rounded-full border border-border bg-card shadow"
		onclick={() => (railOpen = !railOpen)}
		aria-label="Toggle roster rail"
	>
		<PanelRightIcon class="size-4" />
	</button>

	{#if railOpen}
		<aside class="w-64 shrink-0 border-l border-border bg-card p-3 pt-14 text-sm">
			<h2 class="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
				Roster
			</h2>
			<p class="mb-1 text-xs text-muted-foreground">
				Paste one name per line to replace the roster:
			</p>
			<textarea
				class="mb-1.5 h-24 w-full rounded border border-border bg-input/20 p-1.5 text-xs"
				bind:value={pasteNamesText}
				placeholder="Ava Chen&#10;Noah Patel&#10;…"></textarea>
			<button
				type="button"
				class="mb-3 w-full rounded border border-border py-1 text-xs hover:bg-input/30"
				onclick={applyPastedNames}
			>
				Apply roster
			</button>
			<h2 class="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
				Students ({engine.students.length})
			</h2>
			<ul class="max-h-64 space-y-0.5 overflow-y-auto">
				{#each engine.students as s (s.id)}
					<li class="flex items-center justify-between gap-1 rounded px-1 py-0.5 hover:bg-muted/50">
						<span class="truncate">{s.name}</span>
						<button
							type="button"
							class="text-muted-foreground hover:text-destructive"
							onclick={() => removeStudent(s.id)}>×</button
						>
					</li>
				{/each}
			</ul>
		</aside>
	{/if}
</div>
