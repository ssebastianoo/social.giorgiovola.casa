<script lang="ts">
	import type { PageServerData } from './$types';
	import Posts from '#lib/components/Posts.svelte';
	import { user } from '#lib/store.js';
	import { onMount } from 'svelte';
	import { onRealtime } from '#lib/realtime.js';
	import MentionInput from '#lib/components/MentionInput.svelte';

	export let data: PageServerData;
	let error: string | null = null;
	let content = '';

	// new top level posts from anyone; own posts may already be in the list
	onMount(() =>
		onRealtime('post', (post) => {
			if (post.reply_to || data.posts.some((p) => p.id === post.id)) return;
			data.posts = [post, ...data.posts];
		})
	);

	async function createPost() {
		if (content.trim()) {
			const res = await fetch('/api/posts', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ content })
			});
			if (res.ok) {
				const post = await res.json();
				if (!data.posts.some((p) => p.id === post.id)) data.posts = [post, ...data.posts];
				content = '';
			} else {
				error = res.status === 400 ? await res.text() : 'Something went wrong.';
				setTimeout(() => {
					error = null;
				}, 3000);
			}
		}
	}
</script>

{#if error}
	<div class="mb-5 rounded-[5px] bg-danger p-2.5">
		<p>{error}</p>
	</div>
{/if}

{#if $user}
	<form class="mb-5 flex" on:submit|preventDefault={createPost}>
		<MentionInput bind:value={content} required placeholder="twitter sucks" />
		<button
			type="submit"
			class="flex cursor-pointer items-end border-b border-foreground p-2.5 outline-none"
			><svg fill="#d9d9d9" xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 512 512"
				><!--! Font Awesome Free 6.4.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2023 Fonticons, Inc. --><path
					d="M16.1 260.2c-22.6 12.9-20.5 47.3 3.6 57.3L160 376V479.3c0 18.1 14.6 32.7 32.7 32.7c9.7 0 18.9-4.3 25.1-11.8l62-74.3 123.9 51.6c18.9 7.9 40.8-4.5 43.9-24.7l64-416c1.9-12.1-3.4-24.3-13.5-31.2s-23.3-7.5-34-1.4l-448 256zm52.1 25.5L409.7 90.6 190.1 336l1.2 1L68.2 285.7zM403.3 425.4L236.7 355.9 450.8 116.6 403.3 425.4z"
				/></svg
			></button
		>
	</form>
{:else}
	<form class="mb-5 flex">
		<input class="input" type="text" placeholder="Log in to post" disabled />
	</form>
{/if}

<Posts shouldLoadMore posts={data.posts} />
