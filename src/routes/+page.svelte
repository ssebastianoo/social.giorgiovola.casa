<script lang="ts">
	import type { PageServerData } from './$types';
	import Posts from '#lib/components/Posts.svelte';
	import PostComposer from '#lib/components/PostComposer.svelte';
	import type { Post } from '#lib/types.js';
	import { user } from '#lib/store.js';
	import { onMount } from 'svelte';
	import { onRealtime } from '#lib/realtime.js';

	export let data: PageServerData;

	// new top level posts from anyone; own posts may already be in the list
	onMount(() =>
		onRealtime('post', (post) => {
			if (post.reply_to || data.posts.some((p) => p.id === post.id)) return;
			data.posts = [post, ...data.posts];
		})
	);

	function onCreated(e: CustomEvent<Post>) {
		const post = e.detail;
		if (!data.posts.some((p) => p.id === post.id)) data.posts = [post, ...data.posts];
	}
</script>

{#if $user}
	<PostComposer on:created={onCreated} />
{:else}
	<form class="mb-5 flex">
		<input class="input" type="text" placeholder="Log in to post" disabled />
	</form>
{/if}

<Posts shouldLoadMore posts={data.posts} />
