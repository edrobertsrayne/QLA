<!--
	PROTOTYPE Variant D — the chosen merge (round 2).
	A's inline spreadsheet table (always-editable cells, question bands, row actions) with B's
	sidebar (paper-total reconciliation, needs-attention list, confirm panel). Confirm lives in the
	sidebar: no bottom bar, no dialog. Entries without marks block confirmation.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Popover from '$lib/components/ui/popover';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import {
		AO_OPTIONS,
		type BreakdownEditor,
		type Entry
	} from '$lib/prototypes/breakdown-page/state.svelte.js';

	let { editor }: { editor: BreakdownEditor } = $props();

	let bandByQuestion = $state(true);
	const locked = $derived(editor.confirmedAt !== null);

	const cell =
		'w-full rounded-sm border border-transparent bg-transparent px-1.5 py-1 hover:border-border focus:border-ring focus:bg-background focus:outline-none disabled:hover:border-transparent';

	function focusRow(key: string, field = 'input') {
		requestAnimationFrame(() => {
			const row = document.querySelector<HTMLTableRowElement>(`[data-key="${key}"]`);
			row?.scrollIntoView({ block: 'center' });
			row?.querySelector<HTMLInputElement>(field)?.focus();
		});
	}

	/** Jump straight to the marks cell — the field that blocks confirmation. */
	function goToIssue(e: Entry) {
		focusRow(e.key, e.marks === null ? '[data-marks]' : 'input');
	}

	const issueRows = $derived(
		editor.entries.filter(
			(e) =>
				e.marks === null ||
				editor.warningsFor(e).length > 0 ||
				e.id.trim() === '' ||
				editor.duplicateIds.has(e.id.trim())
		)
	);

	const gap = $derived(editor.paperTotal === null ? null : editor.paperTotal - editor.knownMarks);
</script>

<div class="min-h-screen bg-background pb-20">
	<header class="border-b px-6 py-3 text-sm">
		<span class="font-semibold">QLA</span>
		<span class="text-muted-foreground"> · Biology Paper 1H</span>
	</header>

	<div class="mx-auto grid max-w-[1600px] gap-6 px-6 py-6 lg:grid-cols-[320px_1fr]">
		<aside class="space-y-4 lg:sticky lg:top-4 lg:self-start">
			<div>
				<h1 class="text-xl font-semibold">Check the breakdown</h1>
				<p class="text-sm text-muted-foreground">
					Fix anything the model got wrong. Once confirmed, this is what your marksheet columns are
					built from.
				</p>
			</div>

			<section class="space-y-2 rounded-lg border p-3">
				<h2 class="text-sm font-semibold">Does it add up?</h2>
				<label class="block text-xs text-muted-foreground" for="paper-total-d">
					Total marks printed on the paper
				</label>
				<input
					id="paper-total-d"
					type="number"
					class="w-24 rounded-md border bg-background px-2 py-1 text-sm"
					placeholder={String(editor.printedTotal)}
					value={editor.paperTotal ?? ''}
					oninput={(ev) =>
						(editor.paperTotal =
							ev.currentTarget.value === '' ? null : Number(ev.currentTarget.value))}
				/>
				<p class="text-xs text-muted-foreground">Sample paper prints {editor.printedTotal}.</p>
				{#if gap === null}
					<p class="text-sm">Breakdown totals <strong>{editor.knownMarks}</strong>.</p>
				{:else if gap === 0 && editor.nullMarks.length === 0}
					<p class="flex items-center gap-1 text-sm text-emerald-700 dark:text-emerald-400">
						<CircleCheckIcon class="size-4" />
						{editor.knownMarks} of {editor.paperTotal} — adds up.
					</p>
				{:else}
					<p class="text-sm text-destructive">
						<CircleAlertIcon class="mr-1 inline size-4" />{editor.knownMarks} of {editor.paperTotal}.
						{#if gap > 0}
							{gap} marks unaccounted{editor.nullMarks.length
								? ` — ${editor.nullMarks.length} entries have no marks yet`
								: ''}{gap > 0 && editor.nullMarks.length === 0 ? ' — an entry may be missing' : ''}.
						{:else}
							{-gap} marks too many — an entry may be duplicated or over-marked.
						{/if}
					</p>
				{/if}
			</section>

			<section class="space-y-1 rounded-lg border p-3">
				<h2 class="text-sm font-semibold">Needs attention ({issueRows.length})</h2>
				{#each editor.runWarnings as w (w.message)}
					<p class="text-xs text-amber-800 dark:text-amber-300">
						<TriangleAlertIcon class="mr-1 inline size-3.5" />{w.message}
					</p>
				{/each}
				<ul class="space-y-0.5">
					{#each issueRows as e (e.key)}
						<li>
							<button
								type="button"
								class="w-full rounded px-1.5 py-1 text-left text-xs hover:bg-muted"
								onclick={() => goToIssue(e)}
							>
								<strong class="mr-1">{e.id || '(no label)'}</strong>
								{#if e.marks === null}<span class="text-destructive">no marks</span>{/if}
								{#if e.id.trim() === '' || editor.duplicateIds.has(e.id.trim())}
									<span class="text-destructive">label problem</span>
								{/if}
								{#each editor.warningsFor(e) as w (w.code)}
									<span class="text-amber-700 dark:text-amber-400"> {w.message}</span>
								{/each}
							</button>
						</li>
					{:else}
						<li class="text-xs text-muted-foreground">Nothing flagged.</li>
					{/each}
				</ul>
			</section>

			<section
				class="space-y-2 rounded-lg border-2 p-3 {locked ? 'border-emerald-500' : 'border-primary'}"
			>
				{#if locked}
					<p class="text-sm font-semibold">Confirmed</p>
					<p class="text-xs text-muted-foreground">Would now open the marksheet.</p>
				{:else}
					<h2 class="text-sm font-semibold">Confirm breakdown</h2>
					<p class="text-xs text-muted-foreground">
						Builds your marksheet: <strong>{editor.entries.length}</strong> columns across
						<strong>{editor.groups.length}</strong>
						questions, <strong>{editor.knownMarks}</strong> marks. The breakdown becomes read-only.
					</p>
					{#if editor.nullMarks.length}
						<p class="text-xs text-destructive">
							{editor.nullPolicy === 'block'
								? `Give marks to ${editor.nullMarks.length} entries before confirming: ${editor.nullMarks.map((e) => e.id).join(', ')}.`
								: `${editor.nullMarks.length} entries without marks can't be marked or analysed.`}
						</p>
					{/if}
					{#if editor.hardBlockers}
						<p class="text-xs text-destructive">
							Fix {editor.hardBlockers} label problem(s) before confirming.
						</p>
					{/if}
					<Button class="w-full" disabled={!editor.canConfirm} onclick={() => editor.confirm()}>
						Confirm and build marksheet
					</Button>
				{/if}
			</section>

			<div class="flex items-center justify-between gap-2">
				<Badge variant="outline">
					{editor.usage.totalTokens.toLocaleString()} tokens · ${editor.usage.estCost.toFixed(4)}
				</Badge>
				<label class="flex items-center gap-1.5 text-xs text-muted-foreground">
					<input type="checkbox" bind:checked={bandByQuestion} /> Band by question
				</label>
			</div>
		</aside>

		<main class="min-w-0 space-y-3">
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
												onclick={() => focusRow(editor.add(group.entries.at(-1)!.key))}
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
									class="group scroll-mt-24 border-t {e.original === null
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
											data-marks
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
													onclick={() => focusRow(editor.add(e.key))}
													><PlusIcon class="size-3.5" /></button
												>
												<button
													type="button"
													class="rounded p-1 text-destructive hover:bg-destructive/10"
													title="Delete"
													onclick={() => editor.remove(e.key)}
													><Trash2Icon class="size-3.5" /></button
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
				<Button variant="outline" size="sm" onclick={() => focusRow(editor.add(null))}>
					<PlusIcon class="size-4" /> Add entry at end
				</Button>
			{/if}
		</main>
	</div>
</div>
