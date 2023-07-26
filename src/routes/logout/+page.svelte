<script lang="ts">
	import { user } from '$lib/store';
	import { onMount } from 'svelte';

	onMount(() => {
		$user = null;
		location.href = '/';
	});
</script>
