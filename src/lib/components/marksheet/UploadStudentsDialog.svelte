<!--
	Add students from a CSV file of first name, last name. The teacher picks the
	file and says whether row 1 is a header; the dialog shows how the first rows
	will be read before anything is added. Reading rules live in
	`students-csv.ts`; this only wires a file to them.
-->
<script lang="ts">
	import UploadIcon from '@lucide/svelte/icons/upload';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Table from '$lib/components/ui/table';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import { newNames } from '$lib/marksheet/students.js';
	import { readStudentCsv } from '$lib/marksheet/students-csv.js';
	import { count } from '$lib/prose.js';

	let { size = 'sm' }: { size?: 'sm' | 'xs' } = $props();

	const PREVIEW_ROWS = 5;

	const store = marksheetStore();
	let open = $state(false);
	let firstRowIsHeader = $state(true);
	/** The chosen file's text, or null before one is chosen or when it could not be read. */
	let text = $state<string | null>(null);
	let unreadable = $state<string | null>(null);

	// Re-read whenever the header box changes: the box, not the content, decides row 1.
	const csv = $derived(text === null ? null : readStudentCsv(text, firstRowIsHeader));
	const plan = $derived(csv?.ok ? newNames(store.document?.students ?? [], csv.names) : null);
	const error = $derived(unreadable ?? (csv && !csv.ok ? csv.error : null));

	async function chooseFile(event: Event & { currentTarget: HTMLInputElement }): Promise<void> {
		const file = event.currentTarget.files?.[0];
		text = null;
		unreadable = null;
		if (!file) return;
		try {
			// Fatal decoding refuses a binary file rather than reading it as gibberish.
			text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
		} catch (failure) {
			if (!(failure instanceof TypeError || failure instanceof DOMException)) throw failure;
			unreadable = 'That file is not readable text. Choose a .csv file.';
		}
	}

	function reset(): void {
		text = null;
		unreadable = null;
		firstRowIsHeader = true;
	}

	function add(): void {
		if (!csv?.ok) return;
		store.addStudentsFromUpload(csv.names);
		open = false;
	}
</script>

<Dialog.Root bind:open onOpenChange={reset}>
	<Dialog.Trigger>
		{#snippet child({ props })}
			<Button variant="outline" {size} {...props}>
				<UploadIcon class="size-4" /> Upload CSV
			</Button>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Add students from a CSV</Dialog.Title>
			<Dialog.Description>
				Two columns: first name, then last name. Students already in the class are skipped.
			</Dialog.Description>
		</Dialog.Header>
		<Input type="file" accept=".csv,text/csv" aria-label="CSV file" onchange={chooseFile} />
		<div class="flex items-center gap-2">
			<Checkbox id="csv-header" bind:checked={firstRowIsHeader} />
			<Label for="csv-header">First row is a header</Label>
		</div>
		{#if error}
			<p class="text-sm text-destructive" role="alert" data-testid="csv-error">{error}</p>
		{:else if csv?.ok}
			<Table.Root data-testid="csv-preview">
				<Table.Header>
					<Table.Row>
						<Table.Head>First name</Table.Head>
						<Table.Head>Surname</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each csv.names.slice(0, PREVIEW_ROWS) as name, index (index)}
						<Table.Row>
							<Table.Cell>{name.firstName}</Table.Cell>
							<Table.Cell>{name.surname}</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
			{#if csv.names.length > PREVIEW_ROWS}
				<p class="text-xs text-muted-foreground">
					and {count(csv.names.length - PREVIEW_ROWS, 'more row')}
				</p>
			{/if}
		{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
			<Button onclick={add} disabled={!plan || plan.added.length === 0}>
				Add {plan ? count(plan.added.length, 'student') : 'students'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
