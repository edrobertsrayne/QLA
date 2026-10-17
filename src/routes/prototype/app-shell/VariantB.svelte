<!--
	PROTOTYPE variant B — everything in one dense nav: flow stepper (upload → breakdown → marksheet),
	paper label editable in place in the nav, a compact save pill (details in a popover), and every
	document action in one "File" dropdown with described items. Banner is a slim strip glued under
	the nav. Dialog: two columns — what you lose / keep a copy first. Same component for restore.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Popover from '$lib/components/ui/popover';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import SheetIcon from '@lucide/svelte/icons/sheet';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import FileIcon from '@lucide/svelte/icons/file';
	import CheckIcon from '@lucide/svelte/icons/check';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import LoaderIcon from '@lucide/svelte/icons/loader-circle';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import HardDriveIcon from '@lucide/svelte/icons/hard-drive';
	import XIcon from '@lucide/svelte/icons/x';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { INCOMING_BACKUP, relative, type Shell } from '$lib/prototypes/app-shell/state.svelte.js';
	import FakeSurface from './FakeSurface.svelte';
	import ThemeToggle from './ThemeToggle.svelte';

	let { shell }: { shell: Shell } = $props();

	const STEPS = [
		{ key: 'upload', label: 'Upload' },
		{ key: 'breakdown', label: 'Breakdown' },
		{ key: 'marksheet', label: 'Marksheet' }
	] as const;
	const current = $derived(STEPS.findIndex((s) => s.key === shell.surface));
	const restoring = $derived(shell.dialog === 'restore');
	const pill = {
		ok: 'border-transparent text-muted-foreground',
		busy: 'border-transparent text-muted-foreground',
		error: 'border-destructive/40 bg-destructive/10 text-destructive',
		warn: 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400'
	};
</script>

<div class="min-h-screen bg-background">
	<nav class="flex h-14 items-center gap-4 border-b px-4">
		<span class="font-semibold tracking-tight">QLA</span>

		<ol class="flex items-center gap-1 text-xs">
			{#each STEPS as s, i (s.key)}
				{#if i > 0}<ChevronRightIcon class="size-3.5 text-muted-foreground/60" />{/if}
				<li
					class="flex items-center gap-1.5 rounded-full px-2 py-1 {i === current
						? 'bg-muted font-semibold'
						: i < current
							? 'text-muted-foreground'
							: 'text-muted-foreground/50'}"
					aria-current={i === current ? 'step' : undefined}
				>
					{#if i < current}
						<CheckIcon class="size-3.5" />
					{:else}
						<span
							class="flex size-4 items-center justify-center rounded-full border text-[10px] leading-none"
							>{i + 1}</span
						>
					{/if}
					{s.label}
				</li>
			{/each}
		</ol>

		{#if shell.doc}
			<input
				class="ml-2 min-w-0 flex-1 truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium hover:border-border focus:border-border focus:outline-none"
				bind:value={shell.doc.paperLabel}
				aria-label="Paper label"
			/>
		{:else}
			<div class="flex-1"></div>
		{/if}

		{#if shell.doc}
			<Popover.Root>
				<Popover.Trigger>
					{#snippet child({ props })}
						<button
							{...props}
							type="button"
							class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs {pill[
								shell.saveLine.tone
							]}"
						>
							{#if shell.save === 'saving'}<LoaderIcon class="size-3.5 animate-spin" />
							{:else if shell.save === 'saved'}<CircleCheckIcon class="size-3.5" />
							{:else if shell.save === 'failed'}<CircleAlertIcon class="size-3.5" />
							{:else}<HardDriveIcon class="size-3.5" />{/if}
							{shell.saveLine.short}
							{#if shell.surface === 'marksheet'}
								<span class="text-muted-foreground/60">·</span>
								<span class={shell.stale ? 'font-medium text-amber-700 dark:text-amber-400' : ''}>
									backup {shell.backupAgo}
								</span>
							{/if}
						</button>
					{/snippet}
				</Popover.Trigger>
				<Popover.Content align="end" class="w-72 space-y-2 text-sm">
					<p>{shell.saveLine.long}</p>
					<p class="text-muted-foreground">
						Saved in this browser only. Last backup file: {shell.backupAgo}.
					</p>
					<Button size="sm" class="w-full" onclick={() => shell.downloadBackup('pill')}>
						<DownloadIcon />Download backup
					</Button>
				</Popover.Content>
			</Popover.Root>
		{/if}

		<ThemeToggle />

		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="outline" size="sm"><FileIcon />File</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" class="w-80">
				{#if shell.surface === 'upload'}
					<DropdownMenu.Item onSelect={() => shell.open('restore')}>
						<RotateCcwIcon />
						<div>
							<div>Restore from backup…</div>
							<div class="text-xs text-muted-foreground">Open a QLA backup file (.json)</div>
						</div>
					</DropdownMenu.Item>
				{:else}
					{#if shell.surface === 'marksheet'}
						<DropdownMenu.Label class="text-xs text-muted-foreground"
							>Keep a copy</DropdownMenu.Label
						>
						<DropdownMenu.Item onSelect={() => shell.downloadBackup('menu')}>
							<DownloadIcon />
							<div>
								<div>Download backup <span class="text-muted-foreground">.json</span></div>
								<div class="text-xs text-muted-foreground">
									Everything — can be restored into QLA
								</div>
							</div>
						</DropdownMenu.Item>
						<DropdownMenu.Item onSelect={() => shell.exportMarks('menu')}>
							<SheetIcon />
							<div>
								<div>Export marks <span class="text-muted-foreground">.csv</span></div>
								<div class="text-xs text-muted-foreground">
									For spreadsheets — cannot be restored
								</div>
							</div>
						</DropdownMenu.Item>
						<DropdownMenu.Separator />
					{/if}
					<DropdownMenu.Item variant="destructive" onSelect={() => shell.open('new-upload')}>
						<UploadIcon />New upload…
					</DropdownMenu.Item>
				{/if}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</nav>

	{#if shell.showBanner}
		<div
			class="flex items-center gap-3 border-b border-amber-400/60 bg-amber-100 px-4 py-1.5 text-sm text-amber-900 dark:bg-amber-950/60 dark:text-amber-100"
		>
			<CircleAlertIcon class="size-4 shrink-0" />
			<span class="flex-1">
				{shell.doc?.lastExportedAt ? `No backup for ${shell.backupDays} days.` : 'No backup yet.'} Browsers
				can clear saved marks after 7 days unused.
			</span>
			<Button size="xs" onclick={() => shell.downloadBackup('banner')}>Download backup</Button>
			<button
				type="button"
				aria-label="Dismiss for this session"
				class="rounded p-0.5 hover:bg-amber-200 dark:hover:bg-amber-900"
				onclick={() => (shell.bannerDismissed = true)}
			>
				<XIcon class="size-4" />
			</button>
		</div>
	{/if}

	<main class="space-y-4 px-6 py-5 pb-28">
		{#if shell.surface === 'marksheet' && shell.doc}
			<h1 class="text-lg font-semibold">{shell.doc.className}</h1>
		{:else if shell.surface === 'breakdown'}
			<h1 class="text-lg font-semibold">Review breakdown</h1>
		{:else}
			<h1 class="text-lg font-semibold">Parse assessment paper</h1>
		{/if}
		<FakeSurface {shell} />
	</main>
</div>

<Dialog.Root open={shell.dialog !== null} onOpenChange={(o) => !o && shell.close()}>
	<Dialog.Content class="sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>{restoring ? 'Restore from backup' : 'New upload'}</Dialog.Title>
			<Dialog.Description>
				{restoring
					? 'Nothing is stored in this browser yet, so nothing is replaced.'
					: 'Starting a new upload deletes the current marksheet from this browser.'}
			</Dialog.Description>
		</Dialog.Header>
		<div class="grid gap-4 sm:grid-cols-2">
			{@render factsCard(
				restoring ? 'In this backup' : 'You will lose',
				restoring ? INCOMING_BACKUP : shell.doc
			)}
			{#if restoring}
				<div class="space-y-2 rounded-xl border border-dashed p-4 text-muted-foreground">
					<p class="font-medium text-foreground">Currently stored</p>
					<p>Nothing.</p>
				</div>
			{:else}
				<div class="space-y-2">
					<p class="font-medium">Keep a copy first</p>
					<button
						type="button"
						class="flex w-full items-start gap-3 rounded-xl border p-3 text-left hover:bg-muted/50"
						onclick={() => shell.downloadBackup('dialog')}
					>
						<DownloadIcon class="mt-0.5 size-4" />
						<span>
							<span class="block font-medium">Download backup</span>
							<span class="block text-xs text-muted-foreground">
								.json — restores this whole marksheet later
							</span>
						</span>
					</button>
					<button
						type="button"
						class="flex w-full items-start gap-3 rounded-xl border p-3 text-left hover:bg-muted/50"
						onclick={() => shell.exportMarks('dialog')}
					>
						<SheetIcon class="mt-0.5 size-4" />
						<span>
							<span class="block font-medium">Export marks</span>
							<span class="block text-xs text-muted-foreground">
								.csv — for a spreadsheet, can't be restored
							</span>
						</span>
					</button>
				</div>
			{/if}
		</div>
		<Dialog.Footer>
			<Button variant="ghost" onclick={() => shell.close()}>Cancel</Button>
			{#if restoring}
				<Button onclick={() => shell.restore()}><RotateCcwIcon />Restore</Button>
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

{#snippet factsCard(title: string, f: typeof shell.doc)}
	<div class="space-y-2 rounded-xl bg-muted/50 p-4">
		<p class="font-medium">{title}</p>
		{#if f}
			<p class="text-base font-semibold">{f.paperLabel}</p>
			<ul class="space-y-0.5 text-muted-foreground">
				<li>Class {f.className || '— not set'}</li>
				<li>{f.students} students · {f.marksEntered} marks entered</li>
				<li>
					{#if !restoring && shell.backedUpInDialog}
						<span
							class="inline-flex items-center gap-1 font-medium text-green-700 dark:text-green-400"
						>
							<CheckIcon class="size-4" />Backed up just now
						</span>
					{:else}
						Last backup {relative(f.lastExportedAt, shell.now)}
					{/if}
				</li>
			</ul>
		{/if}
	</div>
{/snippet}
