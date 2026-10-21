<!--
	PROTOTYPE (#92), throwaway: the reports page's Writing step with dummy
	students, reachable without a marksheet. The header mirrors /reports;
	?variant=A|B|C|D picks the tile treatment.
-->
<script lang="ts">
	import { page } from '$app/state';
	import TileStatusPrototype from '$lib/components/report/prototype/TileStatusPrototype.svelte';
	import { Button } from '$lib/components/ui/button';

	const STEPS = ['Topic names', 'Grades', 'Who gets one', 'Writing', 'Review and print'];
	const variant = $derived(page.url.searchParams.get('variant') ?? 'A');
</script>

<svelte:head>
	<title>Reports prototype · QLA</title>
</svelte:head>

<main class="mx-auto max-w-6xl space-y-6 p-6">
	<div class="flex flex-wrap items-center gap-4">
		<Button variant="ghost" size="sm">← Marksheet</Button>
		<nav aria-label="Report steps">
			<ol class="flex flex-wrap items-center gap-2 text-sm">
				{#each STEPS as label, index (label)}
					<li>
						<Button
							size="sm"
							variant={label === 'Writing' ? 'default' : 'outline'}
							aria-current={label === 'Writing' ? 'step' : undefined}>{index + 1}. {label}</Button
						>
					</li>
				{/each}
			</ol>
		</nav>
	</div>

	<TileStatusPrototype {variant} names={[]} />
</main>
