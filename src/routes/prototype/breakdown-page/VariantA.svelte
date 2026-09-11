<!--
	PROTOTYPE Variant A — inline spreadsheet table.
	Every cell is always an editable control; rows banded by questionNumber; warnings as row icons;
	sticky footer summarises and opens a confirm dialog.
-->
<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Popover from '$lib/components/ui/popover';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import { AO_OPTIONS, type BreakdownEditor } from '$lib/prototypes/breakdown-page/state.svelte.js';

	let { editor }: { editor: BreakdownEditor } = $props();

	let confirmOpen = $state(false);
	let bandByQuestion = $state(true);
	const locked = $derived(editor.confirmedAt !== null);

	const cell =
		'w-full rounded-sm border border-transparent bg-transparent px-1.5 py-1 hover:border-border focus:border-ring focus:bg-background focus:outline-none disabled:hover:border-transparent';

	function focusNew(key: string) {
		requestAnimationFrame(() =>
			document.querySelector<HTMLInputElement>(`[data-key="${key}"] input`)?.focus()
		);
	}
</script>

<div class="min-h-screen bg-background pb-40">
	<header class="border-b px-6 py-3 text-sm">
		<span class="font-semibold">QLA</span>
		<span class="text-muted-foreground"> · Biology Paper 1H</span>
	</header>

	<main class="mx-auto max-w-6xl space-y-4 px-6 py-6">
		<div class="flex flex-wrap items-end justify-between gap-3">
			<div>
				<h1 class="text-xl font-semibold">Check the breakdown</h1>
				<p class="text-sm text-muted-foreground">
					Fix anything the model got wrong. Once confirmed, this is what your marksheet columns are
					built from.
				</p>
			</div>
			<div class="flex items-center gap-2">
				<Badge variant="outline">
					{editor.usage.totalTokens.toLocaleString()} tokens · ${editor.usage.estCost.toFixed(4)}
				</Badge>
				<label class="flex items-center gap-1.5 text-xs text-muted-foreground">
					<input type="checkbox" bind:checked={bandByQuestion} /> Band by question
				</label>
			</div>
		</div>

		{#if editor.runWarnings.length > 0}
			<div
				class="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200"
			>
				{#each editor.runWarnings as w (w.message)}
					<p><TriangleAlertIcon class="mr-1 inline size-4" />{w.message}</p>
				{/each}
			</div>
		{/if}

		{#if editor.lastRemoved}
			<div class="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
				Deleted <strong>{editor.lastRemoved.entry.id}</strong>.
				<Button size="sm" variant="outline" onclick={() => editor.undoRemove()}>Undo</Button>
			</div>
		{/if}

		<div class="overflow-x-auto rounded-lg border">
			<table class="w-full text-sm">
				<thead class="bg-muted/50 text-left text-xs text-muted-foreground">
					<tr>
						<th class="w-6"></th>
						<th class="w-20 px-2 py-2">Label</th>
						{#if !bandByQuestion}<th class="w-16 px-2">Question</th>{/if}
						<th class="w-16 px-2">Marks</th>
						<th class="px-2">Summary</th>
						<th class="w-28 px-2">Spec point</th>
						<th class="w-28 px-2">Command word</th>
						<th class="w-20 px-2">AO</th>
						<th class="w-24"></th>
					</tr>
				</thead>
				<tbody>
					{#each editor.groups as group, gi (gi + group.questionNumber)}
						{#if bandByQuestion}
							<tr class="border-t bg-muted/30 text-xs">
								<td></td>
								<td colspan="7" class="px-2 py-1.5">
									<span class="font-semibold">Question</span>
									<input
										class="ml-1 w-14 rounded-sm border border-transparent bg-transparent px-1 font-semibold hover:border-border focus:border-ring focus:outline-none"
										value={group.questionNumber}
										disabled={locked}
										onchange={(ev) => {
											for (const e of group.entries)
												editor.update(e.key, 'questionNumber', ev.currentTarget.value);
										}}
									/>
									<span class="text-muted-foreground">
										· {group.entries.length === 1 && group.entries[0].id === group.questionNumber
											? 'undivided'
											: `${group.entries.length} subquestion${group.entries.length === 1 ? '' : 's'}`}
										· {group.knownMarks} marks{group.nullCount
											? ` + ${group.nullCount} unknown`
											: ''}
									</span>
								</td>
								<td class="pr-2 text-right">
									{#if !locked}
										<button
											type="button"
											class="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
											onclick={() => focusNew(editor.add(group.entries.at(-1)!.key))}
										>
											<PlusIcon class="size-3" /> subquestion
										</button>
									{/if}
								</td>
							</tr>
						{/if}
						{#each group.entries as e (e.key)}
							{@const warns = editor.warningsFor(e)}
							{@const edited = editor.editedFields(e)}
							<tr
								data-key={e.key}
								class="group border-t {e.original === null
									? 'bg-sky-500/5'
									: ''} {editor.duplicateIds.has(e.id.trim()) || e.id.trim() === ''
									? 'bg-destructive/5'
									: ''}"
							>
								<td class="pl-2">
									{#if warns.length}
										<Popover.Root>
											<Popover.Trigger class="text-amber-600 dark:text-amber-400">
												<TriangleAlertIcon class="size-4" />
											</Popover.Trigger>
											<Popover.Content class="w-72 text-xs">
												{#each warns as w (w.code)}
													<p><strong>{w.code}</strong>: {w.message}</p>
												{/each}
											</Popover.Content>
										</Popover.Root>
									{:else if e.original === null}
										<span class="text-[10px] text-sky-600" title="Added by you">new</span>
									{/if}
								</td>
								<td class="px-1">
									<input
										class="{cell} font-medium {edited.includes('id')
											? 'text-sky-700 dark:text-sky-300'
											: ''}"
										value={e.id}
										placeholder="label"
										disabled={locked}
										onchange={(ev) => editor.update(e.key, 'id', ev.currentTarget.value)}
									/>
								</td>
								{#if !bandByQuestion}
									<td class="px-1">
										<input
											class={cell}
											value={e.questionNumber}
											disabled={locked}
											onchange={(ev) =>
												editor.update(e.key, 'questionNumber', ev.currentTarget.value)}
										/>
									</td>
								{/if}
								<td class="px-1">
									<input
										class="{cell} text-right tabular-nums {e.marks === null
											? 'border-destructive/60 bg-destructive/10 placeholder:text-destructive'
											: ''}"
										inputmode="numeric"
										value={e.marks ?? ''}
										placeholder="?"
										disabled={locked}
										onchange={(ev) => {
											editor.setMarks(e.key, ev.currentTarget.value);
											ev.currentTarget.value = String(e.marks ?? '');
										}}
									/>
								</td>
								<td class="px-1">
									<input
										class={cell}
										value={e.summary}
										placeholder="What the question asks"
										disabled={locked}
										onchange={(ev) => editor.update(e.key, 'summary', ev.currentTarget.value)}
									/>
								</td>
								<td class="px-1">
									<input
										class="{cell} font-mono text-xs"
										value={e.specPoint ?? ''}
										placeholder="—"
										disabled={locked}
										onchange={(ev) =>
											editor.update(e.key, 'specPoint', ev.currentTarget.value.trim() || null)}
									/>
								</td>
								<td class="px-1">
									<input
										class={cell}
										value={e.commandWord ?? ''}
										placeholder="—"
										disabled={locked}
										onchange={(ev) =>
											editor.update(e.key, 'commandWord', ev.currentTarget.value.trim() || null)}
									/>
								</td>
								<td class="px-1">
									<select
										class="{cell} {e.ao === null ? 'text-muted-foreground' : ''}"
										value={e.ao ?? ''}
										disabled={locked}
										onchange={(ev) =>
											editor.update(
												e.key,
												'ao',
												(ev.currentTarget.value || null) as (typeof AO_OPTIONS)[number]
											)}
									>
										{#each AO_OPTIONS as ao (ao)}
											<option value={ao ?? ''}>{ao ?? '—'}</option>
										{/each}
									</select>
								</td>
								<td class="pr-2 text-right whitespace-nowrap">
									{#if !locked}
										<span
											class="invisible inline-flex gap-0.5 group-focus-within:visible group-hover:visible"
										>
											<button
												type="button"
												class="rounded p-1 hover:bg-muted"
												title="Move up"
												onclick={() => editor.move(e.key, -1)}
												><ArrowUpIcon class="size-3.5" /></button
											>
											<button
												type="button"
												class="rounded p-1 hover:bg-muted"
												title="Move down"
												onclick={() => editor.move(e.key, 1)}
												><ArrowDownIcon class="size-3.5" /></button
											>
											<button
												type="button"
												class="rounded p-1 hover:bg-muted"
												title="Insert entry below"
												onclick={() => focusNew(editor.add(e.key))}
												><PlusIcon class="size-3.5" /></button
											>
											<button
												type="button"
												class="rounded p-1 text-destructive hover:bg-destructive/10"
												title="Delete"
												onclick={() => editor.remove(e.key)}><Trash2Icon class="size-3.5" /></button
											>
										</span>
									{/if}
								</td>
							</tr>
						{/each}
					{/each}
				</tbody>
			</table>
		</div>
		{#if !locked}
			<Button variant="outline" size="sm" onclick={() => focusNew(editor.add(null))}>
				<PlusIcon class="size-4" /> Add entry at end
			</Button>
		{/if}
	</main>

	<footer
		class="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-6 pt-3 pb-14 backdrop-blur"
	>
		<div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 pl-80">
			<p class="text-sm">
				<strong>{editor.entries.length}</strong> entries ·
				<strong>{editor.knownMarks}</strong> marks
				{#if editor.nullMarks.length}
					· <span class="font-medium text-destructive"
						>{editor.nullMarks.length} without marks ({editor.nullMarks
							.map((e) => e.id)
							.join(', ')})</span
					>
				{/if}
				{#if editor.hardBlockers}
					· <span class="font-medium text-destructive">{editor.hardBlockers} label problem(s)</span>
				{/if}
			</p>
			{#if locked}
				<Badge>Confirmed — would now open the marksheet</Badge>
			{:else}
				<Button disabled={!editor.canConfirm} onclick={() => (confirmOpen = true)}>
					Confirm breakdown
				</Button>
			{/if}
		</div>
	</footer>
</div>

<Dialog.Root bind:open={confirmOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Confirm this breakdown?</Dialog.Title>
			<Dialog.Description>
				Your marksheet gets one column per entry. After this the breakdown is read-only; changing it
				later means unlocking it from the marksheet.
			</Dialog.Description>
		</Dialog.Header>
		<dl class="grid grid-cols-2 gap-y-1 text-sm">
			<dt class="text-muted-foreground">Questions</dt>
			<dd>{editor.groups.length}</dd>
			<dt class="text-muted-foreground">Entries (columns)</dt>
			<dd>{editor.entries.length}</dd>
			<dt class="text-muted-foreground">Total marks</dt>
			<dd>{editor.knownMarks}</dd>
			<dt class="text-muted-foreground">Edited / added by you</dt>
			<dd>{editor.editedCount} / {editor.addedCount}</dd>
		</dl>
		{#if editor.nullMarks.length && editor.nullPolicy === 'warn'}
			<p class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
				{editor.nullMarks.length} entries have no marks ({editor.nullMarks
					.map((e) => e.id)
					.join(', ')}). You won't be able to enter marks against them or analyse them.
			</p>
		{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (confirmOpen = false)}>Keep editing</Button>
			<Button
				onclick={() => {
					editor.confirm();
					confirmOpen = false;
				}}
			>
				{editor.nullMarks.length && editor.nullPolicy === 'warn'
					? 'Confirm anyway'
					: 'Confirm and build marksheet'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
