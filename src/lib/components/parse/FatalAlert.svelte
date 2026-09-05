<script lang="ts">
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import OctagonXIcon from '@lucide/svelte/icons/octagon-x';
	import type { FatalError } from './types.js';

	interface Props {
		fatal: FatalError;
		retryable: boolean;
	}

	let { fatal, retryable }: Props = $props();
</script>

<Alert variant="destructive" data-testid="fatal-panel" aria-live="polite">
	<OctagonXIcon />
	<AlertTitle>Run failed ({fatal.code})</AlertTitle>
	<AlertDescription>
		<p>{fatal.message}</p>
		{#if retryable}
			<p class="mt-1">This looks temporary — please try again.</p>
		{:else if fatal.code === 'MISSING_API_KEY'}
			<p class="mt-1">
				The problem is server-side, not with your inputs. Contact whoever runs this page.
			</p>
		{:else}
			<p class="mt-1">
				Check your inputs — the assessment paper and/or markscheme PDF — then try again.
			</p>
		{/if}
	</AlertDescription>
</Alert>
