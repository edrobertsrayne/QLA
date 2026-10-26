<!--
	The nav: where the teacher is, and the two things that belong to the whole app
	rather than to a surface.

	A breadcrumb — `QLA / paper label / class` — in which each part appears only
	once it exists. It does not show the upload → breakdown → marksheet flow: the
	surface itself says where you are. The paper label is edited as the page's
	heading, not here. On the right, a quiet "New class…" once there is a class to
	discard, "New upload…" whenever there is a document to discard, then the theme.
-->
<script lang="ts">
	import NewClassDialog from '$lib/components/marksheet/NewClassDialog.svelte';
	import NewUploadDialog from '$lib/components/marksheet/NewUploadDialog.svelte';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import ThemeToggle from './ThemeToggle.svelte';

	const store = marksheetStore();

	const label = $derived(store.label);
	const className = $derived(store.className);
	const hasClass = $derived(store.students.length > 0);
	const parts = $derived([label, className].filter((part): part is string => part !== null));
</script>

<header class="flex h-12 items-center gap-2 border-b px-6 text-sm">
	<nav aria-label="Breadcrumb" class="min-w-0">
		<ol class="flex items-center gap-2">
			<li class="font-semibold tracking-tight">QLA</li>
			{#each parts as part, index (index)}
				<li aria-hidden="true" class="text-muted-foreground">/</li>
				<li class="truncate text-muted-foreground">{part}</li>
			{/each}
		</ol>
	</nav>
	<div class="ml-auto flex items-center gap-2">
		{#if hasClass}
			<NewClassDialog />
		{/if}
		{#if store.document}
			<NewUploadDialog />
		{/if}
		<ThemeToggle />
	</div>
</header>
