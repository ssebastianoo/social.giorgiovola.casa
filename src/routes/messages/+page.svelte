<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import Button from '#lib/components/Button.svelte';
	import { onRealtime } from '#lib/realtime.js';
	import { messagesCount, user } from '#lib/store.js';
	import type { ChatPeer, Conversation, GroupConversation } from '#lib/types.js';
	import { listenTyping, typingIn, typingText } from '#lib/typing.svelte.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let query = $state('');
	let results = $state<ChatPeer[]>([]);
	let timer: ReturnType<typeof setTimeout>;
	let request = 0;

	type Entry =
		| ({ kind: 'dm'; key: string; muted: boolean } & Conversation)
		| ({ kind: 'group'; key: string } & GroupConversation);

	// direct and group conversations together, most recent first
	const entries = $derived(
		[
			...data.conversations.map(
				(c): Entry => ({
					kind: 'dm',
					key: `dm:${c.peer.username}`,
					muted: data.mutedPeers.includes(c.peer.username),
					...c
				})
			),
			...data.groups.map((g): Entry => ({ kind: 'group', key: `group:${g.group.id}`, ...g }))
		].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
	);

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
		listenTyping();
		const refresh = () => invalidate('app:messages');
		const offs = [
			onRealtime('message', refresh),
			onRealtime('message_deleted', refresh),
			onRealtime('group_message', refresh),
			onRealtime('group_message_deleted', refresh),
			onRealtime('group_updated', refresh),
			onRealtime('open', refresh)
		];
		// the count also moves when a conversation is read in another tab
		let last = $messagesCount;
		const offCount = messagesCount.subscribe((count) => {
			if (count !== last) refresh();
			last = count;
		});
		return () => {
			for (const off of offs) off();
			offCount();
			clearTimeout(timer);
		};
	});
</script>

<div class="flex items-center justify-between gap-2.5">
	<h1>Messages</h1>
	<Button size="sm" href="/messages/groups/new">New group</Button>
</div>

<input
	class="input mt-2.5"
	type="search"
	placeholder="Find someone to message"
	aria-label="Find someone to message"
	autocomplete="off"
	maxlength="33"
	bind:value={query}
	oninput={onSearch}
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
	{#each entries as entry (entry.key)}
		<a
			class="flex items-center gap-2.5 rounded-[10px] border bg-black/70 p-2.5 text-inherit hover:no-underline {entry.unread >
				0 && !entry.muted
				? 'border-accent'
				: 'border-transparent hover:bg-black'}"
			href={entry.kind === 'dm'
				? `/messages/${entry.peer.username}`
				: `/messages/groups/${entry.group.id}`}
		>
			{#if entry.kind === 'dm'}
				<Avatar user={entry.peer} size={50} clickable={false} />
			{:else if entry.group.members.length === 1}
				<Avatar user={entry.group.members[0]} size={50} clickable={false} />
			{:else if entry.group.members.length === 0}
				<!-- everyone else left -->
				<div class="size-[50px] shrink-0 rounded-full border border-line" aria-hidden="true">
					&nbsp;
				</div>
			{:else}
				<!-- two faces of the group, stacked in the space of one avatar -->
				<div class="relative size-[50px] shrink-0">
					{#each entry.group.members.slice(0, 2) as member, i (member.username)}
						<div class="absolute {i === 0 ? 'top-0 left-0' : 'right-0 bottom-0'}">
							<Avatar user={member} size={32} clickable={false} />
						</div>
					{/each}
				</div>
			{/if}
			<div class="flex min-w-0 flex-1 flex-col gap-0.75">
				<div class="flex items-baseline justify-between gap-2.5">
					{#if entry.kind === 'dm'}
						<p class="truncate font-extrabold">
							{entry.peer.name}
							<span class="font-medium opacity-80">@{entry.peer.username}</span>
						</p>
					{:else}
						<p class="truncate font-extrabold">
							{entry.group.name}
							<span class="font-medium opacity-80">{entry.group.size} members</span>
						</p>
					{/if}
					<p class="shrink-0 text-[0.8rem] opacity-70">
						{new Date(entry.created_at).toLocaleDateString()}
					</p>
				</div>
				<div class="flex items-center justify-between gap-2.5">
					<!-- the entry keys are the typing keys (dm:<username>, group:<id>) -->
					{#if typingIn(entry.key).length > 0}
						<p class="truncate text-accent">
							{entry.kind === 'dm' ? 'typing…' : typingText(typingIn(entry.key))}
						</p>
					{:else}
						<p class="truncate text-muted">
							{#if entry.kind === 'dm'}
								{entry.mine ? 'You: ' : ''}{entry.preview}
							{:else if entry.sender === null}
								No messages yet
							{:else if entry.event}
								{entry.preview}
							{:else}
								{entry.mine ? 'You' : entry.sender}: {entry.preview}
							{/if}
						</p>
					{/if}
					{#if entry.muted}
						<svg
							class="shrink-0 text-muted"
							xmlns="http://www.w3.org/2000/svg"
							width="1em"
							height="1em"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							role="img"
							aria-label="Muted"
							><title>Muted</title><path d="M13.7 21a2 2 0 0 1-3.4 0" /><path
								d="M18.6 13A17.9 17.9 0 0 1 18 8"
							/><path d="M6.3 6.3A5.9 5.9 0 0 0 6 8c0 7-3 9-3 9h14" /><path
								d="M18 8a6 6 0 0 0-9.3-5"
							/><path d="M2 2l20 20" /></svg
						>
					{/if}
					{#if entry.unread > 0}
						<!-- muted chats keep their count, greyed: it isn't in the header badge -->
						<span
							class="shrink-0 rounded-full px-[7px] text-[0.75em] font-bold text-background {entry.muted
								? 'bg-muted'
								: 'bg-accent'}">{entry.unread}</span
						>
					{/if}
				</div>
			</div>
		</a>
	{:else}
		{#if !query.trim()}
			<p class="text-muted">
				No conversations yet. Search for someone above to start one, or create a group.
			</p>
		{/if}
	{/each}
</div>
