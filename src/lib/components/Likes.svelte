<script lang="ts">
	import type { User } from '#lib/types.js';
	import { onMount } from 'svelte';
	import Avatar from './Avatar.svelte';

	export let postId: number;
	let users: User[] | null = null;

	onMount(async () => {
		const res = await fetch(`/api/posts/${postId}/likes`);
		if (res.ok) {
			users = await res.json();
		}
	});
</script>

{#if users}
	{#if users.length > 0}
		<div class="flex w-75 flex-col items-start gap-3.75 overflow-auto">
			{#each users as user}
				<a href={`/@${user.username}`} class="flex w-full items-center gap-2.5 text-foreground">
					<Avatar {user} size={45} />
					<div>
						<h3>{user.name}</h3>
						<span>@{user.username}</span>
					</div>
				</a>
			{/each}
		</div>
	{:else}
		<div>No likes yet</div>
	{/if}
{:else}
	Loading likes...
{/if}
