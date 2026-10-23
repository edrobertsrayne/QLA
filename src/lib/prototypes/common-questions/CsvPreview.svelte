<!--
	PROTOTYPE (#115) — shows a CSV's rows before download, so its columns can be judged
	without opening a spreadsheet. Scaffolding, not a proposal for the real export.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { downloadCsv } from './exports.js';

	let {
		open = $bindable(false),
		rows,
		filename
	}: { open?: boolean; rows: string[][]; filename: string } = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-w-[95vw] sm:max-w-[95vw]">
		<Dialog.Header>
			<Dialog.Title class="font-mono text-sm">{filename}</Dialog.Title>
			<Dialog.Description>
				Prototype preview of the file's rows ({rows.length - 1} data rows).
			</Dialog.Description>
		</Dialog.Header>
		<div class="max-h-[60vh] overflow-auto rounded border">
			<table class="text-xs">
				<thead class="sticky top-0 bg-muted">
					<tr>
						{#each rows[0] as head, i (i)}
							<th class="px-2 py-1 text-left font-medium whitespace-nowrap">{head}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each rows.slice(1) as row, r (r)}
						<tr class="border-t">
							{#each row as cell, i (i)}
								<td class="max-w-56 truncate px-2 py-0.5 whitespace-nowrap tabular-nums">{cell}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<Dialog.Footer>
			<Button onclick={() => downloadCsv(rows, filename)}>Download</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
