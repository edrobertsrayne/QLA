<!--
	PROTOTYPE (#118) — throwaway. Where today's review sidebar cards go once the
	header-bar layout (A2) has no sidebar: "Does it add up?" (the total printed on the
	paper, per tier), "Skill descriptions" (AO descriptions, one shared set for the
	assessment) and "Needs attention" (per tier).
	mode "row": three compact cards between the header bar and the table.
	mode "panel": the same three behind one disclosure, closed by default, with a
	one-line status on its trigger.
	mode "fold": no cards. The total is an inline field on a strip under the confirm row,
	Needs attention is an alert listing its entries, and AO descriptions open in a dialog.
-->
<script lang="ts">
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import * as Accordion from '$lib/components/ui/accordion';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { twoTierReview, type Entry, type TierIndex } from './review.svelte.js';

	let {
		mode,
		current,
		single
	}: { mode: 'row' | 'panel' | 'fold'; current: TierIndex; single: boolean } = $props();

	const review = twoTierReview();

	// Per visit and per tier, as today: the printed total is never stored.
	let printed = $state<[number | null, number | null]>([null, null]);
	let aoDescriptions = $state<Record<string, string>>({
		AO1: 'Remember and understand ideas and methods',
		AO2: 'Apply ideas and methods',
		AO3: 'Analyse, interpret and evaluate'
	});
	let aoOpen = $state(false);

	const tierLabel = $derived(review.tierLabel(current));
	const accounted = $derived(review.tierMarks(current));
	const total = $derived(printed[current]);
	const check = $derived.by(() => {
		if (total === null) return null;
		const diff = total - accounted;
		if (diff === 0) return { tone: 'ok', text: `${accounted} of ${total} — adds up.` } as const;
		if (diff > 0)
			return {
				tone: 'bad',
				text: `${accounted} of ${total} — ${diff} marks unaccounted — an entry may be missing.`
			} as const;
		return {
			tone: 'bad',
			text: `${accounted} of ${total} — ${-diff} marks too many — an entry may be duplicated or over-marked.`
		} as const;
	});

	/** Assessment-level: every AO code either tier uses. */
	const aos = $derived(
		[
			...new Set(
				review.tiers.flatMap((t) => t.entries.map((e) => e.ao).filter((a): a is string => !!a))
			)
		].sort()
	);

	const attention = $derived.by(() => {
		const entries = review.tiers[current].entries;
		const labels = entries.map((e) => e.label.trim());
		const counts = { get: (l: string) => labels.filter((x) => x === l).length };
		return entries.flatMap((e: Entry) => {
			const reasons: string[] = [];
			if (e.marks === null) reasons.push('no available marks');
			if (e.label.trim() === '') reasons.push('no label');
			else if ((counts.get(e.label.trim()) ?? 0) > 1) reasons.push('duplicate label');
			return reasons.length > 0 ? [{ entry: e, reasons: reasons.join(', ') }] : [];
		});
	});

	function onTotal(event: Event & { currentTarget: HTMLInputElement }) {
		const typed = event.currentTarget.value.trim();
		printed[current] = typed === '' || !/^\d+$/.test(typed) ? null : Number(typed);
	}

	const totalHeading = $derived(single ? 'Does it add up?' : `Does ${tierLabel} add up?`);
	const status = $derived(
		[
			check === null ? 'total not checked' : check.tone === 'ok' ? 'adds up' : 'does not add up',
			`${aos.length} skill descriptions`,
			attention.length === 0 ? 'nothing flagged' : `${attention.length} need attention`
		].join(' · ')
	);
</script>

{#snippet totalField(id: string)}
	<Input
		{id}
		class="h-8 w-20"
		type="number"
		min="0"
		inputmode="numeric"
		placeholder="—"
		value={total ?? ''}
		oninput={onTotal}
	/>
{/snippet}

{#snippet totalResult()}
	{#if check === null}
		<p class="text-xs text-muted-foreground">
			{single ? 'This breakdown' : `${tierLabel}'s breakdown`} accounts for
			<strong>{accounted}</strong> marks.
		</p>
	{:else}
		<p
			class="text-xs {check.tone === 'ok'
				? 'text-emerald-700 dark:text-emerald-400'
				: 'text-destructive'}"
		>
			{check.text}
		</p>
	{/if}
{/snippet}

{#snippet aoFields(prefix: string)}
	{#each aos as ao (ao)}
		<div class="grid grid-cols-[3rem_1fr] items-center gap-2">
			<Label class="text-xs text-muted-foreground" for="{prefix}-{ao}">{ao}</Label>
			<Input
				id="{prefix}-{ao}"
				class="h-8 text-xs"
				placeholder="No description"
				bind:value={aoDescriptions[ao]}
			/>
		</div>
	{/each}
{/snippet}

{#snippet attentionList()}
	<ul class="space-y-0.5">
		{#each attention as item (item.entry.id)}
			<li class="text-xs">
				<strong class="mr-1">{item.entry.label || '(no label)'}</strong>
				<span class="text-destructive">{item.reasons}</span>
			</li>
		{:else}
			<li class="text-xs text-muted-foreground">Nothing flagged.</li>
		{/each}
	</ul>
{/snippet}

{#snippet cards(prefix: string)}
	<div class="grid gap-3 md:grid-cols-[1fr_2fr_1fr]">
		<section class="space-y-2 rounded-lg border p-3">
			<h2 class="text-sm font-semibold">{totalHeading}</h2>
			<div class="flex items-center gap-2">
				<Label class="text-xs text-muted-foreground" for="{prefix}-total"
					>Total marks printed on the paper</Label
				>
				{@render totalField(`${prefix}-total`)}
			</div>
			{@render totalResult()}
		</section>
		<section class="space-y-2 rounded-lg border p-3">
			<h2 class="text-sm font-semibold">
				Skill descriptions{#if !single}<span class="font-normal text-muted-foreground">
						· both tiers</span
					>{/if}
			</h2>
			<p class="text-xs text-muted-foreground">
				Shown beside each skill on a student's report. Leave one blank to show the code alone.
			</p>
			<div class="grid gap-1.5 lg:grid-cols-2">{@render aoFields(prefix)}</div>
		</section>
		<section class="space-y-1 rounded-lg border p-3">
			<h2 class="text-sm font-semibold">
				Needs attention ({attention.length}){#if !single}<span
						class="font-normal text-muted-foreground"
					>
						· {tierLabel}</span
					>{/if}
			</h2>
			{@render attentionList()}
		</section>
	</div>
{/snippet}

{#if mode === 'row'}
	{@render cards('row')}
{:else if mode === 'panel'}
	<Accordion.Root type="single" class="rounded-lg border px-3">
		<Accordion.Item value="checks" class="border-b-0">
			<Accordion.Trigger class="py-2 text-sm">
				<span>
					Paper checks &amp; skill descriptions
					<span class="ml-2 font-normal text-muted-foreground">{status}</span>
				</span>
			</Accordion.Trigger>
			<Accordion.Content>{@render cards('panel')}</Accordion.Content>
		</Accordion.Item>
	</Accordion.Root>
{:else}
	<div class="space-y-2">
		<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
			<Label class="text-xs text-muted-foreground" for="fold-total">
				Total marks printed on {single ? 'the paper' : `${tierLabel}'s paper`}
			</Label>
			{@render totalField('fold-total')}
			{@render totalResult()}
			<Dialog.Root bind:open={aoOpen}>
				<Dialog.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="outline" size="sm" class="ml-auto">
							Skill descriptions ({aos.length})
						</Button>
					{/snippet}
				</Dialog.Trigger>
				<Dialog.Content>
					<Dialog.Header>
						<Dialog.Title>Skill descriptions</Dialog.Title>
						<Dialog.Description>
							Shown beside each skill on a student's report{single ? '' : ', on both tiers'}. Leave
							one blank to show the code alone.
						</Dialog.Description>
					</Dialog.Header>
					<div class="space-y-1.5">{@render aoFields('dialog')}</div>
					<Dialog.Footer>
						<Button onclick={() => (aoOpen = false)}>Done</Button>
					</Dialog.Footer>
				</Dialog.Content>
			</Dialog.Root>
		</div>
		{#if attention.length > 0}
			<Alert.Root>
				<TriangleAlertIcon />
				<Alert.Title>
					{attention.length} entries need attention{single ? '' : ` on ${tierLabel}`}
				</Alert.Title>
				<Alert.Description>{@render attentionList()}</Alert.Description>
			</Alert.Root>
		{/if}
	</div>
{/if}
