<script lang="ts">
	// PROTOTYPE (#116): ?variant=A|B|C|D renders stubbed report pages (AQA 8463 P1
	// Higher/Foundation, in memory) with the tier name placed per variant. No variant = today's page.
	import { page } from '$app/state';
	import PrototypeSwitcher from '$lib/components/prototype/PrototypeSwitcher.svelte';
	import ReportSheet from '$lib/components/report/ReportSheet.svelte';
	import { SCENARIOS } from '$lib/prototypes/report-tier/stub.js';
	import ReviewStep from '$lib/components/report/ReviewStep.svelte';
	import { reportsFlow } from '$lib/components/report/reports-flow.svelte.js';
	import { marksheetStore } from '$lib/marksheet/index.js';

	const flow = reportsFlow();
	const document = $derived(marksheetStore().document);

	const variant = $derived(page.url.searchParams.get('variant'));
	const VARIANTS = [
		{ key: 'A', label: 'On the paper label line' },
		{ key: 'B', label: 'First cell of the score box' },
		{ key: 'C', label: 'Tag beside the name' },
		{ key: 'D', label: 'Black band across the top' }
	];
</script>

{#if variant !== null}
	<div class="space-y-8 pb-24">
		{#each SCENARIOS as scenario (scenario.studentId)}
			<section class="space-y-2">
				<h2 class="text-sm font-medium text-muted-foreground">{scenario.caption}</h2>
				<ReportSheet
					document={scenario.document}
					studentId={scenario.studentId}
					report={scenario.report}
					tierName={scenario.tierName}
					tierVariant={variant}
				/>
			</section>
		{/each}
	</div>
	<PrototypeSwitcher variants={VARIANTS} current={variant} />
{:else if document}
	<ReviewStep
		{document}
		roster={flow.roster}
		run={flow.run}
		downloading={flow.downloading}
		ondownload={(request) => void flow.download(request)}
		onprint={(ids) => void flow.print(ids)}
		onrewrite={(ids) => flow.rewriteHere(ids)}
		onwritemore={(ids) => flow.writeAgain(ids)}
	/>
{/if}
