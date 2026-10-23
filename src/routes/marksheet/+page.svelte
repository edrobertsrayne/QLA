<!--
	The marksheet: the class against the confirmed breakdown. The breakdown is
	read-only here — its columns are keyed against by the marks — so the class is
	the editable half of this surface.
-->
<script lang="ts">
	// PROTOTYPE (#114): ?variant=A|B|C renders a stubbed two-tier marksheet instead of
	// today's page (in-memory, AQA 8463 P1 H/F). No variant = today's page, untouched.
	import { page } from '$app/state';
	import PrototypeSwitcher from '$lib/components/prototype/PrototypeSwitcher.svelte';
	import StubPanel from '$lib/prototypes/marksheet-tiers/StubPanel.svelte';
	import VariantA from '$lib/prototypes/marksheet-tiers/VariantA.svelte';
	import VariantB from '$lib/prototypes/marksheet-tiers/VariantB.svelte';
	import VariantC from '$lib/prototypes/marksheet-tiers/VariantC.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import MarksheetGrid from '$lib/components/marksheet/MarksheetGrid.svelte';
	import ReportBanner from '$lib/components/report/ReportBanner.svelte';
	import BackupCard from '$lib/components/shell/BackupCard.svelte';
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

	/** Open the analysis, at one entry when the teacher asked from that entry's figure. */
	function openAnalysis(entryId: string | null): void {
		const path = resolve('/marksheet/analysis');
		// resolve() has no query string, so the base-resolved path takes it here.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(entryId === null ? path : `${path}?entry=${encodeURIComponent(entryId)}`);
	}

	const variant = $derived(page.url.searchParams.get('variant'));
	const VARIANTS = [
		{ key: 'A', label: 'Tier tabs' },
		{ key: 'B', label: 'One roster' },
		{ key: 'C', label: 'Stacked tiers' }
	];
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

{#if variant !== null}
	{#if variant === 'B'}
		<VariantB />
	{:else if variant === 'C'}
		<VariantC />
	{:else}
		<VariantA />
	{/if}
	<StubPanel />
	<PrototypeSwitcher variants={VARIANTS} current={variant} />
{:else}
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
				</div>
			</div>
			<BackupCard />
		</header>

		<ReportBanner />

		<MarksheetGrid onViewAnalysis={openAnalysis} />
	</main>
{/if}
