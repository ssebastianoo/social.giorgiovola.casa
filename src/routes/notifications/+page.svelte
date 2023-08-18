<script lang="ts">
	import type { PageData } from './$types';
	import { user } from '$lib/store';
	export let data: PageData;
</script>

<h1>Notifications</h1>
{#each data.notifications as notification}
	{#if notification.type === 'like'}
		<p>
			<a href={`/@${notification.sender.username}`}>@{notification.sender.username}</a> liked
			<a href={`/@${$user?.username}/${notification.post.id}`}>your post</a>
		</p>
	{:else if notification.type === 'mention'}
		<p>
			<a href={`/@${notification.sender.username}`}>@{notification.sender.username}</a> mentioned
			you in
			<a href={`/@${$user?.username}/${notification.post.id}`}>a post</a>
		</p>
	{:else if notification.type === 'reply'}
		<p>
			<a href={`/@${notification.sender.username}`}>@{notification.sender.username}</a> replied to
			<a href={`/@${notification.sender.username}/${notification.post.id}`}>your post</a>
		</p>{/if}
{/each}
