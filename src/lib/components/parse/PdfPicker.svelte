<!-- One tier's one PDF input: today's picker, with the other tier's matching input named when missing. -->
<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

	interface Props {
		id: string;
		label: string;
		file: File | null;
		error: string | null;
		/** The other tier has this input, so this slot needs one too. */
		needed: string | null;
		disabled: boolean;
		onpick: (file: File | null) => void;
	}

	let { id, label, file, error, needed, disabled, onpick }: Props = $props();

	function onchange(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		onpick(input.files?.[0] ?? null);
	}
</script>

<div class="space-y-2">
	<Label for={id}>{label}</Label>
	<Input
		{id}
		type="file"
		accept="application/pdf"
		aria-invalid={error !== null || needed !== null}
		{disabled}
		{onchange}
	/>
	{#if file}
		<p class="flex items-center gap-2 text-sm text-muted-foreground">
			<FileTextIcon class="size-4 shrink-0" />
			<span class="truncate">{file.name}</span>
			<Badge variant="secondary">attached</Badge>
		</p>
	{/if}
	{#if error}
		<p class="flex items-center gap-1.5 text-sm text-destructive">
			<TriangleAlertIcon class="size-4 shrink-0" />{error}
		</p>
	{:else if needed}
		<p class="flex items-center gap-1.5 text-sm text-destructive">
			<TriangleAlertIcon class="size-4 shrink-0" />{needed}
		</p>
	{/if}
</div>
