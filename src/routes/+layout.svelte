<script lang="ts">
	import '../style.scss';
	import { user } from '$lib/store';
	import type { User } from '$lib/types';
	import { onMount } from 'svelte';
	import Auth from '$lib/Auth.svelte';
	// import '../styles.scss';

	onMount(async () => {
		const res = await fetch('/api/getUser');
		const data = await res.json();

		if (data.logged) {
			$user = data.user;
		}
	});
</script>

<Auth />
<div class="container">
	<slot />
</div>

<style>
	.container {
		padding: 20px;
	}
</style>
