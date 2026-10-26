<!--
	Reports: topic names, grades, who gets one, the writing, and the pages to
	review and print. Each step is its own route; this layout owns what must
	survive moving between them: the run, the model choice, the step navigation
	and the printer.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onDestroy, onMount, type Snippet } from 'svelte';
	import PrintRoot from '$lib/components/report/PrintRoot.svelte';
	import {
		goToStep,
		provideReportsFlow,
		ReportsFlow
	} from '$lib/components/report/reports-flow.svelte.js';
	import { Button } from '$lib/components/ui/button';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import { availableSteps, stepTitleOf, type ReportStep } from '$lib/marksheet/report-steps.js';

	let { data, children }: { data: { step: ReportStep }; children: Snippet } = $props();

	const store = marksheetStore();
	const document = $derived(store.document);
	const steps = $derived(document ? availableSteps(document) : []);
	const className = $derived(document?.className ?? null);
	const stepTitle = $derived(stepTitleOf(data.step));
	const title = $derived(`${className ? `${className} · ` : ''}Reports — ${stepTitle} · QLA`);

	const flow = new ReportsFlow(store);
	provideReportsFlow(flow);
	onMount(() => void flow.models.load());
	onDestroy(() => flow.detach());
</script>

<svelte:window onafterprint={() => (flow.printing = null)} />

<svelte:head>
	<title>{title}</title>
</svelte:head>

<main class="mx-auto max-w-6xl space-y-6 p-6 print:hidden">
	<div class="flex flex-wrap items-center gap-4">
		<Button variant="ghost" size="sm" onclick={() => void goto(resolve('/marksheet'))}>
			← Marksheet
		</Button>
		<nav aria-label="Report steps">
			<ol class="flex flex-wrap items-center gap-2 text-sm">
				{#each steps as item, index (item.id)}
					<li>
						<Button
							size="sm"
							variant={data.step === item.id ? 'default' : 'outline'}
							aria-current={data.step === item.id ? 'step' : undefined}
							aria-disabled={item.locked || undefined}
							aria-describedby={item.locked ? 'locked-steps-reason' : undefined}
							onclick={() => {
								// A locked step stays focusable so its reason can be read;
								// the click is what does nothing.
								if (!item.locked) goToStep(item.id);
							}}>{index + 1}. {item.label}</Button
						>
					</li>
				{/each}
			</ol>
			{#if steps.some((item) => item.locked)}
				<p id="locked-steps-reason" class="mt-1 text-xs text-muted-foreground">
					Name every topic first to unlock the later steps.
				</p>
			{/if}
		</nav>
	</div>

	{@render children()}
</main>

{#if document}
	<PrintRoot {document} ids={flow.printing ?? flow.reviewIds} bind:root={flow.printRoot} />
{/if}
