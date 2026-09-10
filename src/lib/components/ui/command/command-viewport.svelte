<script lang="ts">
	import { Command as CommandPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: CommandPrimitive.ViewportProps = $props();
</script>

<CommandPrimitive.Viewport
	bind:ref
	data-slot="command-viewport"
	class={cn(className)}
	{...restProps}
>
	{@render children?.()}
</CommandPrimitive.Viewport>
