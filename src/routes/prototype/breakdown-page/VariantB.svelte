<!--
	PROTOTYPE Variant B — issues rail + read-only table + per-row edit mode.
	The rail is a "before you confirm" checklist (paper-total reconciliation, null marks, warnings,
	label problems) that jumps to rows; a row opens an expanded form with Save/Cancel. Confirm lives
	in the rail behind an "I've checked it" tick, no dialog.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import {
		AO_OPTIONS,
		type BreakdownEditor,
		type Entry
	} from '$lib/prototypes/breakdown-page/state.svelte.js';
	import type { ParseQuestion } from '$lib/server/parse/schema.js';

	let { editor }: { editor: BreakdownEditor } = $props();

	const locked = $derived(editor.confirmedAt !== null);
	let openKey = $state<string | null>(null);
	let draft = $state<ParseQuestion | null>(null);
	let attested = $state(false);

	function open(e: Entry) {
		if (locked) return;
		openKey = e.key;
		const { key: _k, original: _o, ...q } = e;
		draft = { ...q };
		requestAnimationFrame(() =>
			document
				.getElementById(`row-${e.key}`)
				?.scrollIntoView({ block: 'center', behavior: 'smooth' })
		);
	}

	function save() {
		if (!openKey || !draft) return;
		const e = editor.entries.find((x) => x.key === openKey);
		if (!e) return;
		for (const f of Object.keys(draft) as (keyof ParseQuestion)[]) {
			if (draft[f] !== e[f]) editor.update(openKey, f, draft[f]);
		}
		close();
	}

	function close() {
		openKey = null;
		draft = null;
	}

	function addAfter(key: string | null) {
		const k = editor.add(key);
		const e = editor.entries.find((x) => x.key === k);
		if (e) open(e);
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

	function nextIssue() {
		const i = issueRows.findIndex((e) => e.key === openKey);
		const next = issueRows[(i + 1) % issueRows.length];
		if (next) open(next);
	}

	const gap = $derived(editor.paperTotal === null ? null : editor.paperTotal - editor.knownMarks);
</script>

<div class="min-h-screen bg-background pb-32">
	<header class="border-b px-6 py-3 text-sm">
		<span class="font-semibold">QLA</span>
		<span class="text-muted-foreground"> · Biology Paper 1H</span>
	</header>

	<div class="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[320px_1fr]">
		<aside class="space-y-4 lg:sticky lg:top-4 lg:self-start">
			<div>
				<h1 class="text-xl font-semibold">Review breakdown</h1>
				<p class="text-sm text-muted-foreground">
					{editor.entries.length} entries across {editor.groups.length} questions.
				</p>
			</div>

			<section class="space-y-2 rounded-lg border p-3">
				<h2 class="text-sm font-semibold">Does it add up?</h2>
				<label class="block text-xs text-muted-foreground" for="paper-total">
					Total marks printed on the paper
				</label>
				<input
					id="paper-total"
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
				<div class="flex items-center justify-between">
					<h2 class="text-sm font-semibold">Needs attention ({issueRows.length})</h2>
					{#if issueRows.length && !locked}
						<Button size="sm" variant="ghost" onclick={nextIssue}>Next →</Button>
					{/if}
				</div>
				{#if editor.runWarnings.length}
					{#each editor.runWarnings as w (w.message)}
						<p class="text-xs text-amber-800 dark:text-amber-300">
							<TriangleAlertIcon class="mr-1 inline size-3.5" />{w.message}
						</p>
					{/each}
				{/if}
				<ul class="space-y-0.5">
					{#each issueRows as e (e.key)}
						<li>
							<button
								type="button"
								class="w-full rounded px-1.5 py-1 text-left text-xs hover:bg-muted {openKey ===
								e.key
									? 'bg-muted'
									: ''}"
								onclick={() => open(e)}
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
						Builds your marksheet: one column per entry, {editor.knownMarks} marks. The breakdown becomes
						read-only.
					</p>
					{#if editor.nullMarks.length && editor.nullPolicy !== 'silent'}
						<p class="text-xs text-destructive">
							{editor.nullPolicy === 'block'
								? `Give marks to ${editor.nullMarks.length} entries before confirming.`
								: `${editor.nullMarks.length} entries without marks can't be marked or analysed.`}
						</p>
					{/if}
					<label class="flex items-start gap-2 text-xs">
						<input type="checkbox" bind:checked={attested} class="mt-0.5" />
						I've checked the labels and marks against the paper.
					</label>
					<Button
						class="w-full"
						disabled={!attested || !editor.canConfirm}
						onclick={() => editor.confirm()}
					>
						Confirm and build marksheet
					</Button>
				{/if}
			</section>

			<Badge variant="outline">
				{editor.usage.totalTokens.toLocaleString()} tokens · ${editor.usage.estCost.toFixed(4)}
			</Badge>
		</aside>

		<main class="min-w-0">
			{#if editor.lastRemoved}
				<div class="mb-2 flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
					Deleted <strong>{editor.lastRemoved.entry.id}</strong>.
					<Button size="sm" variant="outline" onclick={() => editor.undoRemove()}>Undo</Button>
				</div>
			{/if}
			<div class="overflow-x-auto rounded-lg border">
				<table class="w-full text-sm">
					<thead class="bg-muted/50 text-left text-xs text-muted-foreground">
						<tr>
							<th class="px-3 py-2">Label</th>
							<th class="px-3 text-right">Marks</th>
							<th class="px-3">Summary</th>
							<th class="px-3">Spec point</th>
							<th class="px-3">Command</th>
							<th class="px-3">AO</th>
							<th class="w-8"></th>
						</tr>
					</thead>
					<tbody>
						{#each editor.entries as e, i (e.key)}
							{@const warns = editor.warningsFor(e)}
							{@const newQuestion =
								i > 0 && editor.entries[i - 1].questionNumber !== e.questionNumber}
							{#if openKey === e.key && draft}
								<tr
									id="row-{e.key}"
									class="border-t bg-muted/40 {newQuestion
										? 'border-t-2 border-t-foreground/20'
										: ''}"
								>
									<td colspan="7" class="p-4">
										<form
											class="grid gap-3 sm:grid-cols-6"
											onsubmit={(ev) => {
												ev.preventDefault();
												save();
											}}
										>
											<label class="text-xs sm:col-span-1">
												Label
												<input
													class="mt-1 w-full rounded-md border bg-background px-2 py-1 text-sm"
													bind:value={draft.id}
												/>
											</label>
											<label class="text-xs sm:col-span-1">
												Question
												<input
													class="mt-1 w-full rounded-md border bg-background px-2 py-1 text-sm"
													bind:value={draft.questionNumber}
												/>
											</label>
											<label class="text-xs sm:col-span-1">
												Marks
												<input
													type="number"
													min="1"
													class="mt-1 w-full rounded-md border bg-background px-2 py-1 text-sm {draft.marks ===
													null
														? 'border-destructive'
														: ''}"
													value={draft.marks ?? ''}
													oninput={(ev) => {
														const n = Number(ev.currentTarget.value);
														draft!.marks =
															ev.currentTarget.value === ''
																? null
																: Number.isInteger(n) && n > 0
																	? n
																	: draft!.marks;
													}}
												/>
											</label>
											<label class="text-xs sm:col-span-3">
												Summary
												<input
													class="mt-1 w-full rounded-md border bg-background px-2 py-1 text-sm"
													bind:value={draft.summary}
												/>
											</label>
											<label class="text-xs sm:col-span-2">
												Spec point
												<input
													class="mt-1 w-full rounded-md border bg-background px-2 py-1 font-mono text-sm"
													value={draft.specPoint ?? ''}
													oninput={(ev) =>
														(draft!.specPoint = ev.currentTarget.value.trim() || null)}
												/>
											</label>
											<label class="text-xs sm:col-span-2">
												Command word
												<input
													class="mt-1 w-full rounded-md border bg-background px-2 py-1 text-sm"
													value={draft.commandWord ?? ''}
													oninput={(ev) =>
														(draft!.commandWord = ev.currentTarget.value.trim() || null)}
												/>
											</label>
											<fieldset class="text-xs sm:col-span-2">
												<legend>Assessment objective</legend>
												<div class="mt-1 inline-flex overflow-hidden rounded-md border">
													{#each AO_OPTIONS as ao (ao)}
														<button
															type="button"
															class="px-2.5 py-1 text-sm {draft.ao === ao
																? 'bg-primary text-primary-foreground'
																: 'hover:bg-muted'}"
															onclick={() => (draft!.ao = ao)}>{ao ?? 'None'}</button
														>
													{/each}
												</div>
											</fieldset>
											{#if warns.length}
												<div class="text-xs text-amber-800 sm:col-span-6 dark:text-amber-300">
													{#each warns as w (w.code)}
														<p>
															<TriangleAlertIcon class="mr-1 inline size-3.5" /><strong
																>{w.code}</strong
															>: {w.message}
														</p>
													{/each}
												</div>
											{/if}
											<div class="flex flex-wrap gap-2 sm:col-span-6">
												<Button type="submit" size="sm">Save</Button>
												<Button type="button" size="sm" variant="outline" onclick={close}
													>Cancel</Button
												>
												<Button
													type="button"
													size="sm"
													variant="outline"
													onclick={() => {
														save();
														addAfter(e.key);
													}}
												>
													Save + add entry below
												</Button>
												<span class="flex-1"></span>
												<Button
													type="button"
													size="sm"
													variant="destructive"
													onclick={() => {
														editor.remove(e.key);
														close();
													}}>Delete entry</Button
												>
											</div>
										</form>
									</td>
								</tr>
							{:else}
								<tr
									id="row-{e.key}"
									class="group cursor-pointer border-t hover:bg-muted/40 {newQuestion
										? 'border-t-2 border-t-foreground/20'
										: ''} {e.original === null ? 'bg-sky-500/5' : ''}"
									onclick={() => open(e)}
								>
									<td class="px-3 py-1.5 font-medium whitespace-nowrap">
										{e.id || '(no label)'}
										{#if warns.length}<TriangleAlertIcon
												class="ml-1 inline size-3.5 text-amber-600"
											/>{/if}
										{#if editor.editedFields(e).length}<span class="ml-1 text-[10px] text-sky-600"
												>edited</span
											>{/if}
										{#if e.original === null}<span class="ml-1 text-[10px] text-sky-600">added</span
											>{/if}
									</td>
									<td
										class="px-3 text-right tabular-nums {e.marks === null
											? 'font-semibold text-destructive'
											: ''}"
									>
										{e.marks ?? '?'}
									</td>
									<td class="max-w-72 truncate px-3" title={e.summary}>{e.summary}</td>
									<td class="px-3 font-mono text-xs">{e.specPoint ?? '—'}</td>
									<td class="px-3">{e.commandWord ?? '—'}</td>
									<td class="px-3">{e.ao ?? '—'}</td>
									<td class="pr-2 text-muted-foreground">
										{#if !locked}<PencilIcon class="invisible size-3.5 group-hover:visible" />{/if}
									</td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			</div>
			{#if !locked}
				<Button class="mt-2" variant="outline" size="sm" onclick={() => addAfter(null)}>
					Add a missing entry
				</Button>
			{/if}
		</main>
	</div>
</div>
