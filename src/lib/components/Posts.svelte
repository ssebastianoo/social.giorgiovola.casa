<script lang="ts">
	import Post from '$lib/components/Post.svelte';
	import type { Post as PostType } from '$lib/types';
	import { isMobile } from '$lib/store';

	export let posts: PostType[];
</script>

<div class="posts" data-mobile={$isMobile}>
	{#each posts as post}
		<a href={`/@${post.user.username}/${post.id}`} class="post-wrapper">
			<Post {post} />
		</a>
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
