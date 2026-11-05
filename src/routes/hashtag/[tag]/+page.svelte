<script lang="ts">
	import type { PageProps } from './$types';
	import Posts from '#lib/components/Posts.svelte';
	import type { Post } from '#lib/types.js';
	import { extractHashtags } from '#lib/hashtags.js';
	import { onRealtime } from '#lib/realtime.js';

	let { data }: PageProps = $props();

	// writable deriveds: reset when the tag changes, bumped by realtime posts
	let posts = $derived(data.posts);
	let count = $derived(data.count);

	const nf = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

	$effect(() =>
		onRealtime('post', (post: Post) => {
			if (posts.some((p) => p.id === post.id)) return;
			if (!extractHashtags(post.content).includes(data.tag)) return;
			posts = [post, ...posts];
			count++;
		})
	);
</script>

<div class="mb-5 flex flex-col gap-[5px]">
	<h2 class="wrap-anywhere">#{data.tag}</h2>
	<p class="text-[0.85em] text-muted">
		{nf.format(count)}
		{count === 1 ? 'post' : 'posts'}
	</p>
</div>

{#if posts.length === 0}
	<p class="text-muted">No posts with #{data.tag} yet.</p>
{/if}

{#key data.tag}
	<Posts shouldLoadMore {posts} />
{/key}
