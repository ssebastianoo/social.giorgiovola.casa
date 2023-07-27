<script lang="ts">
	import { user } from '$lib/store';
	import type { Post as PostType } from '$lib/types';
	import Post from '$lib/components/Post.svelte';

	export let posts: PostType[];
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
