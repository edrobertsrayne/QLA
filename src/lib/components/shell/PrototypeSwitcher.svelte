<!--
	PROTOTYPE switcher: the floating bar that cycles ?variant= on the current
	route. ← / → cycle too, unless typing. Never renders outside dev.
-->
<script lang="ts">
	import { dev } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';

	let { variants, current }: { variants: { key: string; name: string }[]; current: string } =
		$props();

	const index = $derived(
		Math.max(
			0,
			variants.findIndex((v) => v.key === current)
		)
	);

	function cycle(step: number): void {
		const next = variants[(index + step + variants.length) % variants.length];
		const url = new URL(page.url);
		url.searchParams.set('variant', next.key);
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- prototype: same route, new query
		void goto(url, { replaceState: true, keepFocus: true, noScroll: true });
	}

	function onkeydown(event: KeyboardEvent): void {
		const target = event.target as HTMLElement | null;
		if (target?.closest('input, textarea, select, [contenteditable]')) return;
		if (event.key === 'ArrowLeft') cycle(-1);
		if (event.key === 'ArrowRight') cycle(1);
	}
</script>

<svelte:window {onkeydown} />

{#if dev}
	<div
		class="fixed left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-foreground px-2 py-1 text-sm text-background shadow-xl ring-2 ring-amber-400"
		style="bottom: calc(var(--status-bar-height) + 0.75rem)"
	>
		<button
			class="rounded-full p-1 hover:bg-background/20"
			aria-label="Previous variant"
			onclick={() => cycle(-1)}><ChevronLeftIcon class="size-4" /></button
		>
		<span class="min-w-48 px-2 text-center font-medium">
			{variants[index].key} ({variants[index].name})
			<span class="opacity-60">· {index + 1}/{variants.length}</span>
		</span>
		<button
			class="rounded-full p-1 hover:bg-background/20"
			aria-label="Next variant"
			onclick={() => cycle(1)}><ChevronRightIcon class="size-4" /></button
		>
	</div>
{/if}
