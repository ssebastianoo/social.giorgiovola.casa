<script lang="ts">
	import type { User } from '$lib/types';
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
		<div class="likes">
			{#each users as user}
				<a href={`/@${user.username}`} class="user">
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

<style lang="scss">
	@import 'src/variables.scss';
	.user {
		display: flex;
		align-items: center;
		gap: 10px;
		color: $color3;
		width: 100%;
	}
	.likes {
		width: 300px;
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 15px;
		align-items: start;
	}
</style>
