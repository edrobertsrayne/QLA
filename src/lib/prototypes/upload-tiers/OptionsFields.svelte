<!-- PROTOTYPE — today's model + specification fields, bound to the fake run. Shared widget. -->
<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import ModelSelect from '$lib/components/parse/ModelSelect.svelte';
	import { ModelList } from '$lib/components/parse/model-list.svelte.js';
	import { onMount } from 'svelte';
	import { uploadRun } from './run.svelte.js';

	interface Props {
		/** Extra line under the spec field, e.g. "Used for both tiers." */
		sharedNote?: string | null;
		disabled?: boolean;
	}

	let { sharedNote = null, disabled = false }: Props = $props();

	const run = uploadRun();
	const models = new ModelList();

	onMount(() => {
		void models.load();
	});
</script>

<fieldset class="space-y-4" {disabled}>
	<div class="space-y-2">
		<Label>Model override (optional)</Label>
		<ModelSelect
			bind:value={run.modelOverride}
			bind:custom={run.modelCustom}
			models={models.options}
			loading={models.loading}
			loadError={models.error}
			onretry={() => void models.load()}
		/>
	</div>
	<div class="space-y-2">
		<Label for="proto-spec">Specification link (optional)</Label>
		<Input
			id="proto-spec"
			type="url"
			inputmode="url"
			placeholder="https://…/specification.pdf"
			bind:value={run.specUrl}
		/>
		<p class="text-sm text-muted-foreground">
			Link to the exam board specification PDF. It is fetched for this run only and must be a
			readable PDF.
		</p>
	</div>
	{#if sharedNote}
		<p class="text-sm font-medium text-muted-foreground">{sharedNote}</p>
	{/if}
</fieldset>
