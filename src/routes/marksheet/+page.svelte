<!--
	The marksheet: the class against the confirmed breakdown. The breakdown is
	read-only here — its columns are keyed against by the marks — so the class is
	the editable half of this surface.
-->
<script lang="ts">
	import AnalysisView from '$lib/components/marksheet/AnalysisView.svelte';
	import MarksheetGrid from '$lib/components/marksheet/MarksheetGrid.svelte';
	import NewUploadDialog from '$lib/components/marksheet/NewUploadDialog.svelte';
	import { Input } from '$lib/components/ui/input';
	import { totalMarks } from '$lib/marksheet/document.js';
	import { marksheetStore } from '$lib/marksheet/index.js';

	// The route's load guard has read storage by the time this renders.
	const store = marksheetStore();

	/** Which half of the sheet is on screen: the grid, or the whole sheet's figures. */
	let view = $state<'grid' | 'analysis'>('grid');
	/** The entry the analysis was opened at, to outline and scroll to, or null for all of them. */
	let highlighted = $state<string | null>(null);

	const entries = $derived(store.document?.breakdown.entries ?? []);
	const students = $derived(store.document?.students ?? []);
	const marks = $derived(totalMarks(entries));
	const className = $derived(store.document?.paper.className ?? null);
	const title = $derived(className ? `${className} · Marksheet · QLA` : 'Marksheet · QLA');
	const summary = $derived(
		[
			`${students.length} student${students.length === 1 ? '' : 's'}`,
			`${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`,
			`${marks} marks`
		].join(' · ')
	);

	function onClassNameInput(event: Event): void {
		store.setClassName((event.currentTarget as HTMLInputElement).value);
	}

	/** Open the analysis, at one entry when the teacher asked from that entry's figure. */
	function openAnalysis(entryId: string | null): void {
		highlighted = entryId;
		view = 'analysis';
	}
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<main class="mx-auto max-w-6xl space-y-4 p-6">
	{#if view === 'grid'}
		<header class="flex items-start justify-between gap-4">
			<div class="space-y-2">
				<Input
					aria-label="Class name"
					class="h-auto border-transparent bg-transparent px-1 text-2xl font-bold tracking-tight shadow-none hover:border-input"
					placeholder="Name this class"
					value={className ?? ''}
					oninput={onClassNameInput}
				/>
				<p class="px-1 text-sm text-muted-foreground">{summary}</p>
			</div>
			<NewUploadDialog />
		</header>

		<MarksheetGrid onViewAnalysis={openAnalysis} />
	{:else}
		<AnalysisView highlight={highlighted} onBack={() => (view = 'grid')} />
	{/if}
</main>
