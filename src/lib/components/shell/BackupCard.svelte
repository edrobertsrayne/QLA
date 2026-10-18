<!--
	The backup card: one click that gets this marksheet out of the browser, and
	how old the copy on disk is.

	A browser may clear a site's storage once it has gone a week without a visit,
	so when the marks are newer than the last backup — or the last one is past
	that window — the card becomes a standing amber warning with a way to say
	"later". Never a dialog: a warning that blocks is one the teacher learns to
	click away.
-->
<script lang="ts">
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { BACKUP_STALE_AFTER_DAYS, backupReminder, backupTakenAt } from '$lib/marksheet/backup.js';
	import { backUpNow, marksheetStore } from '$lib/marksheet/index.js';
	import { relativeTime } from '$lib/marksheet/status.js';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

	const store = marksheetStore();

	// An age turns over by the hour or the day, so the card reads the clock when
	// the surface paints rather than ticking: the status bar's line is the one
	// that keeps itself current.
	const now = new Date();

	/** The standing warning's tint, shared by the banner and the card it leaves behind. */
	const AMBER = 'border-amber-500 bg-amber-50 dark:border-amber-400/60 dark:bg-amber-950/40';

	const takenAt = $derived(store.document ? backupTakenAt(store.document) : null);
	const age = $derived(takenAt === null ? 'None yet' : relativeTime(takenAt, now));
	const reminder = $derived(backupReminder(store.document, now));
	/** A stale backup turns the card amber whether or not the teacher said later. */
	const stale = $derived(reminder !== null);
	const warning = $derived(stale && !store.backupReminderDismissed);

	const message = $derived.by(() => {
		if (reminder === null) return '';
		return reminder.kind === 'never'
			? 'You have entered marks and never backed them up.'
			: `Your last backup was ${reminder.days} days ago.`;
	});
</script>

{#if warning}
	<Alert class={AMBER} data-testid="backup-banner">
		<TriangleAlertIcon />
		<AlertTitle>{message}</AlertTitle>
		<AlertDescription>
			<p>
				A browser can clear this site's storage after
				{BACKUP_STALE_AFTER_DAYS} days without a visit — back it up to keep it.
			</p>
			<div class="mt-2 flex flex-wrap items-center gap-2">
				<Button size="sm" onclick={backUpNow}>Back up now</Button>
				<Button variant="ghost" size="sm" onclick={() => store.dismissBackupReminder()}>
					Remind me later
				</Button>
			</div>
		</AlertDescription>
	</Alert>
{:else}
	<Card.Root size="sm" class={stale ? AMBER : ''} data-testid="backup-card">
		<Card.Content class="flex items-center justify-between gap-3">
			<Card.Description>Last backup: <strong>{age}</strong></Card.Description>
			<Button variant={stale ? 'default' : 'outline'} size="sm" onclick={backUpNow}>
				Back up now
			</Button>
		</Card.Content>
	</Card.Root>
{/if}
