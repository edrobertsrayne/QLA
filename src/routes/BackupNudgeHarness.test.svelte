<!--
	A route shell with the app's Toaster: the two surfaces that carry the backup
	control, one at a time, so a test can cross from one to the other without
	losing the session.
-->
<script lang="ts">
	import { Toaster } from '$lib/components/ui/sonner';
	import BreakdownPage from './breakdown/+page.svelte';
	import MarksheetPage from './marksheet/+page.svelte';

	let marksheet = $state(true);
</script>

<Toaster />
<button type="button" onclick={() => (marksheet = !marksheet)}>Switch surface</button>
{#if marksheet}
	<MarksheetPage />
{:else}
	<BreakdownPage />
{/if}
