<!--
	The Topic names step: a student-readable name for every specification code on
	the paper. Proposes names for the blanks once on arrival (the step mounts
	afresh each time the teacher arrives), never overwriting a typed name, so
	blanking a name to retype it never fires a model call.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { topicCodesOf, type MarksheetDocument } from '$lib/marksheet/document.js';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import { MAX_LABEL_LENGTH } from '$lib/marksheet/report-limits.js';
	import { topicNameGaps } from '$lib/marksheet/report-rollup.js';
	import { proposeTopicNames } from './topic-name-proposal.js';

	let {
		document,
		modelOverride,
		onnext
	}: { document: MarksheetDocument; modelOverride: string; onnext: () => void } = $props();

	const store = marksheetStore();
	const codes = $derived(topicCodesOf(document));
	const gaps = $derived(topicNameGaps(document));

	let proposing = $state(false);
	let proposeError = $state<string | null>(null);

	/**
	 * Ask the model to name the codes still missing one. Typed names are never
	 * overwritten, and unusable answers (blank, over-long, contact) are dropped
	 * by the server, leaving the gap for the teacher.
	 */
	async function propose(): Promise<void> {
		if (proposing) return;
		const missing = [...gaps.missing];
		if (missing.length === 0) return;
		proposing = true;
		proposeError = null;
		try {
			const names = await proposeTopicNames(document, missing, modelOverride);
			for (const code of missing) {
				const name = names[code];
				if (name !== undefined && store.document) {
					const current = store.document.topicNames[code] ?? '';
					if (current.trim() === '') store.setTopicName(code, name);
				}
			}
		} catch (error) {
			proposeError = error instanceof Error ? error.message : 'Proposal failed.';
		} finally {
			proposing = false;
		}
	}

	onMount(() => {
		if (gaps.missing.length > 0) void propose();
	});
</script>

<section class="space-y-4">
	<h1 class="text-xl font-semibold">Topic names</h1>
	<p class="max-w-prose text-sm text-muted-foreground">
		Reports show a student-readable name for every specification point on the paper, never a bare
		code. Names stay with their code; retyping a code drops its name.
	</p>
	{#if proposeError}
		<p role="alert" class="rounded-md border border-destructive p-3 text-sm">
			{proposeError}
			<Button
				variant="outline"
				size="sm"
				class="ml-2"
				disabled={proposing}
				onclick={() => void propose()}>Retry</Button
			>
		</p>
	{/if}
	<ul class="max-w-xl space-y-2">
		{#each codes as code (code)}
			<li class="flex items-center gap-3">
				<span class="w-24 shrink-0 font-mono text-sm">{code}</span>
				<Label class="sr-only" for={`topic-${code}`}>Name for {code}</Label>
				<input
					id={`topic-${code}`}
					class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
					value={document.topicNames[code] ?? ''}
					maxlength={MAX_LABEL_LENGTH}
					placeholder={proposing ? 'Proposing…' : 'Name this topic'}
					oninput={(event) => store.setTopicName(code, event.currentTarget.value)}
				/>
			</li>
		{/each}
	</ul>
	<div class="flex flex-wrap gap-2">
		<Button
			variant="outline"
			disabled={proposing || gaps.missing.length === 0}
			onclick={() => void propose()}
		>
			{proposing ? 'Proposing…' : 'Propose missing names'}
		</Button>
		<Button disabled={gaps.blocked} onclick={onnext}>Next</Button>
	</div>
	{#if gaps.blocked}
		<p class="text-sm text-muted-foreground">
			{#if gaps.overLong.length > 0}
				Keep every name to {MAX_LABEL_LENGTH} characters: longer names fail the report run.
			{:else}
				Name every topic before continuing: reports never show a bare code.
			{/if}
		</p>
	{/if}
</section>
