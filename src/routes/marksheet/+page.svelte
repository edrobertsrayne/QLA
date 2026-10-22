<!--
	The marksheet: the class against the confirmed breakdown. The breakdown is
	read-only here — its columns are keyed against by the marks — so the class is
	the editable half of this surface.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import MarksheetGrid from '$lib/components/marksheet/MarksheetGrid.svelte';
	import ReportBanner from '$lib/components/report/ReportBanner.svelte';
	import BackupCard from '$lib/components/shell/BackupCard.svelte';
	// PROTOTYPE (#93): ?variant=A..E swaps the backup control for a mockup.
	import BackupPrototypeControls from '$lib/components/shell/backup-prototype/BackupPrototypeControls.svelte';
	import BackupVariantA from '$lib/components/shell/backup-prototype/VariantA.svelte';
	import BackupVariantD from '$lib/components/shell/backup-prototype/VariantD.svelte';
	import { protoVariant } from '$lib/components/shell/backup-prototype/proto.svelte.js';
	import PaperLabelInput from '$lib/components/shell/PaperLabelInput.svelte';
	import { Input } from '$lib/components/ui/input';
	import { totalMarks } from '$lib/marksheet/document.js';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import { count } from '$lib/prose.js';

	// The route's load guard has read storage by the time this renders.
	const store = marksheetStore();

	const entries = $derived(store.entries);
	const students = $derived(store.students);
	const marks = $derived(totalMarks(entries));
	const className = $derived(store.document?.paper.className ?? null);
	const title = $derived(className ? `${className} · Marksheet · QLA` : 'Marksheet · QLA');
	const summary = $derived(
		[
			count(students.length, 'student'),
			count(entries.length, 'entry', 'entries'),
			`${marks} marks`
		].join(' · ')
	);
	const variant = $derived(protoVariant());

	/** Open the analysis, at one entry when the teacher asked from that entry's figure. */
	function openAnalysis(entryId: string | null): void {
		const path = resolve('/marksheet/analysis');
		// resolve() has no query string, so the base-resolved path takes it here.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(entryId === null ? path : `${path}?entry=${encodeURIComponent(entryId)}`);
	}
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<main class="mx-auto max-w-6xl space-y-4 p-6">
	<header class="space-y-3">
		<div class="space-y-1">
			<PaperLabelInput />
			<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
				<Input
					aria-label="Class name"
					class="h-8 w-40 border-transparent bg-transparent px-1 shadow-none hover:border-input"
					placeholder="Name this class"
					value={className ?? ''}
					oninput={(event) => store.setClassName(event.currentTarget.value)}
				/>
				<p class="text-sm text-muted-foreground">{summary}</p>
				{#if variant === 'D'}<BackupVariantD />{/if}
			</div>
		</div>
		{#if variant === null}
			<BackupCard />
		{:else if variant === 'A'}
			<BackupVariantA />
		{/if}
	</header>

	<ReportBanner />

	<MarksheetGrid onViewAnalysis={openAnalysis} />
</main>

{#if variant !== null}
	<BackupPrototypeControls />
{/if}
