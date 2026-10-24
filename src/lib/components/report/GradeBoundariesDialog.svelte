<!--
	The grade-boundaries dialog: the shared editor in a modal frame, for one
	tier. It edits a working copy — nothing reaches the marksheet until Save
	boundaries. The tier's printed name sits beside it, because a name read from
	the paper is display data that stays fixable after confirmation.
-->
<script lang="ts">
	import { tierLabel } from '$lib/components/marksheet/tier-label.js';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import type { TierIndex } from '$lib/marksheet/document.js';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import GradeBoundariesForm from './GradeBoundariesForm.svelte';

	let {
		open = $bindable(false),
		tier = 0
	}: {
		open?: boolean;
		/** The tier whose boundaries and name are edited; one tier means Tier 1. */
		tier?: TierIndex;
	} = $props();

	const store = marksheetStore();
	const document = $derived(store.document);
	const twoTiers = $derived((document?.tiers.length ?? 0) === 2);

	const title = $derived(
		document !== null && twoTiers
			? `Grade boundaries · ${tierLabel(document, tier)}`
			: 'Grade boundaries'
	);

	/** What the teacher has typed, or null while the field still shows what is stored. */
	let typed = $state<string | null>(null);
	const value = $derived(typed ?? document?.tiers[tier]?.tierName ?? '');
	const trimmed = $derived(value.trim());
	const storedName = $derived(document?.tiers[tier]?.tierName ?? '');
	const changed = $derived(trimmed !== storedName);

	/** The rule a tier name obeys: any name alone, a distinct one of two. */
	const issue = $derived.by(() => {
		if (document === null || !twoTiers) return null;
		if (trimmed === '') return 'Each tier needs a name.';
		const other = document.tiers[tier === 0 ? 1 : 0]?.tierName ?? '';
		if (other.trim().toLowerCase() === trimmed.toLowerCase()) {
			return 'The two tiers need different names.';
		}
		return null;
	});

	function saveName(): void {
		if (!changed || issue !== null) return;
		store.setTierName(tier, value);
		typed = null;
	}
</script>

<Dialog.Root
	bind:open
	onOpenChange={(next) => {
		if (!next) typed = null;
	}}
>
	<Dialog.Content class="sm:max-w-lg" data-testid="grade-boundaries-dialog">
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
		</Dialog.Header>
		<div class="space-y-1.5">
			<Label for="tier-name" class="text-xs text-muted-foreground">
				Tier name, as printed on the paper
			</Label>
			<div class="flex items-center gap-2">
				<Input
					id="tier-name"
					data-testid="tier-name"
					class="h-8"
					{value}
					oninput={(event) => (typed = event.currentTarget.value)}
					onkeydown={(event) => {
						if (event.key === 'Enter') saveName();
					}}
				/>
				<Button
					variant="outline"
					size="sm"
					data-testid="tier-name-save"
					disabled={!changed || issue !== null}
					onclick={saveName}
				>
					Save name
				</Button>
			</div>
			{#if changed && issue !== null}
				<p class="text-xs text-destructive" role="alert" data-testid="tier-name-issue">{issue}</p>
			{/if}
		</div>
		{#if open}
			<GradeBoundariesForm
				{tier}
				onDone={() => {
					open = false;
					typed = null;
				}}
			/>
		{/if}
	</Dialog.Content>
</Dialog.Root>
