<!--
	The students still waiting for a tier: a list, not a grid, because without a
	tier there is no paper to mark. One click puts a student on either tier;
	selecting several places them in one go.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Table from '$lib/components/ui/table';
	import type { TierIndex } from '$lib/marksheet/document.js';
	import { marksheetStore } from '$lib/marksheet/index.js';
	import { studentName } from '$lib/marksheet/students.js';
	import OffTierBadge from './OffTierBadge.svelte';
	import { tierLabel } from './tier-label.js';

	const store = marksheetStore();
	const document = $derived(store.document);
	const students = $derived(store.studentsWithoutTier());

	/** The chosen students who are still waiting: a tier set elsewhere drops them. */
	let selected = $state<string[]>([]);
	const chosen = $derived(selected.filter((id) => students.some((student) => student.id === id)));
	const allChosen = $derived(students.length > 0 && chosen.length === students.length);

	function toggle(studentId: string, on: boolean): void {
		selected = on
			? chosen.includes(studentId)
				? chosen
				: [...chosen, studentId]
			: chosen.filter((id) => id !== studentId);
	}

	function assign(studentId: string, tier: TierIndex): void {
		store.setStudentTier(studentId, tier);
		selected = chosen.filter((id) => id !== studentId);
	}

	/** Place everyone chosen on one tier: the whole class in two clicks, one undo. */
	function moveChosen(tier: TierIndex): void {
		store.setStudentsTier(chosen, tier);
		selected = [];
	}
</script>

<section class="space-y-3" data-testid="tier-not-set">
	<p class="text-sm text-muted-foreground">
		A student needs a tier before their marks can go in and before they can have a report.
	</p>
	{#if students.length === 0}
		<p class="rounded-xl border px-3 py-6 text-sm text-muted-foreground">
			Every student has a tier.
		</p>
	{:else}
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-xs text-muted-foreground">
				{chosen.length > 0
					? `${chosen.length} selected`
					: 'Select students to move several at once'}
			</span>
			{#each [0, 1] as const as tier (tier)}
				<Button
					size="xs"
					variant="outline"
					disabled={chosen.length === 0}
					onclick={() => moveChosen(tier)}
				>
					Move to Tier {tier + 1}
				</Button>
			{/each}
		</div>
		<div class="w-fit overflow-hidden rounded-xl border">
			<Table.Root class="text-sm">
				<Table.Header>
					<Table.Row class="hover:bg-transparent">
						<Table.Head class="w-10 px-2">
							<Checkbox
								checked={allChosen}
								indeterminate={chosen.length > 0 && !allChosen}
								onCheckedChange={(on) => (selected = on === true ? students.map((s) => s.id) : [])}
								aria-label="Select all"
							/>
						</Table.Head>
						<Table.Head class="px-2 text-left text-xs">Student</Table.Head>
						<Table.Head class="px-2 text-left text-xs" colspan={2}>Tier</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each students as student (student.id)}
						{@const name = studentName(student)}
						<Table.Row
							class="hover:bg-transparent"
							data-testid="unset-row"
							data-student-id={student.id}
						>
							<Table.Cell class="px-2 py-1">
								<Checkbox
									checked={chosen.includes(student.id)}
									onCheckedChange={(on) => toggle(student.id, on === true)}
									aria-label={`Select ${name}`}
								/>
							</Table.Cell>
							<Table.Cell class="px-2 py-1">
								<span class="flex items-center gap-2">
									<span data-testid="student-name" class="truncate">{name}</span>
									<OffTierBadge {student} />
								</span>
							</Table.Cell>
							{#each [0, 1] as const as tier (tier)}
								<Table.Cell class="px-1 py-1">
									<Button size="xs" variant="outline" onclick={() => assign(student.id, tier)}>
										{tierLabel(document, tier)}
									</Button>
								</Table.Cell>
							{/each}
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	{/if}
</section>
