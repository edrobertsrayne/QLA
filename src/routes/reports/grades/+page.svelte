<script lang="ts">
	import GradeBoundariesForm from '$lib/components/report/GradeBoundariesForm.svelte';
	import { goToStep } from '$lib/components/report/reports-flow.svelte.js';
	import { Button } from '$lib/components/ui/button';
	import { boundariesOf } from '$lib/marksheet/grades.js';
	import { marksheetStore } from '$lib/marksheet/index.js';

	const document = $derived(marksheetStore().document);
</script>

{#if document}
	<section class="max-w-xl space-y-4">
		<h1 class="text-xl font-semibold">Grades</h1>
		<p class="max-w-prose text-sm text-muted-foreground">
			Reports show a grade when the paper has boundaries. Set them now, or skip and reports show
			marks only.
		</p>
		<GradeBoundariesForm onDone={() => goToStep('who')} />
		<div class="flex flex-wrap gap-2">
			{#if boundariesOf(document)}
				<Button onclick={() => goToStep('who')}>Next</Button>
			{:else}
				<Button variant="outline" onclick={() => goToStep('who')}>
					Skip: no grades on these reports
				</Button>
			{/if}
		</div>
	</section>
{/if}
