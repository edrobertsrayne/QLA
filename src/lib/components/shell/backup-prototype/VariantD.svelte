<!--
	PROTOTYPE (#93) variant D, heading meta line: backup is one more fact about
	the sheet, in the muted line under the class name next to the counts. No
	box, no card; the button is a small ghost with an icon, and the line goes
	foreground only when something is missing from the backup.
-->
<script lang="ts">
	import HardDriveDownloadIcon from '@lucide/svelte/icons/hard-drive-download';
	import { Button } from '$lib/components/ui/button';
	import { proto } from './proto.svelte.js';

	const text = $derived(
		proto.never
			? 'Never backed up'
			: proto.changedAge === null
				? `Backed up ${proto.age}`
				: `Backed up ${proto.age}, edited since`
	);
</script>

<span class="flex items-center gap-1 text-sm" data-testid="backup-control">
	<span aria-hidden="true" class="text-muted-foreground">·</span>
	<span class={proto.enabled ? 'text-foreground' : 'text-muted-foreground'}>{text}</span>
	<Button
		variant="ghost"
		size="xs"
		class={proto.enabled ? 'text-primary' : ''}
		disabled={!proto.enabled}
		onclick={() => proto.backUp()}
	>
		<HardDriveDownloadIcon class="size-3.5" /> Back up now
	</Button>
</span>
