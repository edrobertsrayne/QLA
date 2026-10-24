<!--
	The open tier's side of one pair: a picker of the other tier's free entries
	that carry the same known available marks, plus the partner this entry
	already has. A pair is one fact, stored once, so the same partner shows on
	both tiers' tables and changing it here changes it there.
-->
<script lang="ts">
	import { entryName } from '$lib/marksheet/breakdown.js';
	import type { BreakdownEntry, TierIndex } from '$lib/marksheet/document.js';
	import { marksheetStore } from '$lib/marksheet/index.js';

	let { tier, entry }: { tier: TierIndex; entry: BreakdownEntry } = $props();

	const store = marksheetStore();
	const other: TierIndex = $derived(tier === 0 ? 1 : 0);
	const partnerId = $derived(store.partnerOf(tier, entry.id));
	const partner = $derived(
		partnerId === null
			? null
			: (store.entriesOf(other).find((candidate) => candidate.id === partnerId) ?? null)
	);
	/**
	 * A pair whose marks were edited apart — or left unknown — still shows, so it
	 * can be seen and cleared, and it blocks confirmation rather than vanishing.
	 */
	const invalidPair = $derived(
		partner !== null &&
			(entry.marks === null || partner.marks === null || partner.marks !== entry.marks)
	);

	/** The other tier's entries this one may be paired with: equal marks, and free or already its partner. */
	const candidates = $derived.by(() => {
		if (entry.marks === null) return [];
		return store
			.entriesOf(other)
			.filter(
				(candidate) =>
					candidate.marks === entry.marks &&
					(candidate.id === partnerId || store.pairOf(other, candidate.id) === null)
			);
	});

	/** The current partner, when the candidates above do not already carry them. */
	const strayPartner = $derived(
		partner !== null && !candidates.some((candidate) => candidate.id === partner.id)
			? partner
			: null
	);

	/** Whether the other tier has any equal-mark entry at all, paired or not. */
	const hasEqualMarkEntry = $derived(
		entry.marks !== null &&
			store.entriesOf(other).some((candidate) => candidate.marks === entry.marks)
	);

	/** Why the picker has no partner to offer, said in place of a bare dash. */
	const emptyLabel = $derived(
		entry.marks === null
			? 'Add available marks first'
			: candidates.length === 0 && partner === null
				? hasEqualMarkEntry
					? 'Every equal-mark question is paired'
					: '— (no equal-mark entry)'
				: '—'
	);

	function choose(partnerId: string): void {
		store.setCommonQuestion(tier, entry.id, partnerId === '' ? null : partnerId);
	}
</script>

<select
	aria-label={`Common question for ${entryName(entry)}`}
	class={[
		'w-full rounded-sm border bg-transparent px-1 py-1 text-xs focus:border-ring focus:outline-none',
		invalidPair
			? 'border-destructive text-destructive'
			: partner === null
				? 'text-muted-foreground'
				: 'border-violet-400 text-violet-800 dark:text-violet-300'
	]}
	value={partnerId ?? ''}
	disabled={entry.marks === null && partner === null}
	onchange={(event) => choose(event.currentTarget.value)}
>
	<option value="">
		{emptyLabel}
	</option>
	{#if strayPartner}
		<option value={strayPartner.id}>
			{entryName(strayPartner)} ({strayPartner.marks ?? '?'} marks{invalidPair ? ', unequal' : ''})
		</option>
	{/if}
	{#each candidates as candidate (candidate.id)}
		<option value={candidate.id}>{candidate.label} · {candidate.summary.slice(0, 28)}</option>
	{/each}
</select>
