<!--
	The way back in when this browser holds nothing: a backup file the teacher
	saved. The file goes through the same validator the boot gate uses, so a file
	this card accepts is exactly a file the app can boot from — and a file that is
	not one of ours is refused whole, with the app left as it was.
-->
<script lang="ts">
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { readBackup, type BackupSummary } from '$lib/marksheet/backup.js';
	import type { MarksheetDocument } from '$lib/marksheet/document.js';
	import { goToSurface, marksheetStore } from '$lib/marksheet/index.js';
	import { relativeTime } from '$lib/marksheet/status.js';
	import { count } from '$lib/prose.js';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

	const store = marksheetStore();

	/** The file that has been read and is waiting for the teacher to say yes. */
	let candidate = $state.raw<{
		filename: string;
		document: MarksheetDocument;
		summary: BackupSummary;
	} | null>(null);
	/** Why the last file chosen was not one of ours. */
	let rejection = $state<string | null>(null);
	let open = $state(false);
	/**
	 * The field's identity. A file input reports a file once and then holds it, so
	 * the field is rebuilt after every choice: the same file picked again — after
	 * a refusal, say — reaches the app as the choice it is.
	 */
	let field = $state(0);

	/** What the confirm says about the moment the file records: an age, or that it holds none. */
	const age = $derived.by(() => {
		const takenAt = candidate?.summary.takenAt ?? null;
		return takenAt === null
			? 'no backup age recorded'
			: `backed up ${relativeTime(takenAt, new Date())}`;
	});

	async function chooseFile(event: Event): Promise<void> {
		const file = (event.currentTarget as HTMLInputElement).files?.[0] ?? null;
		field += 1;
		rejection = null;
		if (!file) return;

		const read = readBackup(await file.text());
		if (!read) {
			rejection =
				'That file is not a QLA backup, so nothing has been changed. Choose the qla-backup-….json file you downloaded.';
			return;
		}

		candidate = { filename: file.name, document: read.document, summary: read.summary };
		open = true;
	}

	function restore(): void {
		const chosen = candidate;
		open = false;
		candidate = null;
		if (!chosen) return;
		// The document decides where the teacher lands: an unconfirmed breakdown
		// goes back to review, a confirmed one straight to the marksheet.
		if (store.restoreBackup(chosen.document)) goToSurface();
	}
</script>

<Card.Root data-testid="restore-card">
	<Card.Header>
		<Card.Title>Restore from a backup</Card.Title>
		<Card.Description>
			Already have a marksheet? Attach the JSON file you backed up to bring it back — on this device
			or another one.
		</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-2">
		<Label for="backup-file">Backup file</Label>
		{#key field}
			<Input
				id="backup-file"
				type="file"
				accept="application/json,.json"
				aria-invalid={rejection !== null}
				onchange={chooseFile}
			/>
		{/key}
		{#if rejection}
			<Alert variant="destructive" class="py-2" data-testid="restore-error">
				<TriangleAlertIcon />
				<AlertDescription>{rejection}</AlertDescription>
			</Alert>
		{/if}
	</Card.Content>
</Card.Root>

<Dialog.Root bind:open>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Restore this backup?</Dialog.Title>
			<Dialog.Description>
				{#if candidate}
					<strong>{candidate.filename}</strong> holds
					{candidate.summary.paperLabel ?? 'a paper with no label'} for the class
					{candidate.summary.className ?? 'not named'} — {count(
						candidate.summary.students,
						'student'
					)} and {count(candidate.summary.marks, 'mark')}, {age}. Restoring it replaces whatever
					this browser holds.
				{/if}
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
			<Button onclick={restore}>Restore marksheet</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
