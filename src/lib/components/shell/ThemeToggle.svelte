<!--
	Light, Dark or System, as one segmented control. It binds straight to
	mode-watcher's `userPrefersMode`, which keeps the choice in localStorage under
	its own key — so it survives a reload, and a new upload, which only ever
	removes the marksheet document.
-->
<script lang="ts">
	import MonitorIcon from '@lucide/svelte/icons/monitor';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { userPrefersMode } from 'mode-watcher';

	const OPTIONS = [
		{ value: 'light', label: 'Light', Icon: SunIcon },
		{ value: 'dark', label: 'Dark', Icon: MoonIcon },
		{ value: 'system', label: 'System', Icon: MonitorIcon }
	] as const;
</script>

<div class="inline-flex rounded-full border p-0.5" role="radiogroup" aria-label="Theme">
	{#each OPTIONS as option (option.value)}
		<button
			type="button"
			role="radio"
			aria-checked={userPrefersMode.current === option.value}
			title={option.label}
			class="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground aria-checked:bg-muted aria-checked:text-foreground"
			onclick={() => (userPrefersMode.current = option.value)}
		>
			<option.Icon class="size-3.5" />
			<span class="sr-only">{option.label}</span>
		</button>
	{/each}
</div>
