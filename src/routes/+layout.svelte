<script lang="ts">
	import '../style.scss';
	import { user } from '$lib/store';
	import { onMount } from 'svelte';
	import Header from '$lib/components/Header.svelte';

	onMount(async () => {
		const res = await fetch('/api/getUser');
		const data = await res.json();

		if (data.logged) {
			$user = data.user;
		}
	});
</script>

<Header />
<main>
	<div class="container">
		<slot />
	</div>
</main>

<style>
	main {
		display: flex;
		justify-content: center;
		margin-top: 80px;
	}

	.container {
		padding: 20px;
		width: 100%;
		max-width: 600px;
	}
</style>
