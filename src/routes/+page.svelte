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
		<input type="text" name="content" required placeholder="twitter sucks" />
		<input type="submit" value="Post" />
	</form>
{:else}
	<p>Login to post</p>
{/if}

<Posts {posts} />

<style lang="scss">
	.create-post {
		display: flex;
		gap: 10px;
		margin-bottom: 20px;

		input {
			all: unset;
			height: 25px;
			width: 100%;
			background-color: rgba(0, 0, 0, 0.35);
			padding: 10px;
			border-radius: 5px;
		}

		input[type='submit'] {
			all: unset;
			background-color: rgba(0, 0, 0, 0.35);
			padding: 10px;
			border-radius: 5px;
			cursor: pointer;
		}
	}
</style>
