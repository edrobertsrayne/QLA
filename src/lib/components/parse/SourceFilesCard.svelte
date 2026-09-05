<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

	interface Props {
		paperFileName: string | null;
		markschemeFileName: string | null;
		paperError: string | null;
		markschemeError: string | null;
		onPaperChange: (event: Event) => void;
		onMarkschemeChange: (event: Event) => void;
	}

	let {
		paperFileName,
		markschemeFileName,
		paperError,
		markschemeError,
		onPaperChange,
		onMarkschemeChange
	}: Props = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Source files</Card.Title>
		<Card.Description
			>One or both PDFs, each up to 15&nbsp;MB — paper and/or markscheme.</Card.Description
		>
	</Card.Header>
	<Card.Content class="space-y-5">
		<div class="space-y-2">
			<Label for="paper">Assessment paper (PDF)</Label>
			<Input
				id="paper"
				type="file"
				accept="application/pdf"
				aria-invalid={paperError !== null}
				onchange={onPaperChange}
			/>
			{#if paperFileName}
				<p class="flex items-center gap-2 text-sm text-muted-foreground">
					<FileTextIcon class="size-4 shrink-0" />
					<span class="truncate">{paperFileName}</span>
					<Badge variant="secondary">attached</Badge>
				</p>
			{/if}
			{#if paperError}
				<p class="flex items-center gap-1.5 text-sm text-destructive">
					<TriangleAlertIcon class="size-4 shrink-0" />{paperError}
				</p>
			{/if}
		</div>

		<div class="space-y-2">
			<Label for="markscheme">Markscheme (PDF)</Label>
			<Input
				id="markscheme"
				type="file"
				accept="application/pdf"
				aria-invalid={markschemeError !== null}
				onchange={onMarkschemeChange}
			/>
			{#if markschemeFileName}
				<p class="flex items-center gap-2 text-sm text-muted-foreground">
					<FileTextIcon class="size-4 shrink-0" />
					<span class="truncate">{markschemeFileName}</span>
					<Badge variant="secondary">attached</Badge>
				</p>
			{/if}
			{#if markschemeError}
				<p class="flex items-center gap-1.5 text-sm text-destructive">
					<TriangleAlertIcon class="size-4 shrink-0" />{markschemeError}
				</p>
			{/if}
		</div>
	</Card.Content>
</Card.Root>
