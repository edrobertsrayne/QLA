<!--
	PROTOTYPE (#93) variant C, status bar: the control lives where the save state
	already does, at the foot of the window, replacing the bar's storage note.
	Ambient, like an editor's "unsaved" indicator; the page header carries
	nothing about backups at all.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { proto } from './proto.svelte.js';
</script>

<span class="ml-auto flex items-center gap-2" data-testid="backup-control">
	<span>Stored in this browser only</span>
	<span aria-hidden="true">·</span>
	<span>Last backup: {proto.age}</span>
	{#if proto.changedAge !== null && !proto.never}
		<span aria-hidden="true">·</span>
		<span class="flex items-center gap-1 text-foreground">
			<span aria-hidden="true" class="size-1.5 rounded-full bg-sky-500"></span>
			changed {proto.changedAge}
		</span>
	{/if}
	<Button
		variant={proto.enabled ? 'secondary' : 'ghost'}
		size="xs"
		class="h-5 border border-border"
		disabled={!proto.enabled}
		onclick={() => proto.backUp()}
	>
		Back up now
	</Button>
</span>
