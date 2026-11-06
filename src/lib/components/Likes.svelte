<script lang="ts">
	import type { UserResult } from '#lib/types.js';
	import { onMount } from 'svelte';
	import Avatar from './Avatar.svelte';

	type Kind = 'likes' | 'regiorgs' | 'quotes';
	// a quote also carries the quoting post, to link to it
	type Entry = UserResult & { id?: number; content?: string };

	// the users who liked, regiorged or quoted a post
	let { postId, kind = 'likes' }: { postId: number; kind?: Kind } = $props();
	let users: Entry[] | null = $state(null);

	const empty: Record<Kind, string> = {
		likes: 'No likes yet',
		regiorgs: 'No regiorgios yet',
		quotes: 'No quotes yet'
	};

	onMount(async () => {
		const res = await fetch(`/api/posts/${postId}/${kind}`);
		if (res.ok) {
			users = await res.json();
		}
	});
</script>

{#if users}
	{#if users.length > 0}
		<div class="flex w-full flex-col items-start gap-3.75 overflow-x-hidden overflow-y-auto">
			{#each users as user}
				<a
					href={user.id ? `/@${user.username}/${user.id}` : `/@${user.username}`}
					class="flex w-full items-center gap-2.5 text-foreground"
				>
					<div class="shrink-0">
						<Avatar {user} size={45} clickable={false} />
					</div>
					<div class="min-w-0 flex-1">
						<h3>{user.name}</h3>
						<span>@{user.username}</span>
						{#if user.content}
							<p class="truncate text-[0.9em] text-muted">{user.content}</p>
						{/if}
					</div>
				</a>
			{/each}
		</div>
	{:else}
		<div>{empty[kind]}</div>
	{/if}
{:else}
	Loading {kind}...
{/if}
