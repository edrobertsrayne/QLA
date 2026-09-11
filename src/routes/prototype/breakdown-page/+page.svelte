<!--
	PROTOTYPE — throwaway route for wayfinder #29 (the breakdown page).
	Three structurally different breakdown review/edit/confirm pages over one in-memory editor,
	switchable via ?variant=. Not linked from the app; lives on branch prototype/breakdown-page only.
-->
<script lang="ts">
	import { page } from '$app/state';
	import PrototypeSwitcher from '$lib/components/prototype/PrototypeSwitcher.svelte';
	import { BreakdownEditor, type NullPolicy } from '$lib/prototypes/breakdown-page/state.svelte.js';
	import { SAMPLES } from '$lib/prototypes/breakdown-page/sample.js';
	import VariantA from './VariantA.svelte';
	import VariantB from './VariantB.svelte';
	import VariantC from './VariantC.svelte';
	import VariantD from './VariantD.svelte';

	const VARIANTS = [
		{ key: 'D', label: 'Chosen: A table + B sidebar' },
		{ key: 'A', label: 'Inline spreadsheet table' },
		{ key: 'B', label: 'Issues rail + row editor' },
		{ key: 'C', label: 'Paper-shaped question cards' }
	];

	const variant = $derived(page.url.searchParams.get('variant') ?? 'D');
	const editor = new BreakdownEditor();

	const POLICIES: NullPolicy[] = ['block', 'warn', 'silent'];
	let showState = $state(false);
</script>

<svelte:head>
	<title>Prototype — breakdown page</title>
</svelte:head>

<div
	class="fixed bottom-3 left-3 z-40 flex max-w-xs flex-col items-start gap-1.5 rounded-lg border-2 border-dashed border-amber-400 bg-card/95 p-2.5 text-xs shadow-md backdrop-blur"
>
	<span class="font-semibold tracking-wide text-muted-foreground uppercase">Prototype controls</span
	>
	<div class="flex flex-wrap gap-1.5">
		<button
			type="button"
			class="rounded-full border border-border bg-input/30 px-2.5 py-1 hover:bg-input/50"
			onclick={() =>
				(editor.nullPolicy = POLICIES[(POLICIES.indexOf(editor.nullPolicy) + 1) % POLICIES.length])}
		>
			Null marks on confirm: <strong>{editor.nullPolicy}</strong>
		</button>
		{#each SAMPLES as s (s.key)}
			<button
				type="button"
				class="rounded-full border px-2.5 py-1 hover:bg-input/30 {editor.sample === s.key
					? 'border-amber-500'
					: 'border-border'}"
				onclick={() => editor.load(s.key)}
			>
				{s.label}
			</button>
		{/each}
		{#if editor.confirmedAt}
			<button
				type="button"
				class="rounded-full border border-amber-500 px-2.5 py-1 text-amber-600 dark:text-amber-400"
				onclick={() => editor.unconfirm()}
			>
				Un-confirm
			</button>
		{/if}
		<button
			type="button"
			class="rounded-full border border-border px-2.5 py-1 hover:bg-input/30"
			onclick={() => (showState = !showState)}
		>
			{showState ? 'Hide' : 'Show'} state
		</button>
	</div>
	<ul class="w-full space-y-0.5 font-mono text-[10px] text-muted-foreground">
		{#each editor.log.slice(0, 3) as line, i (i + line)}
			<li class="truncate" title={line}>{line}</li>
		{/each}
	</ul>
</div>

{#if showState}
	<pre
		class="fixed top-3 right-3 bottom-16 z-40 w-96 overflow-auto rounded-lg border-2 border-dashed border-amber-400 bg-card/95 p-3 text-[10px] shadow-md">{JSON.stringify(
			{
				summary: {
					entries: editor.entries.length,
					knownMarks: editor.knownMarks,
					nullMarks: editor.nullMarks.map((e) => e.id),
					added: editor.addedCount,
					edited: editor.editedCount,
					hardBlockers: editor.hardBlockers,
					canConfirm: editor.canConfirm
				},
				...editor.snapshot()
			},
			null,
			2
		)}</pre>
{/if}

{#key editor.sample}
	{#if variant === 'A'}
		<VariantA {editor} />
	{:else if variant === 'B'}
		<VariantB {editor} />
	{:else if variant === 'C'}
		<VariantC {editor} />
	{:else}
		<VariantD {editor} />
	{/if}
{/key}

<PrototypeSwitcher variants={VARIANTS} current={variant} path="/prototype/breakdown-page" />
