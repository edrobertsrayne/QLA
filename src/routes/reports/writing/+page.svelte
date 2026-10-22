<script lang="ts">
	import WritingStep from '$lib/components/report/WritingStep.svelte';
	import { goToStep, reportsFlow } from '$lib/components/report/reports-flow.svelte.js';

	const flow = reportsFlow();
</script>

<WritingStep
	run={flow.run}
	roster={flow.roster}
	onretry={(ids) => flow.writeAgain(ids)}
	onreview={() => goToStep('review')}
	onback={() => goToStep('who')}
/>
