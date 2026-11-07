<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidate } from '$app/navigation';
	import Chat from '#lib/components/Chat.svelte';
	import { onRealtime } from '#lib/realtime.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	onMount(() =>
		// renamed, members changed, or you were removed (the load then sends you back)
		onRealtime('group_updated', ({ id }) => {
			if (id === data.group.id) invalidate('app:group');
		})
	);
</script>

<svelte:head>
	<title>{data.group.name}</title>
</svelte:head>

<!-- a conversation's state must not carry over when navigating to another one -->
{#key data.group.id}
	<Chat
		group={data.group}
		initial={data.thread.messages}
		initialHasMore={data.thread.hasMore}
		muted={data.muted}
	/>
{/key}
