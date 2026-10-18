<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import AppNav from '$lib/components/shell/AppNav.svelte';
	import StatusBar from '$lib/components/shell/StatusBar.svelte';
	import { Toaster } from '$lib/components/ui/sonner';
	import { ModeWatcher } from 'mode-watcher';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<ModeWatcher />
<AppNav />
{@render children()}
<StatusBar />
<!-- Toasts rise above the status bar rather than sitting under it, on a narrow
	window as much as a wide one. -->
<Toaster
	position="bottom-center"
	offset={{ bottom: 'calc(var(--status-bar-height) + 0.75rem)' }}
	mobileOffset={{ bottom: 'calc(var(--status-bar-height) + 0.5rem)' }}
/>
