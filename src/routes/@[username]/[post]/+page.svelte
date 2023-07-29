<script lang="ts">
	import Post from '$lib/components/Post.svelte';
	import type { Post as PostType } from '$lib/types';
	import type { PageData } from './$types';
	import Posts from '$lib/components/Posts.svelte';
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

<Post post={data.post} />
{#await getReplies()}
	Loading
{:then}
	<form class="create-post" on:submit|preventDefault={createPost}>
		<input type="text" name="content" required placeholder="post reply" autocomplete="off" />
		<input type="submit" value="Post" />
	</form>
	<Posts posts={replies} />
{:catch error}
	{error}
{/await}

<style lang="scss">
	.create-post {
		display: flex;
		gap: 10px;
		margin-bottom: 20px;
		margin-top: 20px;

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
