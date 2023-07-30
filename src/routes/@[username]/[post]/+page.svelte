<script lang="ts">
	import Post from '$lib/components/Post.svelte';
	import type { Post as PostType } from '$lib/types';
	import type { PageData } from './$types';
	import Posts from '$lib/components/Posts.svelte';
	import Loading from '$lib/components/Loading.svelte';

	export let data: PageData;

	let replies: PostType[] = [];
	let error: string | null = null;
	let getReplies: () => Promise<void>;

	// we need a reactive block because server promises are not reactive and
	// navigation from one post to another will not update the replies
	$: {
		getReplies = async () => {
			replies = await data.streamed.replies;
		};
	}

	async function createPost(e: Event) {
		const target = e.target as HTMLFormElement;
		const content = target.content.value;

		if (content) {
			const res = await fetch('/api/posts', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					content,
					reply_to: data.post.id
				})
			});
			if (res.ok) {
				const post = await res.json();
				replies = [post, ...replies];
				target.content.value = '';
			} else {
				if (res.status === 429) {
					error = 'Slow down, you can only post once every 5 seconds';
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

<Post post={data.post} />

{#await getReplies()}
	<div class="loading">
		<Loading />
	</div>
{:then}
	<div class="replies-wrapper">
		{#if error}
			<div class="error">
				<p>{error}</p>
			</div>
		{/if}

		<form class="create-post" on:submit|preventDefault={createPost}>
			<input
				class="input"
				type="text"
				name="content"
				required
				placeholder="twitter sucks"
				autocomplete="off"
			/>
			<button type="submit" class="send"
				><svg fill="#d9d9d9" xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 512 512"
					><!--! Font Awesome Free 6.4.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2023 Fonticons, Inc. --><path
						d="M16.1 260.2c-22.6 12.9-20.5 47.3 3.6 57.3L160 376V479.3c0 18.1 14.6 32.7 32.7 32.7c9.7 0 18.9-4.3 25.1-11.8l62-74.3 123.9 51.6c18.9 7.9 40.8-4.5 43.9-24.7l64-416c1.9-12.1-3.4-24.3-13.5-31.2s-23.3-7.5-34-1.4l-448 256zm52.1 25.5L409.7 90.6 190.1 336l1.2 1L68.2 285.7zM403.3 425.4L236.7 355.9 450.8 116.6 403.3 425.4z"
					/></svg
				></button
			>
		</form>
		<Posts loadReplies={true} posts={replies} />
	</div>
{/await}

<style lang="scss">
	@import '/src/variables';

	.loading {
		display: flex;
		justify-content: center;
		align-items: center;
		margin-top: 20px;
	}

	.replies-wrapper {
		margin-top: 20px;
	}
	.error {
		background-color: $color4;
		padding: 10px;
		border-radius: 5px;
		margin-bottom: 20px;
	}
</style>
