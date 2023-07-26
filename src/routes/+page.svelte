<script lang="ts">
	import type { PageServerData } from './$types';
	import Posts from '$lib/Posts.svelte';
	import { user } from '$lib/store';

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

{#if $user}
	<form class="create-post" on:submit|preventDefault={createPost}>
		<textarea name="content" required placeholder="twitter sucks" />
		<input type="submit" value="create post" />
	</form>
{:else}
	<p>Login to post</p>
{/if}

<Posts {posts} />

<style lang="scss">
</style>
