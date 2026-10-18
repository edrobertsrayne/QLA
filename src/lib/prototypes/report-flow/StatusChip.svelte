<!-- PROTOTYPE — one student's report state in a word, shared by the variants' lists. -->
<script lang="ts">
	import LoaderIcon from '@lucide/svelte/icons/loader-circle';
	import { blockerText, reportFlow, type StudentRow } from './flow.svelte.js';

	let { row, long = false }: { row: StudentRow; long?: boolean } = $props();
	const flow = reportFlow();
	const report = $derived(flow.reports[row.student.id]);
</script>

{#if !row.eligible}
	<span class="text-xs text-muted-foreground" title={row.blockers.map(blockerText).join('; ')}>
		{long
			? row.blockers.map(blockerText).join('; ')
			: row.blockers[0].kind === 'absent'
				? 'Absent'
				: 'Blocked'}
	</span>
{:else if !report}
	<span class="text-xs text-muted-foreground">Not written</span>
{:else if report.status === 'queued'}
	<span class="text-xs text-muted-foreground">Queued</span>
{:else if report.status === 'generating'}
	<span class="flex items-center gap-1 text-xs"
		><LoaderIcon class="size-3 animate-spin" /> Writing</span
	>
{:else if report.status === 'failed'}
	<span class="text-xs text-red-700 dark:text-red-400" title={report.error ?? ''}>
		{long ? report.error : 'Failed'}
	</span>
{:else}
	<span class="flex items-center gap-1 text-xs">
		<span class="text-emerald-700 dark:text-emerald-400">Ready</span>
		{#if report.edited}<span class="rounded bg-blue-500/15 px-1">edited</span>{/if}
		{#if report.stale}<span class="rounded bg-amber-400/30 px-1">out of date</span>{/if}
	</span>
{/if}
