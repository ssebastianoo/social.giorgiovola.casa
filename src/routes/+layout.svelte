<script lang="ts">
	import '../style.scss';
	import { onMount } from 'svelte';
	import Header from '$lib/components/Header.svelte';
	import type { LayoutData } from './$types';
	import { user, isMobile } from '$lib/store';

	export let data: LayoutData;
	$user = data.user;

	onMount(async () => {
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register('/sw.js');
		}

		if ('ontouchstart' in document.documentElement || navigator.maxTouchPoints > 0) {
			$isMobile = true;
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
