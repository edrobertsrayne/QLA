<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { cn } from '$lib/utils.js';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import CheckIcon from '@lucide/svelte/icons/check';

	export interface ModelOption {
		id: string;
		name: string;
		promptPrice: number;
		completionPrice: number;
	}

	interface Props {
		value?: string;
		custom?: boolean;
		models?: ModelOption[];
		loading?: boolean;
		loadError?: string | null;
		source?: 'live' | 'fallback' | null;
		onretry?: () => void;
	}

	let {
		value = $bindable(''),
		custom = $bindable(false),
		models = [],
		loading = false,
		loadError = null,
		source = null,
		onretry
	}: Props = $props();

	let open = $state(false);
	let search = $state('');
	let highlight = $state(0);
	let rootEl: HTMLDivElement | null = $state(null);
	let customInputEl: HTMLInputElement | null = $state(null);

	const CUSTOM_ID = '__custom';

	interface Row {
		id: string;
		name: string;
		sub: string | null;
		price: string | null;
	}

	const rows = $derived.by<Row[]>(() => {
		const all: Row[] = [
			{
				id: '',
				name: 'Server default',
				sub: 'Resolves to OPENROUTER_MODEL, else Gemini Flash',
				price: null
			}
		];
		for (const m of models) {
			all.push({
				id: m.id,
				name: m.name,
				sub: m.id,
				price:
					m.promptPrice > 0 || m.completionPrice > 0
						? `$${m.promptPrice.toFixed(2)} / $${m.completionPrice.toFixed(2)} per 1M`
						: null
			});
		}
		const query = search.trim().toLowerCase();
		const filtered =
			query === ''
				? all
				: all.filter(
						(row) =>
							row.name.toLowerCase().includes(query) ||
							(row.sub !== null && row.sub.toLowerCase().includes(query))
					);
		// The Custom action is always available, even when the search matches nothing.
		return [
			...filtered,
			{ id: CUSTOM_ID, name: 'Custom model…', sub: 'Type any OpenRouter model id', price: null }
		];
	});

	const selectedName = $derived.by(() => {
		if (custom) return value === '' ? 'Custom model…' : value;
		if (value === '') return 'Server default';
		return models.find((m) => m.id === value)?.name ?? value;
	});

	function choose(id: string): void {
		if (id === CUSTOM_ID) {
			custom = true;
			open = false;
			search = '';
			highlight = 0;
			return;
		}
		value = id;
		custom = false;
		open = false;
		search = '';
		highlight = 0;
	}

	function onTriggerKey(event: KeyboardEvent): void {
		if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			open = true;
		}
	}

	function onSearchKey(event: KeyboardEvent): void {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			highlight = Math.min(highlight + 1, rows.length - 1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			highlight = Math.max(highlight - 1, 0);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			const row = rows[highlight];
			if (row) choose(row.id);
		} else if (event.key === 'Escape') {
			open = false;
		}
	}

	$effect(() => {
		if (custom) customInputEl?.focus();
	});

	$effect(() => {
		if (!open) return;
		highlight = 0;
		function onPointer(event: PointerEvent): void {
			if (rootEl && !rootEl.contains(event.target as Node)) open = false;
		}
		document.addEventListener('pointerdown', onPointer);
		return () => document.removeEventListener('pointerdown', onPointer);
	});
</script>

<div bind:this={rootEl} class="relative" data-testid="model-select">
	<button
		type="button"
		role="combobox"
		aria-expanded={open}
		aria-controls="model-select-listbox"
		aria-haspopup="listbox"
		aria-label="Model override"
		disabled={loading}
		onclick={() => (open = !open)}
		onkeydown={onTriggerKey}
		class={cn(
			'flex h-9 w-full items-center justify-between rounded-4xl border border-input bg-input/30 px-3 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'
		)}
	>
		<span class="truncate">{loading ? 'Loading models…' : selectedName}</span>
		<ChevronsUpDownIcon class="ml-2 size-4 shrink-0 opacity-50" />
	</button>

	{#if open}
		<div
			id="model-select-listbox"
			class="absolute z-50 mt-1 w-full rounded-xl border border-border bg-popover p-1 shadow-md"
			role="listbox"
			aria-label="Compatible models"
		>
			<div class="p-1">
				<Input
					type="search"
					placeholder="Search models…"
					bind:value={search}
					onkeydown={onSearchKey}
					aria-label="Search models"
				/>
			</div>
			{#if loadError}
				<p class="px-3 py-2 text-sm text-destructive">{loadError}</p>
				{#if onretry}
					<div class="p-1">
						<button
							type="button"
							onclick={onretry}
							class="w-full rounded-lg px-3 py-1.5 text-left text-sm font-medium hover:bg-accent"
						>
							Retry loading models
						</button>
					</div>
				{/if}
			{:else if rows.length === 0}
				<p class="px-3 py-2 text-sm text-muted-foreground">No models match “{search.trim()}”.</p>
			{:else}
				<ul class="max-h-64 overflow-y-auto">
					{#each rows as row, i (row.id + row.name)}
						<li
							role="option"
							aria-selected={row.id === CUSTOM_ID ? custom : row.id === value && !custom}
							tabindex={-1}
							onclick={() => choose(row.id)}
							onkeydown={(event) => {
								if (event.key === 'Enter' || event.key === ' ') {
									event.preventDefault();
									choose(row.id);
								}
							}}
							class={cn(
								'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent',
								i === highlight && 'bg-accent'
							)}
						>
							<span
								class={cn(
									'size-4 shrink-0',
									(row.id === CUSTOM_ID ? custom : row.id === value && !custom)
										? 'opacity-100'
										: 'opacity-0'
								)}
							>
								<CheckIcon class="size-4" />
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate font-medium">{row.name}</span>
								{#if row.sub}
									<span class="block truncate text-xs text-muted-foreground">{row.sub}</span>
								{/if}
							</span>
							{#if row.price}
								<span class="shrink-0 text-xs text-muted-foreground">{row.price}</span>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
			{#if source === 'fallback' && !loadError}
				<p class="px-3 py-1.5 text-xs text-muted-foreground">
					Live pricing unreachable — showing built-in prices.
				</p>
			{/if}
		</div>
	{/if}

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
