<!--
	PROTOTYPE — throwaway route for wayfinder #30 (app shell, nav and the destructive-action dialogs).
	Four structurally different shells around placeholder surfaces, over one stubbed document,
	switchable via ?variant=. Not linked from the app; lives on branch prototype/app-shell only.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { ModeWatcher } from 'mode-watcher';
	import PrototypeSwitcher from '$lib/components/prototype/PrototypeSwitcher.svelte';
	import { SCENARIOS, Shell } from '$lib/prototypes/app-shell/state.svelte.js';
	import VariantA from './VariantA.svelte';
	import VariantB from './VariantB.svelte';
	import VariantC from './VariantC.svelte';
	import VariantD from './VariantD.svelte';

	const VARIANTS = [
		{ key: 'A', label: 'Top bar + header buttons' },
		{ key: 'B', label: 'Flow stepper + File menu' },
		{ key: 'C', label: 'Chosen: grouped by purpose + status bar' },
		{ key: 'D', label: 'Left rail document panel' }
	];

	const variant = $derived(page.url.searchParams.get('variant') ?? 'C');
	const shell = new Shell();
	let collapsed = $state(false);
</script>

<svelte:head>
	<title>Prototype — app shell</title>
</svelte:head>

<ModeWatcher />

<div
	class="fixed right-3 bottom-3 z-[60] flex max-w-sm flex-col items-start gap-1.5 rounded-lg border-2 border-dashed border-amber-400 bg-card/95 p-2.5 text-xs shadow-md backdrop-blur"
>
	<button
		type="button"
		class="font-semibold tracking-wide text-muted-foreground uppercase"
		onclick={() => (collapsed = !collapsed)}
	>
		Prototype controls {collapsed ? '▸' : '▾'}
	</button>
	{#if !collapsed}
		<div class="flex flex-wrap gap-1.5">
			{#each SCENARIOS as s (s.key)}
				<button
					type="button"
					class="rounded-full border px-2.5 py-1 hover:bg-input/30 {shell.scenario === s.key
						? 'border-amber-500'
						: 'border-border'}"
					onclick={() => shell.load(s.key)}
				>
					{s.label}
				</button>
			{/each}
		</div>
		<div class="flex flex-wrap gap-1.5">
			<button
				type="button"
				class="rounded-full border border-border px-2.5 py-1 hover:bg-input/30"
				onclick={() => shell.cycleSave()}
			>
				Save state: <strong>{shell.save}</strong>
			</button>
			<button
				type="button"
				class="rounded-full border border-border px-2.5 py-1 hover:bg-input/30"
				onclick={() => shell.edit()}
			>
				Simulate edit
			</button>
		</div>
		<p class="text-muted-foreground">
			surface <strong>/{shell.surface === 'upload' ? '' : shell.surface}</strong> · stale
			<strong>{shell.stale}</strong> · banner dismissed <strong>{shell.bannerDismissed}</strong>
		</p>
		<ul class="w-full space-y-0.5 font-mono text-[10px] text-muted-foreground">
			{#each shell.log.slice(0, 4) as line, i (i + line)}
				<li class="truncate" title={line}>{line}</li>
			{/each}
		</ul>
	{/if}
</div>

{#if variant === 'B'}
	<VariantB {shell} />
{:else if variant === 'C'}
	<VariantC {shell} />
{:else if variant === 'D'}
	<VariantD {shell} />
{:else}
	<VariantA {shell} />
{/if}

<PrototypeSwitcher variants={VARIANTS} current={variant} path="/prototype/app-shell" />
