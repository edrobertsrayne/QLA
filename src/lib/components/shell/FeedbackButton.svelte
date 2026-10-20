<!--
	Floating feedback button: files what the teacher types as a GitHub issue.
	Shown only when the server has a GitHub token configured.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import MessageSquarePlusIcon from '@lucide/svelte/icons/message-square-plus';
	import { toast } from 'svelte-sonner';
	import { failureFrom } from '$lib/api-error.js';
	import { FEEDBACK_MAX_CHARS, isFiledIssue } from '$lib/feedback';
	import { isRecord } from '$lib/parse/is-breakdown.js';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import * as Popover from '$lib/components/ui/popover';
	import { Textarea } from '$lib/components/ui/textarea';

	let enabled = $state(false);
	let open = $state(false);
	let text = $state('');
	let phase = $state<'idle' | 'sending'>('idle');

	onMount(() => {
		fetch('/api/feedback')
			.then(async (response) => {
				if (!response.ok) return;
				const body: unknown = await response.json();
				if (isRecord(body) && body.enabled === true) enabled = true;
			})
			.catch(() => {
				// Treated as disabled.
			});
	});

	async function send() {
		if (phase === 'sending' || text.trim() === '') return;
		phase = 'sending';
		try {
			const response = await fetch('/api/feedback', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text, page: window.location.pathname })
			});
			const issue: unknown = response.ok ? await response.json() : null;
			if (isFiledIssue(issue)) {
				toast.success(`Feedback sent as issue #${issue.number}`, {
					action: { label: 'Open', onClick: () => window.open(issue.url, '_blank', 'noopener') }
				});
				text = '';
				open = false;
			} else {
				const failure = await failureFrom(response, 'Feedback could not be sent.');
				toast.error(failure.message);
			}
		} catch {
			toast.error('Feedback could not be sent.');
		} finally {
			phase = 'idle';
		}
	}
</script>

{#if enabled}
	<Popover.Root bind:open>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					size="icon"
					class="fixed right-4 bottom-[calc(var(--status-bar-height)+1rem)] z-40 size-12 rounded-full shadow-lg"
					aria-label="Send feedback"
				>
					<MessageSquarePlusIcon />
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content side="top" align="end" class="w-80">
			<form
				class="flex flex-col gap-2"
				onsubmit={(e) => {
					e.preventDefault();
					send();
				}}
			>
				<Label for="feedback-text">Feedback</Label>
				<Textarea
					id="feedback-text"
					bind:value={text}
					rows={5}
					maxlength={FEEDBACK_MAX_CHARS}
					placeholder="What did you notice?"
					onkeydown={(e) => {
						if ((e.ctrlKey || e.metaKey) && e.key === 'Enter')
							e.currentTarget.form?.requestSubmit();
					}}
				/>
				<Button type="submit" disabled={phase === 'sending' || text.trim() === ''}>
					{phase === 'sending' ? 'Sending…' : 'Send'}
				</Button>
			</form>
		</Popover.Content>
	</Popover.Root>
{/if}
