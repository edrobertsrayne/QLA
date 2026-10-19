<!--
	PROTOTYPE — the straight question table chosen from variant C: one row per entry,
	label · summary · marks · band, a rule between questions. `split` lays it out as
	two tables side by side, breaking at the question nearest half the rows.
-->
<script lang="ts">
	import BandMark from './BandMark.svelte';
	import type { QuestionGroup, ReportFigures } from './sample.js';

	let {
		report: r,
		split = false,
		wrap = false,
		class: className = ''
	}: { report: ReportFigures; split?: boolean; wrap?: boolean; class?: string } = $props();

	const halves = $derived.by((): QuestionGroup[][] => {
		if (!split) return [r.questions];
		const rows = r.questions.reduce((n, q) => n + q.entries.length, 0);
		let seen = 0;
		let cut = r.questions.length;
		for (const [i, q] of r.questions.entries()) {
			if (seen + q.entries.length / 2 > rows / 2) {
				cut = i;
				break;
			}
			seen += q.entries.length;
		}
		return [r.questions.slice(0, cut), r.questions.slice(cut)];
	});
</script>

<div class="grid gap-5 {split ? 'grid-cols-2' : ''} {className}">
	{#each halves as questions, h (h)}
		<table class="w-full self-start leading-[1.3]">
			<thead>
				<tr class="border-b border-black text-left">
					<th class="w-[3.2em]">Q</th>
					<th></th>
					<th class="w-[3.4em] text-right">Marks</th>
					<th class="w-[1.6em]"></th>
				</tr>
			</thead>
			{#each questions as q (q.questionNumber)}
				<tbody class="border-b border-neutral-400">
					{#each q.entries as e (e.id)}
						<tr>
							<td class="align-top font-medium">{e.label}</td>
							<td class={wrap ? 'pr-1 align-top' : 'max-w-0 truncate'}>{e.summary}</td>
							<td class="text-right align-top tabular-nums">{e.gained}/{e.available}</td>
							<td class="pl-1 align-top"><BandMark band={e.band} /></td>
						</tr>
					{/each}
				</tbody>
			{/each}
		</table>
	{/each}
</div>
