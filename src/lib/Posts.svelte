<script lang="ts">
	import type { Post } from '$lib/types';
	import { user } from '$lib/store';

	export let posts: Post[];
</script>

<div class="posts">
	{#each posts as post}
		<div class="post">
			<p>by <a href={'/@' + post.user.username}>@{post.user.username}</a></p>
			{#if $user && $user.username === post.user.username}
				<button
					on:click={async () => {
						await fetch('/api/posts', {
							method: 'DELETE',
							headers: {
								'Content-Type': 'application/json'
							},
							body: JSON.stringify({
								id: post.id
							})
						});
						posts = posts.filter((p) => p.id !== post.id);
					}}>Delete</button
				>
			{/if}
			<div class="content">
				<p>{post.content}</p>
			</div>
		</div>
	{/each}
</div>

<style lang="scss">
	.posts {
		display: flex;
		flex-direction: column;
		gap: 10px;

		.post {
			border: 1px solid #ccc;
			padding: 10px;
		}
	}
</style>
