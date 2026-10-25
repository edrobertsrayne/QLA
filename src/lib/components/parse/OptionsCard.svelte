<!-- The shared options: one model and one specification link for the whole run. -->
<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import ModelSelect from './ModelSelect.svelte';
	import { ModelList } from './model-list.svelte.js';
	import { onMount } from 'svelte';
	import type { UploadRun } from './run.svelte.js';

	interface Props {
		run: UploadRun;
	}

	let { run }: Props = $props();

	const models = new ModelList();

	async function loadModels(): Promise<void> {
		if (!(await models.load())) return;
		if (
			run.modelOverride !== '' &&
			!models.options.some((model) => model.id === run.modelOverride)
		) {
			run.modelOverride = '';
		}
	}

	onMount(() => {
		void loadModels();
	});
</script>

<Card.Root class="overflow-visible">
	<Card.Header>
		<Card.Title>Options</Card.Title>
		<Card.Description>
			{run.twoTiers
				? 'Used for both tiers. Pick a curated model with native PDF parsing.'
				: 'Pick a curated model with native PDF parsing.'}
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<fieldset class="min-w-0 space-y-4 border-0 p-0" disabled={run.phase !== 'form'}>
			<div class="space-y-2">
				<Label>Model override (optional)</Label>
				<ModelSelect
					bind:value={run.modelOverride}
					models={models.options}
					loading={models.loading}
					loadError={models.error}
					onretry={() => void loadModels()}
				/>
			</div>
			<div class="space-y-2">
				<Label for="spec">Specification link (optional)</Label>
				<Input
					id="spec"
					type="url"
					inputmode="url"
					placeholder="https://…/specification.pdf"
					value={run.specUrl}
					aria-invalid={run.specUrlError !== null}
					oninput={(event) => run.setSpecUrl((event.currentTarget as HTMLInputElement).value)}
				/>
				{#if run.specUrlError}
					<p class="text-sm text-destructive">{run.specUrlError}</p>
				{:else}
					<p class="text-sm text-muted-foreground">
						Link to the exam board specification PDF. It is fetched for this run only and must be a
						readable PDF.
					</p>
				{/if}
			</div>
		</fieldset>
	</Card.Content>
</Card.Root>
