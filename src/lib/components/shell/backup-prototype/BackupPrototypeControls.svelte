<!--
	PROTOTYPE (#93) controls: the variant switcher (← / → too, unless typing) and
	free play over the fake backup state. Bottom-left, so toasts (bottom-centre)
	and feedback (bottom-right) stay clear. Never renders outside dev.
-->
<script lang="ts">
	import { dev } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { Button } from '$lib/components/ui/button';
	import { PRESETS, VARIANTS, proto, protoVariant, type Preset } from './proto.svelte.js';

	const current = $derived(protoVariant() ?? 'A');
	const index = $derived(VARIANTS.findIndex((v) => v.key === current));

	function cycle(step: number): void {
		const next = VARIANTS[(index + step + VARIANTS.length) % VARIANTS.length];
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

	const presets = Object.entries(PRESETS) as [Preset, (typeof PRESETS)[Preset]][];
	const fmt = (at: Date | null): string => (at === null ? 'null' : at.toISOString().slice(0, 16));
	let open = $state(true);
</script>

<svelte:window {onkeydown} />

{#if dev}
	<aside
		class="fixed bottom-[calc(var(--status-bar-height)+0.75rem)] left-4 z-50 w-80 space-y-2 rounded-lg border-2 border-dashed border-amber-400 bg-background p-3 text-xs shadow-xl"
	>
		<div class="flex items-center gap-1 rounded-full bg-foreground px-2 py-1 text-background">
			<button
				class="rounded-full p-1 hover:bg-background/20"
				aria-label="Previous variant"
				onclick={() => cycle(-1)}><ChevronLeftIcon class="size-4" /></button
			>
			<span class="flex-1 text-center font-medium">
				{VARIANTS[index].key} ({VARIANTS[index].name})
				<span class="opacity-60">· {index + 1}/{VARIANTS.length}</span>
			</span>
			<button
				class="rounded-full p-1 hover:bg-background/20"
				aria-label="Next variant"
				onclick={() => cycle(1)}><ChevronRightIcon class="size-4" /></button
			>
		</div>
		<button class="text-muted-foreground underline" onclick={() => (open = !open)}>
			{open ? 'Hide state controls' : 'Show state controls'}
		</button>
		{#if open}
			<p class="font-semibold">Prototype (#93): backup state</p>
			<div class="grid gap-1">
				{#each presets as [key, preset] (key)}
					<Button
						size="xs"
						variant="secondary"
						class="justify-start"
						onclick={() => proto.apply(key)}>{preset.label}</Button
					>
				{/each}
			</div>
			<div class="flex gap-1">
				<Button size="xs" variant="outline" onclick={() => proto.change()}>Make a change</Button>
				<Button size="xs" variant="outline" onclick={() => proto.showToast()}>Show toast</Button>
			</div>
			<pre class="rounded bg-muted p-2 text-[11px] leading-tight">enabled:       {proto.enabled}
backedUpAt:    {fmt(proto.backedUpAt)}
firstChangeAt: {fmt(proto.firstChangeAt)}
overdue (>2d): {proto.overdue}
toastShown:    {proto.toastShown}</pre>
		{/if}
	</aside>
{/if}
