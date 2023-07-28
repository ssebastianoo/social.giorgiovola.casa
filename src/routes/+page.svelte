<script lang="ts">
	import type { PageServerData } from './$types';
	import Posts from '$lib/components/Posts.svelte';
	import { user } from '$lib/store';

	export let data: PageServerData;
	let error: string | null = null;

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
			} else {
				if (res.status === 429) {
					error = 'Slow down, you can only post once every 20 seconds';
				} else {
					error = 'Something went wrong.';
				}
				setTimeout(() => {
					error = null;
				}, 3000);
			}
		}
	}
</script>

{#if error}
	<div class="error">
		<p>{error}</p>
	</div>
{/if}

{#if $user}
	<form class="create-post" on:submit|preventDefault={createPost}>
		<input type="text" name="content" required placeholder="twitter sucks" />
		<input type="submit" value="Post" />
	</form>
{:else}
	<form class="create-post">
		<input type="text" placeholder="Log in to post" disabled />
	</form>
{/if}

<Posts {posts} />

<style lang="scss">
	@import '/src/variables';

	.error {
		background-color: $color4;
		padding: 10px;
		border-radius: 5px;
		margin-bottom: 20px;
	}

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
