<!--
	Light, Dark or System, as one segmented control. It binds straight to
	mode-watcher's `userPrefersMode`, which keeps the choice in localStorage under
	its own key — so it survives a reload, and a new upload, which only ever
	removes the marksheet document.
-->
<script lang="ts">
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import MonitorIcon from '@lucide/svelte/icons/monitor';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { userPrefersMode } from 'mode-watcher';

	const OPTIONS = [
		{ value: 'light', label: 'Light', Icon: SunIcon },
		{ value: 'dark', label: 'Dark', Icon: MoonIcon },
		{ value: 'system', label: 'System', Icon: MonitorIcon }
	] as const;

	/** A single-choice group lets the chosen item be clicked off; a theme is always one of the three. */
	function choose(value: string): void {
		const option = OPTIONS.find((candidate) => candidate.value === value);
		if (option) userPrefersMode.current = option.value;
	}
</script>

<ToggleGroup.Root
	type="single"
	size="sm"
	variant="outline"
	aria-label="Theme"
	value={userPrefersMode.current}
	onValueChange={choose}
>
	{#each OPTIONS as option (option.value)}
		<ToggleGroup.Item value={option.value} title={option.label}>
			<option.Icon class="size-3.5" />
			<span class="sr-only">{option.label}</span>
		</ToggleGroup.Item>
	{/each}
</ToggleGroup.Root>
