<script lang="ts">
	import Chat from '#lib/components/Chat.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<!-- a conversation's state must not carry over when navigating to another one -->
{#key data.peer.username}
	<Chat
		peer={data.peer}
		initial={data.thread.messages}
		initialHasMore={data.thread.hasMore}
		block={data.block}
		muted={data.muted}
	/>
{/key}
