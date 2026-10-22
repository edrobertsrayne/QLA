<!--
	PROTOTYPE (#93) variant A, header card: today's card, made neutral. Two lines
	say how old the backup is and whether anything is missing from it; the
	button carries the state (filled when there is something to save, a quiet
	disabled "Backed up" when not).
-->
<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import HardDriveDownloadIcon from '@lucide/svelte/icons/hard-drive-download';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { proto } from './proto.svelte.js';

	const detail = $derived(
		proto.never
			? 'The breakdown, marks and your edits live only in this browser.'
			: proto.changedAge === null
				? 'Nothing has changed since.'
				: `Changes since ${proto.changedAge} aren't in it.`
	);
</script>

<Card.Root size="sm" data-testid="backup-card">
	<Card.Content class="flex items-center gap-3">
		<HardDriveDownloadIcon class="size-5 shrink-0 text-muted-foreground" />
		<div class="min-w-0 flex-1 text-sm">
			<p>Last backup: <strong>{proto.age}</strong></p>
			<p class="text-muted-foreground">{detail}</p>
		</div>
		{#if proto.enabled}
			<Button size="sm" onclick={() => proto.backUp()}>Back up now</Button>
		{:else}
			<Button size="sm" variant="outline" disabled><CheckIcon /> Backed up</Button>
		{/if}
	</Card.Content>
</Card.Root>
