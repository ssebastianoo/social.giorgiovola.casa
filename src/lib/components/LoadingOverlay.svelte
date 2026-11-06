<script lang="ts">
	import { fade } from 'svelte/transition';
	import LoadingScreen from '#lib/components/LoadingScreen.svelte';
</script>

<!-- above the header (z-999); blocks clicks while it shows -->
<div
	class="fixed inset-0 z-1000 flex items-center justify-center bg-black/40 backdrop-blur-md"
	transition:fade={{ duration: 150 }}
>
	<LoadingScreen size={200} class="max-w-[60vw]" />
</div>
