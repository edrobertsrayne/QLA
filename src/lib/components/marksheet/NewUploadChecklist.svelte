<!--
	What can be taken out of the browser before a wipe. A backup restores; the
	marks export beside it says it does not.

	The dialog mounts this only while it is open, so each opening starts fresh:
	read again later, the backup row reports how old the backup really is,
	because the work done since then is not in it.
-->
<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
	import FileSpreadsheetIcon from '@lucide/svelte/icons/file-spreadsheet';
	import { Button } from '$lib/components/ui/button';
	import { backupTakenAt } from '$lib/marksheet/backup.js';
	import { backUpNow, exportMarksNow, marksheetStore } from '$lib/marksheet/index.js';
	import { relativeTime } from '$lib/marksheet/status.js';

	const store = marksheetStore();

	/** How old the copy on disk is, or that there is none. */
	const backupAge = $derived.by(() => {
		const takenAt = store.document ? backupTakenAt(store.document) : null;
		return takenAt === null ? 'Never backed up' : `Last one ${relativeTime(takenAt, new Date())}`;
	});
	/** A copy taken from this dialog: the row says so, and stops asking for another. */
	let backedUp = $state(false);

	/** An array position as the tier handle the export takes. */
	function tierIndexOf(position: number): 0 | 1 {
		return position === 1 ? 1 : 0;
	}

	/** One marks export per tier: its handle, and the name that tells it apart. */
	const tierExports = $derived(
		store.tiers.map((tier, index) => ({
			tier: tierIndexOf(index),
			name: tier.tierName?.trim() || `Tier ${index + 1}`
		}))
	);

	/** Take the copy the dialog is offering, and let its row say it was taken. */
	function backUp(): void {
		backedUp = backUpNow();
	}
</script>

<ul class="-mt-2 space-y-3 text-sm" data-testid="wipe-checklist">
	<li class="flex items-start gap-3" data-testid="wipe-backup">
		{#if backedUp}
			<CheckIcon class="mt-0.5 size-4 shrink-0 text-emerald-600" />
		{:else}
			<CircleDashedIcon class="mt-0.5 size-4 shrink-0 text-amber-600" />
		{/if}
		<div class="flex-1 space-y-1">
			<p class="font-medium">{backedUp ? 'Backed up just now' : backupAge}</p>
			<Button size="sm" variant={backedUp ? 'ghost' : 'default'} onclick={backUp}>
				Download backup
			</Button>
		</div>
	</li>
	<li class="flex items-start gap-3" data-testid="wipe-csv">
		<FileSpreadsheetIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
		<div class="flex-1 space-y-1">
			<p class="font-medium">Marks for a spreadsheet (optional)</p>
			<p class="text-muted-foreground">Not a backup — it cannot be restored from.</p>
			<div class="flex flex-wrap gap-2">
				{#each tierExports as tierExport (tierExport.tier)}
					<Button variant="ghost" size="sm" onclick={() => exportMarksNow(tierExport.tier)}>
						{tierExports.length === 1 ? 'Export CSV' : `Export ${tierExport.name} CSV`}
					</Button>
				{/each}
			</div>
		</div>
	</li>
</ul>
