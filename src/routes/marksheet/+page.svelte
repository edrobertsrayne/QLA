<!--
	Where a confirmed breakdown lands: the columns the marksheet is built from,
	read-only. The class and its marks arrive with the grid.
-->
<script lang="ts">
	import NewUploadDialog from '$lib/components/marksheet/NewUploadDialog.svelte';
	import * as Table from '$lib/components/ui/table';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import { totalMarks } from '$lib/marksheet/document.js';

	// The route's load guard has read storage by the time this renders.
	const store = marksheetStore();

	const entries = $derived(store.document?.breakdown.entries ?? []);
	const students = $derived(store.document?.students ?? []);
	const marks = $derived(totalMarks(entries));
	const title = $derived(
		store.document?.paper.className
			? `${store.document.paper.className} · Marksheet · QLA`
			: 'Marksheet · QLA'
	);
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<main class="mx-auto max-w-5xl space-y-6 p-6">
	<header class="flex items-start justify-between gap-4">
		<div class="space-y-2">
			<h1 class="text-2xl font-bold tracking-tight">
				{store.document?.paper.className ?? 'Marksheet'}
			</h1>
			<p class="text-sm text-muted-foreground">
				{entries.length} entries · {marks} marks · {students.length} students
			</p>
		</div>
		<NewUploadDialog />
	</header>

	<div class="overflow-hidden rounded-xl border">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-48">Student</Table.Head>
					{#each entries as entry (entry.id)}
						<Table.Head class="w-16 px-2">
							<span class="block">{entry.label}</span>
							<span class="block text-xs font-normal text-muted-foreground">
								/{entry.marks ?? '?'}
							</span>
						</Table.Head>
					{/each}
				</Table.Row>
			</Table.Header>
		</Table.Root>
	</div>
</main>
