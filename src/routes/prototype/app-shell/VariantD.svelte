<!--
	PROTOTYPE variant D — no top bar: a left rail is the shell. Vertical flow (upload / breakdown /
	marksheet) at the top, then a "this document" panel holding the editable paper label, saved state,
	backup age and the document actions stacked with their consequences, New upload alone at the foot.
	Dialog: stat tiles + one "back up first" call, CSV demoted to a text link; same component for restore.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import SheetIcon from '@lucide/svelte/icons/sheet';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import CheckIcon from '@lucide/svelte/icons/check';
	import LockIcon from '@lucide/svelte/icons/lock';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import XIcon from '@lucide/svelte/icons/x';
	import { INCOMING_BACKUP, relative, type Shell } from '$lib/prototypes/app-shell/state.svelte.js';
	import FakeSurface from './FakeSurface.svelte';
	import ThemeToggle from './ThemeToggle.svelte';

	let { shell }: { shell: Shell } = $props();

	const STEPS = [
		{ key: 'upload', label: 'Upload paper' },
		{ key: 'breakdown', label: 'Breakdown' },
		{ key: 'marksheet', label: 'Marksheet' }
	] as const;
	const current = $derived(STEPS.findIndex((s) => s.key === shell.surface));
	const restoring = $derived(shell.dialog === 'restore');
	const facts = $derived(restoring ? INCOMING_BACKUP : shell.doc);
	const toneClass = {
		ok: 'text-muted-foreground',
		busy: 'text-muted-foreground',
		error: 'text-destructive font-medium',
		warn: 'text-amber-700 dark:text-amber-400 font-medium'
	};
</script>

<div class="flex min-h-screen bg-background">
	<aside class="sticky top-0 flex h-screen w-64 shrink-0 flex-col gap-6 border-r bg-muted/20 p-4">
		<div class="flex items-center justify-between">
			<span class="font-semibold tracking-tight">QLA</span>
			<ThemeToggle />
		</div>

		<ol class="space-y-0.5 text-sm">
			{#each STEPS as s, i (s.key)}
				<li
					class="flex items-center gap-2 rounded-lg px-2 py-1.5 {i === current
						? 'bg-background font-medium shadow-sm'
						: 'text-muted-foreground'}"
				>
					{#if i < current}<CheckIcon class="size-4" />
					{:else if i > current}<LockIcon class="size-4 opacity-50" />
					{:else}<span class="size-4 rounded-full border-4 border-primary"></span>{/if}
					<span class="flex-1">{s.label}</span>
					{#if s.key === 'breakdown' && shell.doc?.breakdownConfirmedAt}
						<span class="text-xs">confirmed</span>
					{/if}
				</li>
			{/each}
		</ol>

		{#if shell.doc}
			<section class="space-y-3 border-t pt-4">
				<p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">This paper</p>
				<textarea
					rows="2"
					class="w-full resize-none rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm font-semibold hover:border-border focus:border-border focus:outline-none"
					bind:value={shell.doc.paperLabel}
					aria-label="Paper label"></textarea>
				{#if shell.doc.className}
					<p class="px-1.5 text-sm">{shell.doc.className} · {shell.doc.students} students</p>
				{/if}
				<div class="space-y-0.5 px-1.5 text-xs">
					<p class={toneClass[shell.saveLine.tone]}>{shell.saveLine.long}</p>
					{#if shell.surface === 'marksheet'}
						<p
							class={shell.stale
								? 'font-medium text-amber-700 dark:text-amber-400'
								: 'text-muted-foreground'}
						>
							Backed up {shell.backupAgo}
						</p>
					{/if}
				</div>

				{#if shell.surface === 'marksheet'}
					<div class="space-y-1.5">
						<button
							type="button"
							class="flex w-full items-start gap-2.5 rounded-lg border bg-background p-2.5 text-left text-sm hover:bg-muted/50"
							onclick={() => shell.downloadBackup('rail')}
						>
							<DownloadIcon class="mt-0.5 size-4" />
							<span>
								<span class="block font-medium">Download backup</span>
								<span class="block text-xs text-muted-foreground">Restores everything</span>
							</span>
						</button>
						<button
							type="button"
							class="flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left text-sm hover:bg-muted/50"
							onclick={() => shell.exportMarks('rail')}
						>
							<SheetIcon class="mt-0.5 size-4 text-muted-foreground" />
							<span>
								<span class="block">Export marks (CSV)</span>
								<span class="block text-xs text-muted-foreground">
									Spreadsheet only — can't restore
								</span>
							</span>
						</button>
					</div>
				{/if}
			</section>

			<div class="mt-auto border-t pt-3">
				<Button
					variant="ghost"
					size="sm"
					class="w-full justify-start text-destructive hover:text-destructive"
					onclick={() => shell.open('new-upload')}
				>
					<UploadIcon />New upload…
				</Button>
			</div>
		{/if}
	</aside>

	<main class="min-w-0 flex-1 space-y-4 px-6 py-5 pb-28">
		{#if shell.showBanner}
			<div
				class="flex items-center gap-3 rounded-lg border border-amber-400 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
			>
				<CircleAlertIcon class="size-4 shrink-0" />
				<span class="flex-1">
					<strong>
						{shell.doc?.lastExportedAt ? `Last backup ${shell.backupAgo}.` : 'No backup yet.'}
					</strong>
					This browser may clear its copy after 7 days unused.
				</span>
				<Button size="sm" onclick={() => shell.downloadBackup('banner')}>
					<DownloadIcon />Download backup
				</Button>
				<button
					type="button"
					aria-label="Dismiss for this session"
					class="rounded p-1 hover:bg-amber-100 dark:hover:bg-amber-900"
					onclick={() => (shell.bannerDismissed = true)}
				>
					<XIcon class="size-4" />
				</button>
			</div>
		{/if}

		{#if shell.surface === 'upload'}
			<h1 class="text-2xl font-bold tracking-tight">Upload a paper</h1>
			<FakeSurface {shell}>
				{#snippet restore()}
					<p class="text-center text-sm text-muted-foreground">
						or <button
							type="button"
							class="font-medium text-foreground underline underline-offset-4"
							onclick={() => shell.open('restore')}>restore from a backup file</button
						>
					</p>
				{/snippet}
			</FakeSurface>
		{:else}
			<h1 class="text-2xl font-bold tracking-tight">
				{shell.surface === 'breakdown' ? 'Review breakdown' : shell.doc?.className}
			</h1>
			<FakeSurface {shell} />
		{/if}
	</main>
</div>

<Dialog.Root open={shell.dialog !== null} onOpenChange={(o) => !o && shell.close()}>
	<Dialog.Content class="sm:max-w-md" showCloseButton={false}>
		<div class="flex items-start gap-3">
			<div
				class="flex size-10 shrink-0 items-center justify-center rounded-full {restoring
					? 'bg-muted'
					: 'bg-destructive/10 text-destructive'}"
			>
				{#if restoring}<RotateCcwIcon class="size-5" />{:else}<TrashIcon class="size-5" />{/if}
			</div>
			<Dialog.Header>
				<Dialog.Title>
					{restoring
						? `Restore ${facts?.className}?`
						: `Delete ${facts?.className || 'this breakdown'}?`}
				</Dialog.Title>
				<Dialog.Description>{facts?.paperLabel}</Dialog.Description>
			</Dialog.Header>
		</div>
		{#if facts}
			<div class="grid grid-cols-3 gap-2 text-center">
				<div class="rounded-xl bg-muted/50 p-3">
					<p class="text-xl font-semibold">{facts.students}</p>
					<p class="text-xs text-muted-foreground">students</p>
				</div>
				<div class="rounded-xl bg-muted/50 p-3">
					<p class="text-xl font-semibold">{facts.marksEntered}</p>
					<p class="text-xs text-muted-foreground">marks</p>
				</div>
				<div
					class="rounded-xl p-3 {!restoring && shell.backedUpInDialog
						? 'bg-green-500/10'
						: !restoring && shell.stale
							? 'bg-amber-500/15'
							: 'bg-muted/50'}"
				>
					<p class="text-sm font-semibold">
						{!restoring && shell.backedUpInDialog
							? 'just now'
							: relative(facts.lastExportedAt, shell.now)}
					</p>
					<p class="text-xs text-muted-foreground">last backup</p>
				</div>
			</div>
		{/if}
		{#if !restoring && shell.doc && shell.doc.marksEntered > 0}
			<div class="space-y-1.5">
				<Button
					class="w-full"
					variant={shell.backedUpInDialog ? 'outline' : 'default'}
					onclick={() => shell.downloadBackup('dialog')}
				>
					{#if shell.backedUpInDialog}<CheckIcon />Backed up just now — download again{:else}<DownloadIcon
						/>Download backup first{/if}
				</Button>
				<p class="text-center text-xs text-muted-foreground">
					Need the marks in a spreadsheet?
					<button
						type="button"
						class="underline underline-offset-2"
						onclick={() => shell.exportMarks('dialog')}>Export CSV</button
					> (can't be restored)
				</p>
			</div>
		{/if}
		<Dialog.Footer>
			<Button variant="ghost" onclick={() => shell.close()}>Cancel</Button>
			{#if restoring}
				<Button onclick={() => shell.restore()}>Restore</Button>
			{:else}
				<Button variant="destructive" onclick={() => shell.wipe()}>Wipe and start again</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
