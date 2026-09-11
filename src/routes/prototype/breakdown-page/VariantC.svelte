<!--
	PROTOTYPE Variant C — paper-shaped question cards.
	One card per question with its subquestions as lines (label + marks prominent, metadata as chips
	edited in popovers); a left rail ticks each question off as checked; editing a ticked question
	unticks it. Confirm is a separate summary step, reachable once every question is ticked.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import CheckIcon from '@lucide/svelte/icons/check';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import {
		AO_OPTIONS,
		type BreakdownEditor,
		type Entry,
		type EditableField
	} from '$lib/prototypes/breakdown-page/state.svelte.js';
	import type { ParseQuestion } from '$lib/server/parse/schema.js';

	let { editor }: { editor: BreakdownEditor } = $props();

	let step = $state<'review' | 'confirm'>('review');
	const locked = $derived(editor.confirmedAt !== null);
	const checkedCount = $derived(
		editor.groups.filter((g) => editor.checked[g.questionNumber]).length
	);
	const allChecked = $derived(checkedCount === editor.groups.length);

	function edit<K extends EditableField>(e: Entry, field: K, value: ParseQuestion[K]) {
		editor.update(e.key, field, value);
		editor.checked[e.questionNumber] = false;
	}

	function groupFlag(qn: string) {
		const g = editor.groups.find((x) => x.questionNumber === qn);
		if (!g) return 'none';
		if (g.nullCount) return 'null';
		if (g.entries.some((e) => editor.warningsFor(e).length)) return 'warn';
		return 'none';
	}

	function insertQuestionAfter(lastKey: string, after: string) {
		const n = Number(after);
		const qn = Number.isInteger(n) ? String(n + 1) : `${after}+`;
		editor.add(lastKey, { id: qn, questionNumber: qn });
	}
</script>

<div class="min-h-screen bg-background pb-32">
	<header class="border-b px-6 py-3 text-sm">
		<span class="font-semibold">QLA</span>
		<span class="text-muted-foreground"> · Biology Paper 1H</span>
	</header>

	<div class="mx-auto grid max-w-6xl gap-8 px-6 py-6 md:grid-cols-[200px_1fr]">
		<nav class="space-y-3 md:sticky md:top-4 md:self-start">
			<div>
				<p class="text-sm font-semibold">Checked {checkedCount} of {editor.groups.length}</p>
				<div class="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
					<div
						class="h-full bg-emerald-500 transition-all"
						style="width: {(checkedCount / Math.max(1, editor.groups.length)) * 100}%"
					></div>
				</div>
			</div>
			<ol class="grid grid-cols-4 gap-1 md:grid-cols-3">
				{#each editor.groups as g, gi (gi + g.questionNumber)}
					{@const flag = groupFlag(g.questionNumber)}
					<li>
						<a
							href="#q-{gi}"
							onclick={() => (step = 'review')}
							class="relative flex h-9 items-center justify-center rounded-md border text-sm font-medium {editor
								.checked[g.questionNumber]
								? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
								: 'hover:bg-muted'}"
						>
							{g.questionNumber}
							{#if flag !== 'none'}
								<span
									class="absolute top-0.5 right-0.5 size-1.5 rounded-full {flag === 'null'
										? 'bg-destructive'
										: 'bg-amber-500'}"
								></span>
							{/if}
						</a>
					</li>
				{/each}
			</ol>
			<p class="text-xs text-muted-foreground">
				{editor.knownMarks} marks · {editor.entries.length} entries
			</p>
			{#if locked}
				<p class="text-sm font-semibold text-emerald-700">Confirmed</p>
			{:else}
				<Button class="w-full" disabled={!allChecked} onclick={() => (step = 'confirm')}>
					Review and confirm
				</Button>
				{#if !allChecked}
					<p class="text-xs text-muted-foreground">Tick every question to continue.</p>
				{/if}
			{/if}
		</nav>

		{#if step === 'confirm'}
			<main class="space-y-5">
				<h1 class="text-2xl font-semibold">Confirm your breakdown</h1>
				<p class="max-w-prose text-muted-foreground">
					Your marksheet will have <strong class="text-foreground">{editor.entries.length}</strong>
					columns across <strong class="text-foreground">{editor.groups.length}</strong> questions,
					out of <strong class="text-foreground">{editor.knownMarks}</strong> marks. From here on the
					breakdown is read-only.
				</p>
				<div class="overflow-x-auto rounded-lg border">
					<table class="w-full text-sm">
						<thead class="bg-muted/50 text-left text-xs text-muted-foreground">
							<tr>
								<th class="px-3 py-2">Question</th>
								<th class="px-3">Columns</th>
								<th class="px-3 text-right">Marks</th>
							</tr>
						</thead>
						<tbody>
							{#each editor.groups as g, gi (gi + g.questionNumber)}
								<tr class="border-t">
									<td class="px-3 py-1.5 font-medium">{g.questionNumber}</td>
									<td class="px-3 text-muted-foreground"
										>{g.entries.map((e) => e.id).join(' · ')}</td
									>
									<td class="px-3 text-right tabular-nums {g.nullCount ? 'text-destructive' : ''}">
										{g.knownMarks}{g.nullCount ? ` + ${g.nullCount}?` : ''}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if editor.nullMarks.length && editor.nullPolicy !== 'silent'}
					<p class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
						{editor.nullPolicy === 'block' ? 'Cannot confirm: ' : ''}{editor.nullMarks
							.map((e) => e.id)
							.join(', ')} have no marks, so they can't be marked or analysed.
					</p>
				{/if}
				<div class="flex gap-2">
					<Button variant="outline" onclick={() => (step = 'review')}>Back to questions</Button>
					{#if locked}
						<Button disabled>Confirmed</Button>
					{:else}
						<Button disabled={!editor.canConfirm} onclick={() => editor.confirm()}>
							Confirm and build marksheet
						</Button>
					{/if}
				</div>
			</main>
		{:else}
			<main class="space-y-4">
				<div>
					<h1 class="text-2xl font-semibold">Check each question</h1>
					<p class="text-sm text-muted-foreground">Compare against the paper and tick it off.</p>
				</div>
				{#each editor.runWarnings as w (w.message)}
					<p class="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">
						<TriangleAlertIcon class="mr-1 inline size-4" />{w.message}
					</p>
				{/each}
				{#if editor.lastRemoved}
					<div class="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
						Deleted <strong>{editor.lastRemoved.entry.id}</strong>.
						<Button size="sm" variant="outline" onclick={() => editor.undoRemove()}>Undo</Button>
					</div>
				{/if}

				{#each editor.groups as g, gi (gi + g.questionNumber)}
					{@const ticked = !!editor.checked[g.questionNumber]}
					<section
						id="q-{gi}"
						class="scroll-mt-4 rounded-xl border-2 {ticked
							? 'border-emerald-500/60'
							: 'border-border'}"
					>
						<div class="flex items-center justify-between gap-3 border-b px-4 py-2.5">
							<h2 class="text-lg font-semibold">
								Question
								<input
									class="w-14 rounded border border-transparent bg-transparent px-1 hover:border-border focus:border-ring focus:outline-none"
									value={g.questionNumber}
									disabled={locked}
									onchange={(ev) => {
										const qn = ev.currentTarget.value;
										for (const e of g.entries) editor.update(e.key, 'questionNumber', qn);
									}}
								/>
								<span class="ml-2 text-sm font-normal text-muted-foreground">
									{g.knownMarks}{g.nullCount ? ` + ${g.nullCount} unknown` : ''} marks
								</span>
							</h2>
							{#if !locked}
								<button
									type="button"
									class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm {ticked
										? 'border-emerald-500 bg-emerald-500 text-white'
										: 'hover:bg-muted'}"
									onclick={() => editor.toggleChecked(g.questionNumber)}
								>
									<CheckIcon class="size-4" />{ticked ? 'Checked' : 'Looks right'}
								</button>
							{/if}
						</div>
						<ul class="divide-y">
							{#each g.entries as e (e.key)}
								{@const warns = editor.warningsFor(e)}
								<li
									class="group flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 {e.original ===
									null
										? 'bg-sky-500/5'
										: ''}"
								>
									<input
										class="w-14 rounded border border-transparent bg-transparent px-1 font-semibold hover:border-border focus:border-ring focus:outline-none"
										value={e.id}
										placeholder="label"
										disabled={locked}
										onchange={(ev) => edit(e, 'id', ev.currentTarget.value)}
									/>
									<label
										class="flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm {e.marks ===
										null
											? 'border-destructive bg-destructive/10 text-destructive'
											: ''}"
									>
										<input
											class="w-7 bg-transparent text-right font-semibold tabular-nums focus:outline-none"
											inputmode="numeric"
											value={e.marks ?? ''}
											placeholder="?"
											disabled={locked}
											onchange={(ev) => {
												editor.setMarks(e.key, ev.currentTarget.value);
												editor.checked[e.questionNumber] = false;
												ev.currentTarget.value = String(e.marks ?? '');
											}}
										/>
										<span class="text-xs">{e.marks === 1 ? 'mark' : 'marks'}</span>
									</label>
									<input
										class="min-w-48 flex-1 rounded border border-transparent bg-transparent px-1 hover:border-border focus:border-ring focus:outline-none"
										value={e.summary}
										placeholder="What the question asks"
										disabled={locked}
										onchange={(ev) => edit(e, 'summary', ev.currentTarget.value)}
									/>
									<div class="flex items-center gap-1.5 text-xs">
										{#each [['specPoint', 'Spec'], ['commandWord', 'Command']] as const as [field, label] (field)}
											<Popover.Root>
												<Popover.Trigger
													disabled={locked}
													class="rounded-full border px-2 py-0.5 {e[field] === null
														? 'border-dashed text-muted-foreground'
														: ''}"
												>
													{e[field] ?? `+ ${label}`}
												</Popover.Trigger>
												<Popover.Content class="w-56 space-y-1 text-xs">
													<p class="font-medium">
														{label === 'Spec' ? 'Specification point' : 'Command word'}
													</p>
													<input
														class="w-full rounded-md border bg-background px-2 py-1 text-sm"
														value={e[field] ?? ''}
														onchange={(ev) => edit(e, field, ev.currentTarget.value.trim() || null)}
													/>
													<p class="text-muted-foreground">Blank = none on the paper.</p>
												</Popover.Content>
											</Popover.Root>
										{/each}
										<Popover.Root>
											<Popover.Trigger
												disabled={locked}
												class="rounded-full border px-2 py-0.5 {e.ao === null
													? 'border-dashed text-muted-foreground'
													: ''}"
											>
												{e.ao ?? '+ AO'}
											</Popover.Trigger>
											<Popover.Content class="w-auto p-1">
												{#each AO_OPTIONS as ao (ao)}
													<button
														type="button"
														class="block w-full rounded px-3 py-1 text-left text-sm hover:bg-muted {e.ao ===
														ao
															? 'font-semibold'
															: ''}"
														onclick={() => edit(e, 'ao', ao)}>{ao ?? 'None'}</button
													>
												{/each}
											</Popover.Content>
										</Popover.Root>
										{#if warns.length}
											<Popover.Root>
												<Popover.Trigger class="text-amber-600"
													><TriangleAlertIcon class="size-4" /></Popover.Trigger
												>
												<Popover.Content class="w-64 text-xs">
													{#each warns as w (w.code)}<p>{w.message}</p>{/each}
												</Popover.Content>
											</Popover.Root>
										{/if}
									</div>
									{#if !locked}
										<button
											type="button"
											class="invisible rounded p-1 text-destructive group-hover:visible hover:bg-destructive/10"
											title="Delete"
											onclick={() => editor.remove(e.key)}><XIcon class="size-4" /></button
										>
									{/if}
								</li>
							{/each}
						</ul>
						{#if !locked}
							<div class="flex gap-3 border-t px-4 py-1.5 text-xs text-muted-foreground">
								<button
									type="button"
									class="inline-flex items-center gap-1 hover:text-foreground"
									onclick={() => {
										editor.add(g.entries.at(-1)!.key);
										editor.checked[g.questionNumber] = false;
									}}><PlusIcon class="size-3" /> Add subquestion</button
								>
								<button
									type="button"
									class="inline-flex items-center gap-1 hover:text-foreground"
									onclick={() => insertQuestionAfter(g.entries.at(-1)!.key, g.questionNumber)}
									><PlusIcon class="size-3" /> Insert question after {g.questionNumber}</button
								>
							</div>
						{/if}
					</section>
				{/each}
			</main>
		{/if}
	</div>
</div>
