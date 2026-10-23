<!-- PROTOTYPE — one PDF input for a tier slot. Shared widget, not a layout. -->
<script lang="ts">
	import { buttonVariants } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import XIcon from '@lucide/svelte/icons/x';

	interface Props {
		id: string;
		label?: string;
		filename: string | null;
		error: string | null;
		/** The other tier has this input, so this slot needs one too. */
		needed?: string | null;
		disabled?: boolean;
		onpick: (name: string | null) => void;
	}

	let { id, label, filename, error, needed = null, disabled = false, onpick }: Props = $props();

	function onchange(event: Event): void {
		const input = event.target as HTMLInputElement;
		onpick(input.files?.[0]?.name ?? null);
		input.value = '';
	}
</script>

<div class="space-y-1.5">
	{#if label}
		<Label for={id}>{label}</Label>
	{/if}
	<input {id} type="file" accept="application/pdf" class="sr-only" {disabled} {onchange} />
	<div
		class={[
			'flex min-h-9 items-center gap-2 rounded-md border px-2 py-1',
			needed ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30' : 'border-input'
		]}
	>
		{#if filename}
			<FileTextIcon class="size-4 shrink-0 text-muted-foreground" />
			<span class="min-w-0 flex-1 truncate text-sm">{filename}</span>
			{#if !disabled}
				<button
					type="button"
					class="rounded p-0.5 text-muted-foreground hover:bg-muted"
					aria-label="Remove {filename}"
					onclick={() => onpick(null)}
				>
					<XIcon class="size-3.5" />
				</button>
			{/if}
		{:else}
			<span class="flex-1 text-sm text-muted-foreground">No file</span>
		{/if}
		<label
			for={id}
			class={[
				buttonVariants({ variant: 'outline', size: 'sm' }),
				'h-7 cursor-pointer',
				disabled && 'pointer-events-none opacity-50'
			]}
		>
			{filename ? 'Replace' : 'Choose PDF'}
		</label>
	</div>
	{#if error}
		<p class="flex items-center gap-1.5 text-sm text-destructive">
			<TriangleAlertIcon class="size-4 shrink-0" />{error}
		</p>
	{:else if needed}
		<p class="text-sm text-amber-700 dark:text-amber-400">{needed}</p>
	{/if}
</div>
