<!--
	The marksheet: the class against the confirmed breakdown. The breakdown is
	read-only here — its columns are keyed against by the marks — so the class is
	the editable half of this surface. On a two-tier assessment one sheet holds
	both tiers: the tabs pick whose paper is on screen, and Tier not set is where
	the class is placed before any marks can go in.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import MarksheetGrid from '$lib/components/marksheet/MarksheetGrid.svelte';
	import TierTabs from '$lib/components/marksheet/TierTabs.svelte';
	import type { MarksheetTab } from '$lib/components/marksheet/tier-label.js';
	import ReportBanner from '$lib/components/report/ReportBanner.svelte';
	import PaperLabelInput from '$lib/components/shell/PaperLabelInput.svelte';
	import { Input } from '$lib/components/ui/input';
	import type { TierIndex } from '$lib/marksheet/document.js';
	import { totalMarks } from '$lib/marksheet/document.js';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import { count } from '$lib/prose.js';

	// The route's load guard has read storage by the time this renders.
	const store = marksheetStore();

	const tierCount = $derived(store.tierCount);
	const students = $derived(store.students);
	const entries = $derived(store.entries);
	const marks = $derived(totalMarks(entries));
	const className = $derived(store.className);
	const title = $derived(className ? `${className} · Marksheet · QLA` : 'Marksheet · QLA');
	const summary = $derived(
		[
			count(students.length, 'student'),
			count(entries.length, 'entry', 'entries'),
			`${marks} marks`
		].join(' · ')
	);

	/**
	 * The tab a two-tier sheet opens on: the first paper with students on it, so
	 * an all-Foundation class does not open on an empty Tier 1. With nobody placed
	 * yet it opens on Tier not set, where the placing happens.
	 */
	function initialTab(): MarksheetTab {
		if (store.tierCount !== 2) return 0;
		if (store.studentsOf(0).length > 0) return 0;
		return store.studentsOf(1).length > 0 ? 1 : 'unset';
	}

	let tab = $state<MarksheetTab>(initialTab());
	const tier = $derived<TierIndex | null>(tierCount === 1 ? 0 : tab === 'unset' ? null : tab);

	/** Open the analysis at one entry, on the tier whose figures the teacher clicked. */
	function openAnalysis(entryId: string | null): void {
		const path = resolve('/marksheet/analysis');
		const parts: string[] = [];
		if (tierCount === 2 && tier !== null) parts.push(`tier=${tier}`);
		if (entryId !== null) parts.push(`entry=${encodeURIComponent(entryId)}`);
		const search = parts.join('&');
		// resolve() has no query string, so the base-resolved path takes it here.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(search === '' ? path : `${path}?${search}`);
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
			</div>
		</div>
	</header>

	<ReportBanner {tier} />

	{#if tierCount === 2}
		<TierTabs {tab} onTab={(next) => (tab = next)} />
	{/if}

	{#key tier}
		<MarksheetGrid {tier} onViewAnalysis={openAnalysis} />
	{/key}
</main>
