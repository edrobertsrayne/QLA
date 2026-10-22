<script lang="ts">
	import WhoStep from '$lib/components/report/WhoStep.svelte';
	import { reportsFlow } from '$lib/components/report/reports-flow.svelte.js';

	const flow = reportsFlow();
</script>

<WhoStep
	roster={flow.roster}
	running={flow.run.running}
	models={flow.models}
	bind:modelOverride={flow.modelOverride}
	bind:modelCustom={flow.modelCustom}
	onwrite={(ids) => flow.writeNew(ids)}
/>
