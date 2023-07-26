<script lang="ts">
	import type { PageServerData } from './$types';
	import Posts from '$lib/Posts.svelte';

	export let data: PageServerData;
	$: posts = data.posts;

	async function createPost(e: Event) {
		const target = e.target as HTMLFormElement;
		const content = target.content.value;

		if (content) {
			const res = await fetch('/api/posts', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ content })
			});
			if (res.ok) {
				const post = await res.json();
				posts = [post, ...posts];
				target.content.value = '';
			}
		}
	}
</script>

<form class="create-post" on:submit|preventDefault={createPost}>
	<textarea name="content" required placeholder="twitter sucks" />
	<input type="submit" value="create post" />
</form>

<Posts {posts} />

<style lang="scss">
</style>
