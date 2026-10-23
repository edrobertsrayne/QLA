<!-- PROTOTYPE (#114) — a student's marks on the tier they are not on: kept, not counted. -->
<script lang="ts">
	import { tieredSheet, type Student } from './sheet.svelte.js';

	let { student }: { student: Student } = $props();
	const sheet = tieredSheet();
	const off = $derived(sheet.offTierMarkCount(student));
</script>

{#if off}
	<span
		class="shrink-0 rounded border border-dashed border-muted-foreground/60 px-1 text-[10px] text-muted-foreground tabular-nums"
		title={`${off.count} marks on ${sheet.tiers[off.tier].name} are kept but not counted while ${sheet.studentName(student)} ${student.tier === null ? 'has no tier' : `is on ${sheet.tiers[student.tier].name}`}. Move back to count them.`}
	>
		+{off.count}
		{sheet.tiers[off.tier].name[0]}
	</span>
{/if}
