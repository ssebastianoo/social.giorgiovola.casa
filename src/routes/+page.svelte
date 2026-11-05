<script lang="ts">
	import type { PageProps } from './$types';
	import Posts from '#lib/components/Posts.svelte';
	import PostComposer from '#lib/components/PostComposer.svelte';
	import type { Post } from '#lib/types.js';
	import { user } from '#lib/store.js';
	import { onMount } from 'svelte';
	import { onRealtime } from '#lib/realtime.js';

	let { data }: PageProps = $props();

	// writable derived: reset on navigation (feed switch), prepended to by realtime posts
	let posts = $derived(data.posts);

	// the following feed only shows posts by followed profiles and our own
	function belongs(post: Post) {
		if (data.feed !== 'following') return true;
		return post.user.username === $user?.username || !!data.following?.includes(post.user.username);
	}

	function add(post: Post) {
		if (post.reply_to || !belongs(post) || posts.some((p) => p.id === post.id)) return;
		posts = [post, ...posts];
	}

	onMount(() => onRealtime('post', add));

	const tabClass = (active: boolean) =>
		`flex-1 border-b-2 p-2.5 text-center text-foreground hover:no-underline ${
			active ? 'border-accent' : 'border-transparent opacity-60 hover:opacity-100'
		}`;
</script>

{#if $user}
	<nav class="mb-5 flex">
		<a
			class={tabClass(data.feed === 'all')}
			href="/?feed=all"
			aria-current={data.feed === 'all' ? 'page' : undefined}>All</a
		>
		<a
			class={tabClass(data.feed === 'following')}
			href="/?feed=following"
			aria-current={data.feed === 'following' ? 'page' : undefined}>Following</a
		>
	</nav>
	<PostComposer on:created={(e: CustomEvent<Post>) => add(e.detail)} />
{:else}
	<form class="mb-5 flex">
		<input class="input" type="text" placeholder="Log in to post" disabled />
	</form>
{/if}

{#if data.feed === 'following' && posts.length === 0}
	<p class="text-center text-muted">
		Nothing here yet. Follow people from their profile to see their posts.
	</p>
{/if}

{#key data.feed}
	<Posts shouldLoadMore {posts} />
{/key}
