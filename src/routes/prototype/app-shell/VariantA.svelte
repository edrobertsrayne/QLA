<!--
	PROTOTYPE variant A — plain top bar (name · paper label · theme), no flow indicator.
	Saved state + backup age as one muted line under the page title; the four document actions as
	plain buttons in the page header, backup/CSV grouped apart from New upload. One dialog, one layout,
	both callers (content swaps, structure does not).
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Alert from '$lib/components/ui/alert';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import SheetIcon from '@lucide/svelte/icons/sheet';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import CheckIcon from '@lucide/svelte/icons/check';
	import XIcon from '@lucide/svelte/icons/x';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import { INCOMING_BACKUP, relative, type Shell } from '$lib/prototypes/app-shell/state.svelte.js';
	import FakeSurface from './FakeSurface.svelte';
	import ThemeToggle from './ThemeToggle.svelte';

	let { shell }: { shell: Shell } = $props();

	let editingLabel = $state(false);
	const restoring = $derived(shell.dialog === 'restore');
	const facts = $derived(restoring ? INCOMING_BACKUP : shell.doc);
	const toneClass = {
		ok: 'text-muted-foreground',
		busy: 'text-muted-foreground',
		error: 'font-medium text-destructive',
		warn: 'font-medium text-amber-700 dark:text-amber-400'
	};
</script>

<div class="min-h-screen bg-background">
	<nav class="flex h-12 items-center gap-3 border-b px-6">
		<span class="font-semibold tracking-tight">QLA</span>
		{#if shell.doc}
			<span class="text-muted-foreground">/</span>
			<span class="truncate text-sm text-muted-foreground">{shell.doc.paperLabel}</span>
		{/if}
		<div class="ml-auto"><ThemeToggle /></div>
	</nav>

	{#if shell.showBanner}
		<div class="px-6 pt-4">
			<Alert.Root
				class="border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-500/50 dark:bg-amber-950/40 dark:text-amber-100"
			>
				<TriangleAlertIcon />
				<Alert.Title>
					{shell.doc?.lastExportedAt
						? `Last backup was ${shell.backupAgo}`
						: 'These marks have never been backed up'}
				</Alert.Title>
				<Alert.Description class="text-amber-900/80 dark:text-amber-100/80">
					Some browsers clear saved data after 7 days without a visit. A backup file is the only
					copy that survives that.
				</Alert.Description>
				<div class="col-start-2 mt-2 flex gap-2">
					<Button size="sm" onclick={() => shell.downloadBackup('banner')}>
						<DownloadIcon />Download backup
					</Button>
					<Button size="sm" variant="ghost" onclick={() => (shell.bannerDismissed = true)}>
						Not now
					</Button>
				</div>
			</Alert.Root>
		</div>
	{/if}

	<main class="space-y-5 px-6 py-5 pb-28">
		{#if shell.surface === 'upload'}
			<h1 class="text-2xl font-bold tracking-tight">Parse assessment paper</h1>
			<FakeSurface {shell}>
				{#snippet restore()}
					<div class="flex items-center justify-between gap-4 rounded-xl border px-5 py-3 text-sm">
						<span class="text-muted-foreground">Already have a backup file from QLA?</span>
						<Button variant="outline" onclick={() => shell.open('restore')}>
							<RotateCcwIcon />Restore from backup
						</Button>
					</div>
				{/snippet}
			</FakeSurface>
		{:else if shell.doc}
			<header class="flex flex-wrap items-start justify-between gap-4">
				<div class="min-w-0 space-y-1">
					{#if editingLabel}
						<input
							class="w-full rounded-md border bg-transparent px-2 py-1 text-2xl font-bold tracking-tight"
							bind:value={shell.doc.paperLabel}
							onblur={() => (editingLabel = false)}
							onkeydown={(e) => e.key === 'Enter' && (editingLabel = false)}
						/>
					{:else}
						<button
							type="button"
							class="group flex items-center gap-2 text-left text-2xl font-bold tracking-tight"
							onclick={() => (editingLabel = true)}
						>
							{shell.doc.paperLabel}
							<PencilIcon class="size-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
						</button>
					{/if}
					<p class="flex flex-wrap items-center gap-x-2 text-sm">
						{#if shell.surface === 'marksheet'}
							<span class="font-medium">{shell.doc.className}</span>
							<span class="text-muted-foreground">·</span>
						{:else}
							<span class="font-medium">Review breakdown</span>
							<span class="text-muted-foreground">·</span>
						{/if}
						<span class={toneClass[shell.saveLine.tone]}>{shell.saveLine.long}</span>
						{#if shell.surface === 'marksheet'}
							<span class="text-muted-foreground">·</span>
							<span
								class={shell.stale ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}
							>
								Backed up {shell.backupAgo}
							</span>
						{/if}
						{#if shell.doc.warnings}
							<Badge variant="outline">{shell.doc.warnings} warnings</Badge>
						{/if}
					</p>
				</div>
				<div class="flex items-center gap-2">
					{#if shell.surface === 'marksheet'}
						<div class="flex items-center gap-1 rounded-full border p-1">
							<Button size="sm" variant="ghost" onclick={() => shell.downloadBackup('header')}>
								<DownloadIcon />Download backup
							</Button>
							<Button size="sm" variant="ghost" onclick={() => shell.exportMarks('header')}>
								<SheetIcon />Export marks (CSV)
							</Button>
						</div>
					{/if}
					<Button variant="destructive" size="sm" onclick={() => shell.open('new-upload')}>
						<UploadIcon />New upload
					</Button>
				</div>
			</header>
			<FakeSurface {shell} />
		{/if}
	</main>
</div>

<Dialog.Root open={shell.dialog !== null} onOpenChange={(o) => !o && shell.close()}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>
				{restoring ? 'Restore this backup?' : 'Wipe this marksheet and start again?'}
			</Dialog.Title>
			<Dialog.Description>
				{restoring
					? 'The marksheet below will be loaded from the backup file.'
					: 'Everything below is deleted from this browser. This cannot be undone.'}
			</Dialog.Description>
		</Dialog.Header>
		{#if facts}
			<dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 rounded-xl bg-muted/50 px-4 py-3">
				<dt class="text-muted-foreground">Paper</dt>
				<dd class="font-medium">{facts.paperLabel}</dd>
				<dt class="text-muted-foreground">Class</dt>
				<dd class="font-medium">{facts.className || '—'}</dd>
				<dt class="text-muted-foreground">Students</dt>
				<dd class="font-medium">{facts.students}</dd>
				<dt class="text-muted-foreground">Marks entered</dt>
				<dd class="font-medium">{facts.marksEntered}</dd>
				<dt class="text-muted-foreground">Last backup</dt>
				<dd class="font-medium">
					{#if !restoring && shell.backedUpInDialog}
						<span class="inline-flex items-center gap-1 text-green-700 dark:text-green-400">
							<CheckIcon class="size-4" />Backed up just now
						</span>
					{:else}
						{relative(facts.lastExportedAt, shell.now)}
					{/if}
				</dd>
			</dl>
		{/if}
		{#if !restoring && shell.doc && shell.doc.marksEntered > 0}
			<div class="space-y-2">
				<p class="text-sm font-medium">Keep a copy first</p>
				<div class="flex flex-wrap gap-2">
					<Button variant="outline" onclick={() => shell.downloadBackup('dialog')}>
						<DownloadIcon />Download backup
					</Button>
					<Button variant="ghost" onclick={() => shell.exportMarks('dialog')}>
						<SheetIcon />Export marks (CSV)
					</Button>
				</div>
				<p class="text-xs text-muted-foreground">
					Only the backup can be restored into QLA. The CSV is for spreadsheets.
				</p>
			</div>
		{/if}
		<Dialog.Footer>
			<Button variant="ghost" onclick={() => shell.close()}><XIcon />Cancel</Button>
			{#if restoring}
				<Button onclick={() => shell.restore()}><RotateCcwIcon />Restore backup</Button>
			{:else}
				<Button
					class="bg-destructive text-white hover:bg-destructive/90"
					onclick={() => shell.wipe()}
				>
					Wipe and start again
				</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
