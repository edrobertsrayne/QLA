<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';
	import { cn } from '$lib/utils.js';
	import { tick } from 'svelte';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';

	export interface ModelOption {
		id: string;
		name: string;
	}

	interface Props {
		value?: string;
		custom?: boolean;
		models?: ModelOption[];
		loading?: boolean;
		loadError?: string | null;
		onretry?: () => void;
	}

	let {
		value = $bindable(''),
		custom = $bindable(false),
		models = [],
		loading = false,
		loadError = null,
		onretry
	}: Props = $props();

	let open = $state(false);
	let search = $state('');
	let triggerEl: HTMLButtonElement | null = $state(null);
	let customInputEl: HTMLInputElement | null = $state(null);

	const CUSTOM_ID = '__custom';

	const selectedName = $derived.by(() => {
		if (custom) return value === '' ? 'Custom model…' : value;
		if (value === '') return 'Server default';
		return models.find((m) => m.id === value)?.name ?? value;
	});

	function closeAndFocusTrigger(): void {
		open = false;
		search = '';
		if (!custom) tick().then(() => triggerEl?.focus());
	}

	function choose(id: string): void {
		if (id === CUSTOM_ID) {
			custom = true;
			closeAndFocusTrigger();
			return;
		}
		value = id;
		custom = false;
		closeAndFocusTrigger();
	}

	$effect(() => {
		if (custom) customInputEl?.focus();
	});
</script>

<div class="relative" data-testid="model-select">
	<Popover.Root bind:open>
		<Popover.Trigger bind:ref={triggerEl}>
			{#snippet child({ props })}
				<button
					{...props}
					type="button"
					role="combobox"
					aria-expanded={open}
					aria-label="Model override"
					disabled={loading}
					class={cn(
						'flex h-9 w-full items-center justify-between rounded-4xl border border-input bg-input/30 px-3 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'
					)}
				>
					<span class="truncate">{loading ? 'Loading models…' : selectedName}</span>
					<ChevronsUpDownIcon class="ml-2 size-4 shrink-0 opacity-50" />
				</button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-[var(--bits-popover-anchor-width)] p-0" align="start">
			<Command.Root>
				<Command.Input
					placeholder="Search models…"
					bind:value={search}
					aria-label="Search models"
					autofocus
				/>
				{#if loadError}
					<div class="p-2 text-sm text-destructive">
						<p>{loadError}</p>
						{#if onretry}
							<button
								type="button"
								onclick={onretry}
								class="mt-2 w-full rounded-lg px-3 py-1.5 text-left text-sm font-medium hover:bg-accent"
							>
								Retry loading models
							</button>
						{/if}
					</div>
				{:else}
					<Command.List>
						<Command.Empty>No models match “{search.trim()}”.</Command.Empty>
						<Command.Item
							value="Server default"
							keywords={['OPENROUTER_MODEL', 'Gemini Flash', 'default']}
							data-checked={value === '' && !custom}
							onSelect={() => choose('')}
						>
							<span class="min-w-0 flex-1">
								<span class="block truncate font-medium">Server default</span>
								<span class="block truncate text-xs text-muted-foreground">
									Resolves to OPENROUTER_MODEL, else Gemini Flash
								</span>
							</span>
						</Command.Item>
						{#each models as model (model.id)}
							<Command.Item
								value={model.name}
								keywords={[model.id]}
								data-checked={model.id === value && !custom}
								onSelect={() => choose(model.id)}
							>
								<span class="min-w-0 flex-1">
									<span class="block truncate font-medium">{model.name}</span>
									<span class="block truncate text-xs text-muted-foreground">{model.id}</span>
								</span>
							</Command.Item>
						{/each}
						<Command.Item
							value="Custom model…"
							keywords={['custom', 'vendor/model-id']}
							forceMount
							data-checked={custom}
							onSelect={() => choose(CUSTOM_ID)}
						>
							<span class="min-w-0 flex-1">
								<span class="block truncate font-medium">Custom model…</span>
								<span class="block truncate text-xs text-muted-foreground">
									Type any OpenRouter model id
								</span>
							</span>
						</Command.Item>
					</Command.List>
				{/if}
			</Command.Root>
		</Popover.Content>
	</Popover.Root>

	{#if custom}
		<div class="mt-2 space-y-1">
			<Input
				bind:ref={customInputEl}
				placeholder="e.g. vendor/model-id"
				bind:value
				aria-label="Custom model id"
			/>
			<p class="text-xs text-muted-foreground">
				Custom models run natively only when they support PDF input — otherwise text-only, with
				diagram-heavy questions marked unverified.
			</p>
		</div>
	{/if}
</div>
