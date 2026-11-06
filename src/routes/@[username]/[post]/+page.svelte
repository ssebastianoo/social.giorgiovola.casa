<script lang="ts">
	import Post from '#lib/components/Post.svelte';
	import type { Post as PostType } from '#lib/types.js';
	import type { PageData } from './$types';
	import Posts from '#lib/components/Posts.svelte';
	import PostComposer from '#lib/components/PostComposer.svelte';
	import { user } from '#lib/store.js';
	import LoadingScreen from '#lib/components/LoadingScreen.svelte';
	import { onMount } from 'svelte';
	import { onRealtime } from '#lib/realtime.js';

	export let data: PageData;

	let replies: PostType[] = [];
	let getReplies: () => Promise<void>;

	// we need a reactive block because server promises are not reactive and
	// navigation from one post to another will not update the replies
	$: {
		getReplies = async () => {
			replies = await data.streamed.replies;
		};
	}

	onMount(() =>
		onRealtime('post', (post) => {
			if (post.reply_to?.id !== data.post.id || replies.some((r) => r.id === post.id)) return;
			replies = [...replies, post];
		})
	);

	function onCreated(post: PostType) {
		if (!replies.some((r) => r.id === post.id)) replies = [...replies, post];
	}
</script>

<Post post={data.post} showReplyTo={true} isPostOpen={true} loadReplies={false} />

{#await getReplies()}
	<div class="mt-5 flex items-center justify-center">
		<LoadingScreen size={64} />
	</div>
{:then}
	<div class="mt-5">
		{#if $user}
			<PostComposer replyTo={data.post.id} oncreated={onCreated} />
		{/if}
		<Posts scrollToNew={true} loadReplies={true} replies={true} posts={replies} />
	</div>
{/await}
