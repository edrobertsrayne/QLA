<!--
	PROTOTYPE variant C — actions split by purpose, never side by side:
	backup is a safety card in the page header (and IS the staleness banner when it escalates),
	marks CSV is a data tool in the grid toolbar, New upload is a quiet nav item.
	Saved state lives in an editor-style status bar fixed to the bottom, not the header.
	Dialogs diverge: wipe is a checklist naming the loss in its button; restore is a small confirm.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Dialog from '$lib/components/ui/dialog';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import SheetIcon from '@lucide/svelte/icons/sheet';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import ShieldAlertIcon from '@lucide/svelte/icons/shield-alert';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
	import { INCOMING_BACKUP, relative, type Shell } from '$lib/prototypes/app-shell/state.svelte.js';
	import FakeSurface from './FakeSurface.svelte';
	import ThemeToggle from './ThemeToggle.svelte';

	let { shell }: { shell: Shell } = $props();

	const bar = {
		ok: 'bg-muted/70 text-muted-foreground',
		busy: 'bg-muted/70 text-muted-foreground',
		error: 'bg-destructive text-white',
		warn: 'bg-amber-500 text-amber-950'
	};
	const dot = {
		ok: 'bg-green-500',
		busy: 'bg-sky-500 animate-pulse',
		error: 'bg-white',
		warn: 'bg-amber-950'
	};
</script>

<div class="min-h-screen bg-background">
	<nav class="flex h-12 items-center gap-2 border-b px-6 text-sm">
		<span class="font-semibold tracking-tight">QLA</span>
		{#if shell.doc}
			<span class="text-muted-foreground">/</span>
			<span class="truncate text-muted-foreground">{shell.doc.paperLabel}</span>
			{#if shell.doc.className}
				<span class="text-muted-foreground">/</span>
				<span class="text-muted-foreground">{shell.doc.className}</span>
			{/if}
		{/if}
		<div class="ml-auto flex items-center gap-2">
			{#if shell.doc}
				<Button variant="ghost" size="sm" onclick={() => shell.open('new-upload')}>
					New upload…
				</Button>
			{/if}
			<ThemeToggle kind="segmented" />
		</div>
	</nav>

	<main class="space-y-4 px-6 py-5 pb-24">
		{#if shell.surface === 'upload'}
			<div
				class="mx-auto flex max-w-4xl items-center gap-4 rounded-xl border bg-muted/30 px-5 py-3"
			>
				<RotateCcwIcon class="size-5 text-muted-foreground" />
				<div class="flex-1 text-sm">
					<p class="font-medium">Carrying on from another device or browser?</p>
					<p class="text-muted-foreground">Open a QLA backup file to restore its marksheet.</p>
				</div>
				<Button variant="outline" onclick={() => shell.open('restore')}>Restore from backup…</Button
				>
			</div>
			<h1 class="mx-auto max-w-4xl text-2xl font-bold tracking-tight">Or parse a new paper</h1>
			<FakeSurface {shell} />
		{:else if shell.doc}
			<header class="flex flex-wrap items-start justify-between gap-4">
				<div class="space-y-1">
					<input
						class="-ml-2 w-[28rem] max-w-full rounded-md border border-transparent bg-transparent px-2 py-0.5 text-2xl font-bold tracking-tight hover:border-border focus:border-border focus:outline-none"
						bind:value={shell.doc.paperLabel}
						aria-label="Paper label"
					/>
					<p class="flex items-center gap-2 text-sm text-muted-foreground">
						{shell.surface === 'marksheet'
							? `${shell.doc.className} · ${shell.doc.students} students`
							: 'Review the breakdown, then confirm it'}
						{#if shell.doc.warnings}<Badge variant="outline">{shell.doc.warnings} warnings</Badge
							>{/if}
					</p>
				</div>

				{#if shell.surface === 'marksheet' && !shell.showBanner}
					<div
						class="flex items-center gap-3 rounded-xl border px-4 py-2 {shell.stale
							? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40'
							: ''}"
					>
						{#if shell.stale}
							<ShieldAlertIcon class="size-5 text-amber-600" />
						{:else}
							<ShieldCheckIcon class="size-5 text-green-600" />
						{/if}
						<div class="text-sm">
							<p class="font-medium">Backup</p>
							<p class="text-muted-foreground">
								{shell.doc.lastExportedAt ? `Last one ${shell.backupAgo}` : 'None yet'}
							</p>
						</div>
						<Button
							size="sm"
							variant={shell.stale ? 'default' : 'outline'}
							onclick={() => shell.downloadBackup('backup card')}
						>
							<DownloadIcon />Back up now
						</Button>
					</div>
				{/if}
			</header>

			{#if shell.showBanner}
				<div
					class="flex flex-wrap items-center gap-4 rounded-xl border border-amber-400 bg-amber-50 px-5 py-4 dark:bg-amber-950/40"
				>
					<ShieldAlertIcon class="size-6 text-amber-600" />
					<div class="flex-1 text-sm">
						<p class="font-semibold">
							{shell.doc.lastExportedAt
								? `Your last backup was ${shell.backupAgo}`
								: `${shell.doc.marksEntered} marks and no backup yet`}
						</p>
						<p class="text-muted-foreground">
							Marks are kept in this browser, which may clear them after 7 days without a visit. A
							backup file is the copy you can restore.
						</p>
					</div>
					<Button onclick={() => shell.downloadBackup('banner')}><DownloadIcon />Back up now</Button
					>
					<Button variant="ghost" onclick={() => (shell.bannerDismissed = true)}>
						Remind me later
					</Button>
				</div>
			{/if}

			{#if shell.surface === 'marksheet'}
				<div class="flex items-center gap-2 border-b pb-2">
					<Button size="sm" variant="outline" disabled>Generate analysis</Button>
					<div class="ml-auto"></div>
					<Button size="sm" variant="ghost" onclick={() => shell.exportMarks('grid toolbar')}>
						<SheetIcon />Export marks to spreadsheet (.csv)
					</Button>
				</div>
			{/if}
			<FakeSurface {shell} />
		{/if}
	</main>

	{#if shell.doc}
		<footer
			class="fixed inset-x-0 bottom-0 z-30 flex h-8 items-center gap-3 px-4 text-xs {bar[
				shell.saveLine.tone
			]}"
		>
			<span class="size-2 rounded-full {dot[shell.saveLine.tone]}"></span>
			<span>{shell.saveLine.long}</span>
			{#if shell.save === 'failed' || shell.save === 'unavailable'}
				<button
					type="button"
					class="underline underline-offset-2"
					onclick={() => shell.downloadBackup('status bar')}
				>
					Download backup now
				</button>
			{/if}
			<span class="ml-auto">Stored in this browser only · backup {shell.backupAgo}</span>
		</footer>
	{/if}
</div>

<Dialog.Root open={shell.dialog === 'new-upload'} onOpenChange={(o) => !o && shell.close()}>
	<Dialog.Content class="sm:max-w-lg">
		{#if shell.doc}
			<Dialog.Header>
				<Dialog.Title>Start a new upload?</Dialog.Title>
				<Dialog.Description class="text-foreground">
					{#if shell.doc.marksEntered > 0}
						This deletes <strong>{shell.doc.marksEntered} marks</strong> for
						<strong>{shell.doc.students} students</strong> in
						<strong>{shell.doc.className}</strong>
						({shell.doc.paperLabel}) from this browser.
					{:else if shell.doc.students > 0}
						This deletes the class <strong>{shell.doc.className}</strong> ({shell.doc.students}
						students, no marks yet) and the breakdown for {shell.doc.paperLabel}.
					{:else}
						This deletes the breakdown for <strong>{shell.doc.paperLabel}</strong>. No class or
						marks have been entered.
					{/if}
				</Dialog.Description>
			</Dialog.Header>
			{#if shell.doc.marksEntered > 0 || shell.doc.students > 0}
				<ul class="divide-y rounded-xl border">
					<li class="flex items-center gap-3 p-3">
						{#if shell.backedUpInDialog}
							<CircleCheckIcon class="size-5 text-green-600" />
						{:else}
							<CircleDashedIcon class="size-5 text-amber-600" />
						{/if}
						<div class="flex-1">
							<p class="font-medium">Backup</p>
							<p class="text-xs text-muted-foreground">
								{shell.backedUpInDialog
									? 'Backed up just now'
									: shell.doc.lastExportedAt
										? `Last one ${shell.backupAgo} — changes since then would be lost`
										: 'Never backed up'}
							</p>
						</div>
						<Button
							size="sm"
							variant={shell.backedUpInDialog ? 'ghost' : 'default'}
							onclick={() => shell.downloadBackup('dialog')}
						>
							<DownloadIcon />Download backup
						</Button>
					</li>
					<li class="flex items-center gap-3 p-3">
						<SheetIcon class="size-5 text-muted-foreground" />
						<div class="flex-1">
							<p class="font-medium">
								Marks for a spreadsheet <span class="font-normal text-muted-foreground"
									>(optional)</span
								>
							</p>
							<p class="text-xs text-muted-foreground">Not a backup — can't be restored</p>
						</div>
						<Button size="sm" variant="ghost" onclick={() => shell.exportMarks('dialog')}>
							Export CSV
						</Button>
					</li>
				</ul>
			{/if}
			<Dialog.Footer>
				<Button variant="ghost" onclick={() => shell.close()}>Keep working</Button>
				<Button
					class="bg-destructive text-white hover:bg-destructive/90"
					onclick={() => shell.wipe()}
				>
					{shell.doc.marksEntered > 0
						? `Delete ${shell.doc.marksEntered} marks and start again`
						: 'Delete and start again'}
				</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root open={shell.dialog === 'restore'} onOpenChange={(o) => !o && shell.close()}>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>Restore {INCOMING_BACKUP.className}?</Dialog.Title>
			<Dialog.Description>backup-10y-ch2.json</Dialog.Description>
		</Dialog.Header>
		<div class="space-y-1 rounded-xl bg-muted/50 p-4">
			<p class="font-semibold">{INCOMING_BACKUP.paperLabel}</p>
			<p class="text-muted-foreground">
				{INCOMING_BACKUP.students} students · {INCOMING_BACKUP.marksEntered} marks
			</p>
			<p class="text-muted-foreground">
				Backup made {relative(INCOMING_BACKUP.lastExportedAt, shell.now)}
			</p>
		</div>
		<Dialog.Footer>
			<Button variant="ghost" onclick={() => shell.close()}>Cancel</Button>
			<Button onclick={() => shell.restore()}><RotateCcwIcon />Restore</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
