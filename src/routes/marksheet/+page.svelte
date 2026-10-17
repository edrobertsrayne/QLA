<script lang="ts">
	import NewUploadDialog from '$lib/components/marksheet/NewUploadDialog.svelte';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import { totalMarks } from '$lib/marksheet/document.js';

	// The route's load guard has read storage by the time this renders.
	const store = marksheetStore();

	const entries = $derived(store.document?.breakdown.entries ?? []);
	const students = $derived(store.document?.students ?? []);
	const marks = $derived(totalMarks(entries));
</script>

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
</main>
