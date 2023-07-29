<script lang="ts">
	import Post from '$lib/components/Post.svelte';
	import type { Post as PostType } from '$lib/types';
	import { isMobile } from '$lib/store';
	import { goto } from '$app/navigation';

	export let posts: PostType[];
</script>

<div class="posts" data-mobile={$isMobile}>
	{#each posts as post}
		<div
			tabindex="0"
			role="button"
			aria-pressed="false"
			on:keypress={() => {
				goto(`/@${post.user.username}/${post.id}`);
			}}
			on:click|preventDefault={() => {
				// allow dragging to select text
				const selection = getSelection();
				console.log(selection);
				if (selection && selection.type === 'Range') return;
				goto(`/@${post.user.username}/${post.id}`);
			}}
			class="post-wrapper"
		>
			<Post {post} />
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
