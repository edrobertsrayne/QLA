<!--
	PROTOTYPE — the topic names list (#51): one field per normalised code, the proposal
	state, and "propose missing names". Variants decide where it sits.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { normaliseCodes, reportFlow } from './flow.svelte.js';

	const flow = reportFlow();
	const summaries = (code: string) =>
		flow.entries
			.filter((e) => normaliseCodes(e.specPoint).includes(code))
			.map((e) => `${e.label}: ${e.summary}`)
			.join('\n');
</script>

<div class="space-y-2">
	<div class="flex flex-wrap items-center gap-2 text-xs">
		{#if flow.proposal === 'running'}
			<span class="text-muted-foreground">Proposing names…</span>
		{:else if flow.proposal === 'failed'}
			<span class="text-red-700 dark:text-red-400"
				>Couldn't propose names. Type them, or try again.</span
			>
		{:else if flow.missingNames.length > 0}
			<span class="text-amber-700 dark:text-amber-300">
				{flow.missingNames.length} missing — reports can't be written until every topic has a name
			</span>
		{:else}
			<span class="text-muted-foreground"
				>Every topic named. Students see these names, never the codes.</span
			>
		{/if}
		<Button
			variant="outline"
			size="xs"
			class="ml-auto"
			disabled={flow.missingNames.length === 0 || flow.proposal === 'running'}
			onclick={() => flow.proposeMissingNames()}
		>
			Propose missing names
		</Button>
	</div>
	<div class="grid gap-1">
		{#each flow.codes as code (code)}
			<label class="grid grid-cols-[6rem_1fr] items-center gap-2 text-sm" title={summaries(code)}>
				<span class="font-mono text-xs text-muted-foreground">{code}</span>
				<Input
					class="h-8"
					placeholder="Name this topic"
					value={flow.topicNames[code] ?? ''}
					oninput={(e) => flow.setTopicName(code, e.currentTarget.value)}
				/>
			</label>
		{/each}
	</div>
</div>
