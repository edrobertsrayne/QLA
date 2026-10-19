<!-- PROTOTYPE — what the band letters mean, for the student reading the page. -->
<script lang="ts">
	import BandMark from './BandMark.svelte';
</script>

<p class="flex items-center gap-3 text-[7pt] text-neutral-600">
	<span class="flex items-center gap-1"><BandMark band="green" /> 70% or more</span>
	<span class="flex items-center gap-1"><BandMark band="amber" /> 40–69%</span>
	<span class="flex items-center gap-1"><BandMark band="red" /> below 40%</span>
</p>
