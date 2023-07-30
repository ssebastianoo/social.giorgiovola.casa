<script lang="ts">
	import '../style.scss';
	import { onMount } from 'svelte';
	import Header from '$lib/components/Header.svelte';
	import type { LayoutData } from './$types';
	import { user, isMobile } from '$lib/store';
	import { page } from '$app/stores';

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
<svelte:head>
	{#if $page.route.id === '/@[username]/[post]'}
		<!-- Primary Meta Tags -->
		<title>{`${$page.data.post.user.name} : "${$page.data.post.content}"`}</title>
		<meta name="title" content={`${$page.data.post.user.name} on social.giorgiovola.casa`} />
		<meta name="description" content={$page.data.post.content} />

		<!-- Open Graph / Facebook -->
		<meta property="og:type" content="article" />
		<meta property="og:url" content={$page.url.toString()} />
		<meta
			property="og:title"
			content={`${$page.data.post.user.name} : "${$page.data.post.content}"`}
		/>
		<meta property="og:description" content={$page.data.post.content} />
		<meta property="og:image" content={$page.url.toString() + '/image.png'} />
		<meta property="og:profile:username" content={$page.data.post.user.username} />
		<meta property="og:article:published_time" content={$page.data.post.created_at.toISOString()} />

		<!-- Twitter -->
		<meta property="twitter:card" content="summary_large_image" />
		<meta property="twitter:url" content={$page.url.toString()} />
		<meta
			property="twitter:title"
			content={`${$page.data.post.user.name} on social.giorgiovola.casa`}
		/>
		<meta property="twitter:description" content={$page.data.post.content} />
		<meta property="twitter:image" content={$page.url.toString() + '/image.png'} />
	{:else}
		<!-- Primary Meta Tags -->
		<title>Social Giorgiovola Casa</title>
		<meta name="title" content="Social Giorgiovola Casa" />
		<meta
			name="description"
			content="Imagine a new way of thinking the social networking world. u got it? this isn't it, bye."
		/>

		<!-- Open Graph / Facebook -->
		<meta property="og:type" content="website" />
		<meta property="og:url" content="https://social.giorgiovola.casa/" />
		<meta property="og:title" content="Social Giorgiovola Casa" />
		<meta
			property="og:description"
			content="Imagine a new way of thinking the social networking world. u got it? this isn't it, bye."
		/>
		<meta property="og:image" content="/OpenGraph.png" />

		<!-- Twitter -->
		<meta property="twitter:url" content="https://social.giorgiovola.casa/" />
		<meta property="twitter:title" content="Social Giorgiovola Casa" />
		<meta
			property="twitter:description"
			content="Imagine a new way of thinking the social networking world. u got it? this isn't it, bye."
		/>
		<meta property="twitter:image" content="/OpenGraph.png" />
	{/if}
</svelte:head>
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
