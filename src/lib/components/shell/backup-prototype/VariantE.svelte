<!--
	PROTOTYPE (#93) variant E, app nav: backup belongs to the whole document, so
	it sits in the top bar beside "New upload…", like Save in a document
	editor's title bar. A split control: the age reads as the left half, the
	action as the right; the age half opens a popover saying what is unsaved.
-->
<script lang="ts">
	import HardDriveDownloadIcon from '@lucide/svelte/icons/hard-drive-download';
	import { Button } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import { proto } from './proto.svelte.js';
</script>

<div class="flex items-center rounded-full border" data-testid="backup-control">
	<Popover.Root>
		<Popover.Trigger>
			{#snippet child({ props })}
				<button
					{...props}
					class="flex h-7 items-center gap-1.5 rounded-l-full px-3 text-xs text-muted-foreground hover:bg-muted"
				>
					{#if proto.enabled}
						<span aria-hidden="true" class="size-1.5 rounded-full bg-sky-500"></span>
					{/if}
					{proto.never ? 'No backup' : `Backup ${proto.age}`}
				</button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-72 text-sm">
			<p class="font-medium">Last backup: {proto.age}</p>
			<p class="mt-1 text-muted-foreground">
				{#if proto.never}
					This marksheet has never left this browser.
				{:else if proto.changedAge === null}
					Nothing has changed since.
				{:else}
					Changes since {proto.changedAge} aren't in it.
				{/if}
			</p>
		</Popover.Content>
	</Popover.Root>
	<Button
		variant={proto.enabled ? 'default' : 'ghost'}
		size="xs"
		class="h-7 rounded-l-none rounded-r-full"
		disabled={!proto.enabled}
		onclick={() => proto.backUp()}
	>
		<HardDriveDownloadIcon class="size-3.5" /> Back up now
	</Button>
</div>
