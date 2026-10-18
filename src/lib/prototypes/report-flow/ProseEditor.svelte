<!-- PROTOTYPE — the report's prose as form fields: what went well, even better if, revert. -->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { reportFlow } from './flow.svelte.js';

	let { studentId }: { studentId: string } = $props();
	const flow = reportFlow();
	const report = $derived(flow.reports[studentId]);
	const prose = $derived(flow.prose(studentId));
</script>

{#if prose}
	<div class="space-y-3">
		{#if report?.stale}
			<p class="rounded border border-amber-400 bg-amber-400/15 p-2 text-xs">
				Marks or topic names changed since this was written. The figures on the sheet are current;
				the feedback below may not be.
			</p>
		{/if}
		<div class="space-y-1">
			<h4 class="text-sm font-medium">What went well</h4>
			{#each prose.wentWell as text, i (i)}
				<Textarea
					class="min-h-0 text-sm"
					value={text}
					oninput={(e) => flow.edit(studentId, (p) => (p.wentWell[i] = e.currentTarget.value))}
				/>
			{/each}
		</div>
		<div class="space-y-1">
			<h4 class="text-sm font-medium">Even better if</h4>
			{#each prose.evenBetterIf as target, i (i)}
				<p class="text-xs text-muted-foreground">{target.topic}</p>
				<Textarea
					class="min-h-0 text-sm"
					value={target.text}
					oninput={(e) =>
						flow.edit(studentId, (p) => (p.evenBetterIf[i].text = e.currentTarget.value))}
				/>
			{/each}
		</div>
		<p class="flex items-center gap-2 text-xs text-muted-foreground">
			{#if report?.edited}
				Your edits are kept.
				<Button variant="link" size="xs" class="h-auto p-0" onclick={() => flow.revert(studentId)}>
					Revert to what was generated
				</Button>
			{:else}
				As generated {report?.generatedAt?.toLocaleTimeString()}. Type to edit; nothing needs
				approving.
			{/if}
		</p>
	</div>
{/if}
