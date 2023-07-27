<script lang="ts">
	import { user } from '$lib/store';
	import type { Post as PostType } from './types';
	import Post from './Post.svelte';

	export let posts: PostType[];

	async function deletePost(id: number) {
		await fetch('/api/posts', {
			method: 'DELETE',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				id
			})
		});
		posts = posts.filter((post) => post.id !== id);
	}
</script>

<div class="posts">
	{#each posts as post}
		<Post {post} />
	{/each}
</div>

<style lang="scss">
	@import 'src/variables.scss';

	.posts {
		display: flex;
		flex-direction: column;
	}
</style>
