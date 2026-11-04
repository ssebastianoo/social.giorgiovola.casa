<script lang="ts">
	import Chat from '#lib/components/Chat.svelte';
	import type { PageData } from './$types';

	export let data: PageData;
</script>

<!-- a conversation's state must not carry over when navigating to another one -->
{#key data.peer.username}
	<Chat peer={data.peer} initial={data.thread.messages} initialHasMore={data.thread.hasMore} />
{/key}
