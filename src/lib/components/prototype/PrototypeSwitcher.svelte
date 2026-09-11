<!-- PROTOTYPE — throwaway switcher bar shared by UI prototype routes. Not shipped: gated on dev mode. -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { dev } from '$app/environment';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';

	let {
		variants,
		current
	}: {
		variants: { key: string; label: string }[];
		current: string;
	} = $props();

	function indexOf(key: string) {
		return Math.max(
			0,
			variants.findIndex((v) => v.key === key)
		);
	}

	function setVariant(key: string) {
		const target = resolve(
			`/prototype/marksheet-grid?variant=${encodeURIComponent(key)}` as `/prototype/marksheet-grid?${string}`
		);
		goto(target, { replaceState: true, noScroll: true, keepFocus: true });
	}

	function cycle(delta: number) {
		const i = indexOf(current);
		const next = variants[(i + delta + variants.length) % variants.length];
		setVariant(next.key);
	}

	function onKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement | null;
		if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
		if (target?.isContentEditable) return;
		if (e.key === 'ArrowLeft') cycle(-1);
		if (e.key === 'ArrowRight') cycle(1);
	}

	const active = $derived(variants.find((v) => v.key === current) ?? variants[0]);
</script>

<svelte:window onkeydown={onKeydown} />

{#if dev}
	<div
		class="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-400 bg-amber-950 px-2 py-1.5 text-amber-50 shadow-lg"
	>
		<button
			type="button"
			class="flex size-7 items-center justify-center rounded-full hover:bg-amber-900"
			onclick={() => cycle(-1)}
			aria-label="Previous variant"
		>
			<ChevronLeftIcon class="size-4" />
		</button>
		<span class="min-w-40 text-center text-xs font-medium whitespace-nowrap">
			{active.key} — {active.label}
		</span>
		<button
			type="button"
			class="flex size-7 items-center justify-center rounded-full hover:bg-amber-900"
			onclick={() => cycle(1)}
			aria-label="Next variant"
		>
			<ChevronRightIcon class="size-4" />
		</button>
	</div>
{/if}
