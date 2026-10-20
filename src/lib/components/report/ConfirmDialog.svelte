<!--
	A yes/no question in a dialog: a title, one line of description and a button
	per answer. The caller renders it only while the question is pending, and
	`onclose` fires whichever way it ends, after the chosen action has run: the
	action reads the pending state the caller is about to clear.
-->
<script lang="ts">
	import { Button, type ButtonVariant } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';

	interface ConfirmAction {
		label: string;
		variant?: ButtonVariant;
		onclick: () => void;
	}

	let {
		title,
		description,
		actions,
		onclose
	}: {
		title: string;
		description: string;
		actions: ConfirmAction[];
		onclose: () => void;
	} = $props();
</script>

<Dialog.Root
	open
	onOpenChange={(isOpen) => {
		if (!isOpen) onclose();
	}}
>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			<Dialog.Description>{description}</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			{#each actions as action (action.label)}
				<Button
					variant={action.variant ?? 'default'}
					onclick={() => {
						action.onclick();
						onclose();
					}}
				>
					{action.label}
				</Button>
			{/each}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
