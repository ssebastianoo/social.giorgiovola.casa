<script lang="ts">
	import type { PageData } from './$types';
	import { user } from '$lib/store';
	import { enhance } from '$app/forms';
	export let data: PageData;
</script>

<h1>Notifications</h1>
<div class="notifications">
	{#each data.notifications as notification}
		<div class="notification">
			{#if notification.read_at !== null}
				<p>Notification read</p>
			{/if}
			{#if notification.type === 'like'}
				<p>
					<a href={`/@${notification.sender.username}`}>@{notification.sender.username}</a> liked
					<a href={`/@${$user?.username}/${notification.post.id}`}>your post</a>
				</p>
			{:else if notification.type === 'mention'}
				<p>
					<a href={`/@${notification.sender.username}`}>@{notification.sender.username}</a>
					mentioned you in
					<a href={`/@${$user?.username}/${notification.post.id}`}>a post</a>
				</p>
			{:else if notification.type === 'reply'}
				<p>
					<a href={`/@${notification.sender.username}`}>@{notification.sender.username}</a> replied
					to
					<a href={`/@${notification.sender.username}/${notification.post.id}`}>your post</a>
				</p>
			{/if}
			{#if notification.read_at === null}
				<form method="post" use:enhance>
					<input type="hidden" name="id" value={notification.id} />
					<button type="submit">Mark as read</button>
				</form>
			{/if}
		</div>
	{/each}
</div>

<style>
	.notifications {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.notification {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.notification p {
		margin: 0;
	}

	.notification form {
		display: flex;
		justify-content: flex-end;
	}
</style>
