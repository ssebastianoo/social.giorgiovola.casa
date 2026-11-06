<script lang="ts">
	import Post from '#lib/components/Post.svelte';
	import type { Post as PostType } from '#lib/types.js';
	import { tick } from 'svelte';
	import IntersectionObserver from './IntersectionObserver.svelte';
	import { deserialize } from '$app/forms';
	import { onMount } from 'svelte';
	import { onRealtime } from '#lib/realtime.js';

	export let posts: PostType[];
	export let shouldLoadMore = false;
	export let loadReplies = false; // maybe use a context? idk
	export let scrollToNew = false;
	export let replies = false;
	export let showThread = false;

	let alreadyScrolled = false;
	let currentPage = 0;
	let listElement: HTMLDivElement;

	$: if (posts) {
		scrollToBottom(listElement);
	}

	onMount(() =>
		onRealtime('post_deleted', ({ id }) => {
			if (posts.some((p) => p.id === id)) posts = posts.filter((p) => p.id !== id);
		})
	);

	const handleDeletedPost = (id: number) => {
		posts = posts.filter((post) => post.id !== id);
	};

	const scrollToBottom = async (node: HTMLDivElement) => {
		if (!scrollToNew) return;
		if (!node) return;
		if (!alreadyScrolled) {
			alreadyScrolled = true;
			return;
		}
		await tick(); // wait for DOM to update
		scroll({ top: node.scrollHeight, behavior: 'smooth' });
	};

	async function loadMore() {
		currentPage++;
		const formData = new FormData();
		formData.set('currentPage', currentPage.toString());
		const res = await fetch('', {
			method: 'POST',
			body: formData
		});
		if (res.ok) {
			const data = deserialize(await res.text());
			// @ts-ignore deserialize() result is untyped
			if (data.status === 200 && data.data) {
				// @ts-ignore deserialize() result is untyped
				posts = [...posts, ...data.data.posts];
			}
		}
	}
</script>

<div class="flex flex-col" bind:this={listElement} data-replies={replies}>
	{#each posts as post, i}
		{#if i === posts.length - 1 && shouldLoadMore}
			<IntersectionObserver once let:intersecting>
				<Post onpostdeleted={handleDeletedPost} {loadReplies} {post} {showThread} />
				{#if intersecting}
					{#await loadMore()}
						Loading...
					{/await}
				{/if}
			</IntersectionObserver>
		{:else}
			<Post onpostdeleted={handleDeletedPost} {loadReplies} {post} {showThread} />
		{/if}
	{/each}
</div>
