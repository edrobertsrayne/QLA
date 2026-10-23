<!--
	The marksheet: the class against the confirmed breakdown. The breakdown is
	read-only here — its columns are keyed against by the marks — so the class is
	the editable half of this surface.
-->
<script lang="ts">
	// PROTOTYPE (#114): ?variant=A renders the settled two-tier tier-tab design on stub
	// data (in-memory, AQA 8463 P1 H/F). B and C are the rejected alternatives, off the bar.
	// PROTOTYPE (#118): S1 is today's page over a single-tier 8463 1H document; S2 is A's
	// design collapsed to one tier. No variant = today's page, untouched.
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
		{ key: 'A', label: 'Two tiers (settled)' },
		{ key: 'S1', label: "One tier · today's page" },
		{ key: 'S2', label: 'One tier · two-tier design' }
	];
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

{#if variant === null || variant === 'S1'}
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
	{#if variant !== null}
		<PrototypeSwitcher variants={VARIANTS} current={variant} />
	{/if}
{:else if variant === 'S2'}
	<VariantA single />
	<!-- PROTOTYPE (#118): S2's one-tier stub is fixed, so the two-tier scenario picker is not shown. -->
	<PrototypeSwitcher variants={VARIANTS} current={variant} />
{:else}
	{#if variant === 'B'}
		<VariantB />
	{:else if variant === 'C'}
		<VariantC />
	{:else}
		<VariantA />
	{/if}
	<StubPanel />
	<PrototypeSwitcher variants={VARIANTS} current={variant} />
{/if}
