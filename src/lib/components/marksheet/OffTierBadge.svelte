<!--
	A student's marks on a tier they are not on: kept in the document, never
	counted in a total, and returned to service the moment the student moves back.
	A dashed mark rather than a warning, because nothing has been lost.
-->
<script lang="ts">
	import type { StoredStudent, TierIndex } from '$lib/marksheet/document.js';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import { tierLabel } from './tier-label.js';

	let { student }: { student: StoredStudent } = $props();

	const store = marksheetStore();
	const document = $derived(store.document);

	/**
	 * Every other tier the student holds a mark on, one badge each: a student
	 * still waiting for a tier can have marks on both papers.
	 */
	const held = $derived.by(() => {
		if (!document) return [];
		const marks = document.marks[student.id] ?? {};
		const badges: {
			tier: TierIndex;
			label: string;
			short: string;
			count: number;
			title: string;
		}[] = [];
		for (const tier of [0, 1] as const) {
			if (tier === student.tier) continue;
			const stored = document.tiers[tier];
			if (stored === undefined) continue;
			const count = stored.breakdown.entries.filter(
				(entry) => marks[entry.id] !== undefined
			).length;
			if (count === 0) continue;
			const name = stored.tierName;
			const label = tierLabel(document, tier);
			const where =
				student.tier === null
					? 'they have no tier'
					: `they are on ${tierLabel(document, student.tier)}`;
			badges.push({
				tier,
				label,
				short: name ? name.trim().charAt(0).toUpperCase() : `T${tier + 1}`,
				count,
				title: `${count} ${count === 1 ? 'mark' : 'marks'} on ${label} are kept but not counted while ${where}. ${count === 1 ? 'It counts' : 'They count'} again if the student moves back.`
			});
		}
		return badges;
	});
</script>

{#each held as badge (badge.tier)}
	<span
		class="shrink-0 rounded border border-dashed border-muted-foreground/60 px-1 text-[10px] text-muted-foreground tabular-nums"
		data-testid="off-tier-badge"
		data-tier={badge.tier}
		title={badge.title}
	>
		+{badge.count}
		{badge.short}
	</span>
{/each}
