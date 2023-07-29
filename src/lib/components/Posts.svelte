<script lang="ts">
	import Post from '$lib/components/Post.svelte';
	import type { Post as PostType } from '$lib/types';
	export let posts: PostType[];
</script>

<div class="posts">
	{#each posts as post}
		<a href={`/@${post.user.username}/${post.id}`} class="post-wrapper">
			<Post {post} />
		</a>
	{/each}
</div>

<style lang="scss">
	@import 'src/variables.scss';

	.post-wrapper {
		color: unset;
		text-decoration: none;
		border-radius: 5px;
		padding: 10px;
		display: block;

		&:hover {
			background-color: black;
		}
	}

	.posts {
		display: flex;
		flex-direction: column;
	}
</style>
