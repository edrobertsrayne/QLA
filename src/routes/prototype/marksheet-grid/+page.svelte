<!--
	PROTOTYPE — throwaway route for wayfinder #27 (marksheet grid paste + keyboard navigation).
	Structurally different layout variants (A–C round 1, D round 2) over one shared grid engine, switchable via ?variant=.
	Not linked from the app; delete this route (and src/lib/prototypes/marksheet-grid) once the
	decision is captured on the ticket.
-->
<script lang="ts">
	import { page } from '$app/state';
	import PrototypeSwitcher from '$lib/components/prototype/PrototypeSwitcher.svelte';
	import {
		createGridEngine,
		type Keymap,
		type MaxPolicy,
		type PasteWidthPolicy
	} from '$lib/prototypes/marksheet-grid/grid-state.svelte.js';
	import {
		makeSampleLeaves,
		makeSampleStudents
	} from '$lib/prototypes/marksheet-grid/sample-data.js';
	import VariantA from './VariantA.svelte';
	import VariantB from './VariantB.svelte';
	import VariantC from './VariantC.svelte';
	import VariantD from './VariantD.svelte';

	const VARIANTS = [
		{ key: 'A', label: 'Toolbar + two-row grouped header' },
		{ key: 'B', label: 'Side rail + rotated header' },
		{ key: 'C', label: 'Question-paged + tiny header' },
		{ key: 'D', label: 'C header + full grid + inline roster' }
	];

	const variant = $derived(page.url.searchParams.get('variant') ?? 'A');

	const engine = createGridEngine(makeSampleLeaves(), makeSampleStudents(30));

	function resetSample() {
		engine.students = makeSampleStudents(30);
		engine.marks = {};
		engine.absent = {};
		engine.message = { text: 'Reset to the 30-student sample roster.', tone: 'info' };
	}

	function clearRoster() {
		engine.students = [];
		engine.marks = {};
		engine.absent = {};
		engine.cursor = { row: 0, col: -1 };
		engine.message = {
			text: 'Roster cleared — try pasting a block of names into the name column.',
			tone: 'info'
		};
	}

	const MAX_POLICIES: MaxPolicy[] = ['flag', 'clamp', 'reject'];
	const KEYMAPS: Keymap[] = ['spreadsheet', 'apg'];
	const WIDTH_POLICIES: PasteWidthPolicy[] = ['clip', 'abort'];

	function cyclePolicy<T>(list: T[], current: T): T {
		return list[(list.indexOf(current) + 1) % list.length];
	}
</script>

<svelte:head>
	<title>Prototype — marksheet grid</title>
</svelte:head>

<div
	class="fixed bottom-3 left-3 z-40 flex max-w-sm flex-col items-start gap-1.5 rounded-lg border-2 border-dashed border-amber-400 bg-card/95 p-2.5 text-xs shadow-md backdrop-blur"
>
	<span class="font-semibold text-muted-foreground uppercase tracking-wide">Prototype controls</span
	>
	<div class="flex flex-wrap gap-1.5">
		<button
			type="button"
			class="rounded-full border border-border bg-input/30 px-2.5 py-1 hover:bg-input/50"
			onclick={() => (engine.config.maxPolicy = cyclePolicy(MAX_POLICIES, engine.config.maxPolicy))}
		>
			Over-max: <strong>{engine.config.maxPolicy}</strong>
		</button>
		<button
			type="button"
			class="rounded-full border border-border bg-input/30 px-2.5 py-1 hover:bg-input/50"
			onclick={() => (engine.config.keymap = cyclePolicy(KEYMAPS, engine.config.keymap))}
		>
			Tab behaviour: <strong
				>{engine.config.keymap === 'spreadsheet'
					? 'Tab moves right'
					: 'APG (Tab exits grid)'}</strong
			>
		</button>
		<button
			type="button"
			class="rounded-full border border-border bg-input/30 px-2.5 py-1 hover:bg-input/50"
			onclick={() =>
				(engine.config.pasteWidthPolicy = cyclePolicy(
					WIDTH_POLICIES,
					engine.config.pasteWidthPolicy
				))}
		>
			Wide paste: <strong>{engine.config.pasteWidthPolicy}</strong>
		</button>
	</div>
	<div class="flex flex-wrap gap-1.5">
		<button
			type="button"
			class="rounded-full border border-border px-2.5 py-1 hover:bg-input/30"
			onclick={resetSample}
		>
			Reset sample
		</button>
		<button
			type="button"
			class="rounded-full border border-border px-2.5 py-1 hover:bg-input/30"
			onclick={clearRoster}
		>
			Clear roster (test empty-paste path)
		</button>
		{#if engine.canUndo}
			<button
				type="button"
				class="rounded-full border border-amber-500 px-2.5 py-1 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
				onclick={() => engine.undo()}
			>
				Undo last paste
			</button>
		{/if}
	</div>
</div>

{#if variant === 'B'}
	<VariantB {engine} />
{:else if variant === 'C'}
	<VariantC {engine} />
{:else if variant === 'D'}
	<VariantD {engine} />
{:else}
	<VariantA {engine} />
{/if}

<PrototypeSwitcher variants={VARIANTS} current={variant} />
