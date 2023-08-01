<script lang="ts">
	import Post from '$lib/components/Post.svelte';
	import type { Post as PostType } from '$lib/types';
	import { isMobile } from '$lib/store';
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import IntersectionObserver from './IntersectionObserver.svelte';
	import { deserialize } from '$app/forms';

	export let posts: PostType[];
	export let shouldLoadMore = false;
	export let loadReplies = false; // maybe use a context? idk
	export let scrollToNew = false;

	let alreadyScrolled = false;
	let currentPage = 0;
	let listElement: HTMLDivElement;

	$: if (posts) {
		scrollToBottom(listElement);
	}
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
			// @ts-ignore
			if (data.status === 200 && data.data) {
				// @ts-ignore
				posts = [...posts, ...data.data.posts];
			}
		}
	}
</script>

<div class="posts" data-mobile={$isMobile} bind:this={listElement}>
	{#each posts as post, i}
		<div
			tabindex="0"
			role="button"
			aria-pressed="false"
			on:keypress={() => {
				goto(`/@${post.user.username}/${post.id}`);
			}}
			on:click|preventDefault={(e) => {
				// allow dragging to select text

				const selection = getSelection();
				if (selection && selection.type === 'Range') return;
				// if (e.target && e.target.matches('a')) return;
				goto(`/@${post.user.username}/${post.id}`);
			}}
			class="post-wrapper"
		>
			{#if i === posts.length - 1 && shouldLoadMore}
				<IntersectionObserver once let:intersecting>
					<Post {loadReplies} {post} />
					{#if intersecting}
						{#await loadMore()}
							Loading...
						{/await}
					{/if}
				</IntersectionObserver>
			{:else}
				<Post {loadReplies} {post} />
			{/if}
		</div>
	{/each}
</div>

<style lang="scss">
	@import 'src/variables.scss';

	.posts {
		display: flex;
		flex-direction: column;

		.post-wrapper {
			color: unset;
			text-decoration: none;
			border-radius: 5px;
			cursor: pointer;
			padding: 10px;
			display: block;
			-webkit-tap-highlight-color: transparent;
		}
	}

	.posts[data-mobile='false'] {
		.post-wrapper:hover {
			background-color: black;
		}
	}
</style>
