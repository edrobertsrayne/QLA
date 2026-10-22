<!--
	The backup control: one click that gets this document out of the browser,
	and how old the copy on disk is.

	It is a quiet part of the toolbar, not a standing warning. The button is
	disabled only when a backup already holds every change; a document that has
	never been backed up is always worth saving, marks or none. A change that
	has sat unbacked for more than two days is named in a toast once a session.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import HardDriveDownloadIcon from '@lucide/svelte/icons/hard-drive-download';
	import { Button } from '$lib/components/ui/button';
	import { backupState } from '$lib/marksheet/backup.js';
	import { backupNudge } from '$lib/marksheet/backup-nudge.js';
	import { backUpNow, marksheetStore } from '$lib/marksheet/index.js';
	import { relativeTime } from '$lib/marksheet/status.js';

	/** The toast's identity, so a backup can take it down. */
	const NUDGE_TOAST_ID = 'backup-nudge';

	/** Ages and the nudge turn over by the day, so the clock is re-read hourly. */
	const CLOCK_REFRESH_MS = 60 * 60 * 1000;

	const store = marksheetStore();

	/** The clock the control reads. A page left open still ages its backup. */
	let now = $state(new Date());

	onMount(() => {
		const timer = setInterval(() => (now = new Date()), CLOCK_REFRESH_MS);
		return () => clearInterval(timer);
	});

	const backup = $derived(store.document === null ? null : backupState(store.document));
	/** A backup that holds every change is the one case with nothing to save. */
	const enabled = $derived(backup !== null && backup.kind !== 'clean');

	const caption = $derived(
		backup === null || backup.kind === 'never'
			? 'No backup yet'
			: `Backup ${relativeTime(backup.takenAt, now)}`
	);
	const title = $derived(
		backup === null || backup.kind === 'never'
			? 'Never backed up'
			: backup.kind === 'clean'
				? 'Nothing new since the last backup'
				: `Changes since ${relativeTime(backup.changedAt, now)} aren't backed up`
	);

	// The one nudge this session gets. Its copy names the age of the oldest
	// change a backup would save; the control beside it is the standing answer.
	$effect(() => {
		const document = store.document;
		const at = now;
		if (document === null || store.backupNudgeShown) return;
		const nudge = backupNudge(document, at);
		if (nudge === null) return;
		store.backupNudgeShown = true;
		toast(`Changes from ${nudge.days} days ago aren't backed up`, {
			id: NUDGE_TOAST_ID,
			description: 'A backup file is the only copy that survives the browser clearing its storage.',
			action: { label: 'Back up now', onClick: backUp }
		});
	});

	function backUp(): void {
		if (backUpNow()) toast.dismiss(NUDGE_TOAST_ID);
	}
</script>

<div class="flex items-center gap-2 border-r pr-2" data-testid="backup-control">
	<span class="text-[11px] text-muted-foreground">{caption}</span>
	<Button
		variant={enabled ? 'default' : 'outline'}
		size="xs"
		class="relative"
		disabled={!enabled}
		{title}
		onclick={backUp}
	>
		<HardDriveDownloadIcon class="size-3.5" /> Back up now
		{#if enabled}
			<span
				aria-hidden="true"
				class="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-sky-500 ring-2 ring-background"
			></span>
		{/if}
	</Button>
</div>
