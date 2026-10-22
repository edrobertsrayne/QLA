<!-- A /reports layout and the step page the spec router is on. Test-only. -->
<script lang="ts">
	import Layout from './+layout.svelte';
	import Grades from './grades/+page.svelte';
	import Review from './review/+page.svelte';
	import Topics from './topics/+page.svelte';
	import Who from './who/+page.svelte';
	import Writing from './writing/+page.svelte';
	import type { TestRouter } from './reports-router.spec-helpers.js';

	let { router }: { router: TestRouter } = $props();

	// The router is a plain object, not reactive: it tells this harness when its step moves.
	// svelte-ignore state_referenced_locally
	let step = $state(router.step);
	// svelte-ignore state_referenced_locally
	router.onchange = () => (step = router.step);
</script>

{#snippet page()}
	{#if step === 'topics'}
		<Topics />
	{:else if step === 'grades'}
		<Grades />
	{:else if step === 'who'}
		<Who />
	{:else if step === 'writing'}
		<Writing />
	{:else if step === 'review'}
		<Review />
	{/if}
{/snippet}

{#if step}
	<Layout data={{ step }} children={page} />
{/if}
