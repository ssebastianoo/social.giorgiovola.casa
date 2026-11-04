<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import { onRealtime } from '#lib/realtime.js';
	import { messagesCount, user } from '#lib/store.js';
	import type { ChatPeer } from '#lib/types.js';
	import type { PageData } from './$types';

	export let data: PageData;

	let query = '';
	let results: ChatPeer[] = [];
	let timer: ReturnType<typeof setTimeout>;
	let request = 0;

	function onSearch() {
		clearTimeout(timer);
		const current = ++request;
		const q = query.trim().replace(/^@/, '').toLowerCase();
		if (!q) {
			results = [];
			return;
		}
		timer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
				// a newer keystroke supersedes this response
				if (!res.ok || current !== request) return;
				const found: ChatPeer[] = await res.json();
				results = found.filter((u) => u.username !== $user?.username);
			} catch {
				results = [];
			}
		}, 120);
	}

	onMount(() => {
		const refresh = () => invalidate('app:messages');
		const offMessage = onRealtime('message', refresh);
		const offOpen = onRealtime('open', refresh);
		// the count also moves when a conversation is read in another tab
		let last = $messagesCount;
		const offCount = messagesCount.subscribe((count) => {
			if (count !== last) refresh();
			last = count;
		});
		return () => {
			offMessage();
			offOpen();
			offCount();
			clearTimeout(timer);
		};
	});
</script>

<h1>Messages</h1>

<input
	class="input mt-2.5"
	type="search"
	placeholder="Find someone to message"
	aria-label="Find someone to message"
	autocomplete="off"
	maxlength="33"
	bind:value={query}
	on:input={onSearch}
/>

{#if query.trim()}
	<div class="mt-2.5 flex flex-col gap-1">
		{#each results as result (result.username)}
			<a
				class="flex items-center gap-2.5 rounded-[10px] p-2.5 text-inherit hover:bg-black hover:no-underline"
				href={`/messages/${result.username}`}
			>
				<Avatar user={result} size={40} clickable={false} />
				<div class="flex min-w-0 flex-col">
					<span class="truncate font-extrabold">{result.name}</span>
					<span class="truncate text-[0.85rem] opacity-70">@{result.username}</span>
				</div>
			</a>
		{:else}
			<p class="p-2.5 text-muted">Nobody found.</p>
		{/each}
	</div>
{/if}

<div class="mt-5 flex flex-col gap-3.75">
	{#each data.conversations as conversation (conversation.peer.username)}
		<a
			class="flex items-center gap-2.5 rounded-[10px] border bg-black/70 p-2.5 text-inherit hover:no-underline {conversation.unread >
			0
				? 'border-accent'
				: 'border-transparent hover:bg-black'}"
			href={`/messages/${conversation.peer.username}`}
		>
			<Avatar user={conversation.peer} size={50} clickable={false} />
			<div class="flex min-w-0 flex-1 flex-col gap-0.75">
				<div class="flex items-baseline justify-between gap-2.5">
					<p class="truncate font-extrabold">
						{conversation.peer.name}
						<span class="font-medium opacity-80">@{conversation.peer.username}</span>
					</p>
					<p class="shrink-0 text-[0.8rem] opacity-70">
						{new Date(conversation.created_at).toLocaleDateString()}
					</p>
				</div>
				<div class="flex items-center justify-between gap-2.5">
					<p class="truncate text-muted">
						{conversation.mine ? 'You: ' : ''}{conversation.preview}
					</p>
					{#if conversation.unread > 0}
						<span
							class="shrink-0 rounded-full bg-accent px-[7px] text-[0.75em] font-bold text-background"
							>{conversation.unread}</span
						>
					{/if}
				</div>
			</div>
		</a>
	{:else}
		{#if !query.trim()}
			<p class="text-muted">No conversations yet. Search for someone above to start one.</p>
		{/if}
	{/each}
</div>
