<!-- PROTOTYPE — dark-mode toggle in two shapes: a light/dark icon button, or a light/dark/system segmented control. -->
<script lang="ts">
	import { mode, toggleMode, userPrefersMode } from 'mode-watcher';
	import SunIcon from '@lucide/svelte/icons/sun';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import MonitorIcon from '@lucide/svelte/icons/monitor';
	import { Button } from '$lib/components/ui/button';

	let { kind = 'icon' }: { kind?: 'icon' | 'segmented' } = $props();

	const OPTIONS = [
		{ value: 'light', label: 'Light', Icon: SunIcon },
		{ value: 'dark', label: 'Dark', Icon: MoonIcon },
		{ value: 'system', label: 'System', Icon: MonitorIcon }
	] as const;
</script>

{#if kind === 'icon'}
	<Button
		variant="ghost"
		size="icon-sm"
		onclick={toggleMode}
		aria-label={mode.current === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
		title={mode.current === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
	>
		{#if mode.current === 'dark'}<SunIcon />{:else}<MoonIcon />{/if}
	</Button>
{:else}
	<div class="inline-flex rounded-full border p-0.5" role="radiogroup" aria-label="Theme">
		{#each OPTIONS as o (o.value)}
			<button
				type="button"
				role="radio"
				aria-checked={userPrefersMode.current === o.value}
				title={o.label}
				class="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground aria-checked:bg-muted aria-checked:text-foreground"
				onclick={() => (userPrefersMode.current = o.value)}
			>
				<o.Icon class="size-3.5" />
				<span class="sr-only">{o.label}</span>
			</button>
		{/each}
	</div>
{/if}
