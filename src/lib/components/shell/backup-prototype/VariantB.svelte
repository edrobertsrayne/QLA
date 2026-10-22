<!--
	PROTOTYPE (#93) variant B, grid toolbar: no header card. Backup is one more
	tool in the row above the grid, at the right beside the marks export, with
	its age as a caption. An editor-style dot on the button marks unsaved
	changes; a divider keeps it apart from the CSV that is "not a backup".
-->
<script lang="ts">
	import HardDriveDownloadIcon from '@lucide/svelte/icons/hard-drive-download';
	import { Button } from '$lib/components/ui/button';
	import { proto } from './proto.svelte.js';

	const title = $derived(
		proto.never
			? 'Never backed up'
			: proto.changedAge === null
				? 'Nothing new since the last backup'
				: `Changes since ${proto.changedAge} aren't backed up`
	);
</script>

<div class="flex items-center gap-2 border-r pr-2" data-testid="backup-control">
	<span class="text-[11px] text-muted-foreground">
		{proto.never ? 'No backup yet' : `Backup ${proto.age}`}
	</span>
	<Button
		variant={proto.enabled ? 'default' : 'outline'}
		size="xs"
		class="relative"
		disabled={!proto.enabled}
		{title}
		onclick={() => proto.backUp()}
	>
		<HardDriveDownloadIcon class="size-3.5" /> Back up now
		{#if proto.enabled}
			<span
				aria-hidden="true"
				class="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-sky-500 ring-2 ring-background"
			></span>
		{/if}
	</Button>
</div>
