<script lang="ts">
	import type { PageData } from './$types';
	import { notisCount, user } from '$lib/store';
	import type { Notification } from '$lib/types';
	import Avatar from '$lib/components/Avatar.svelte';
	import { goto } from '$app/navigation';
	export let data: PageData;

	const readNotification = async (notification: Notification) => {
		if (notification.read_at === null) {
			fetch(`/api/notifications/${notification.id}/read`, {
				method: 'POST'
			});
			$notisCount -= 1;
		}
		if (notification.type === 'like') {
			goto(`/@${$user?.username}/${notification.post.id}`);
		} else {
			goto(`/@${notification.sender.username}/${notification.post.id}`);
		}
	};
</script>

<h1>Notifications</h1>
<div class="notifications">
	{#each data.notifications as notification}
		<div
			class="notification"
			data-unread={!Boolean(notification.read_at)}
			role="button"
			tabindex="0"
			on:keypress={async () => {
				await readNotification(notification);
			}}
			on:click={async () => {
				await readNotification(notification);
			}}
		>
			<Avatar user={notification.sender} size={50} />

			<div>
				{#if notification.type === 'like'}
					<p>
						<a href={`/@${notification.sender.username}`}>@{notification.sender.username}</a> liked
						<a href={`/@${$user?.username}/${notification.post.id}`}>your post</a>
					</p>
				{:else if notification.type === 'mention'}
					<p>
						<a href={`/@${notification.sender.username}`}>@{notification.sender.username}</a>
						mentioned you in
						<a href={`/@${notification.sender.username}/${notification.post.id}`}>a post</a>
					</p>
				{:else if notification.type === 'reply'}
					<p>
						<a href={`/@${notification.sender.username}`}>@{notification.sender.username}</a>
						replied to
						<a href={`/@${notification.sender.username}/${notification.post.id}`}>your post</a>
					</p>
					<p class="content">
						{notification.post.content.slice(
							0,
							100
						)}{#if notification.post.content.length > 100}...{/if}
					</p>
				{/if}
			</div>
			<!-- {#if notification.read_at === null}
				<form method="post" use:enhance>
					<input type="hidden" name="id" value={notification.id} />
					<button type="submit">Mark as read</button>
				</form>
			{/if} -->
		</div>
	{/each}
</div>

<style lang="scss">
	@import 'src/variables.scss';
	.notifications {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.notification {
		cursor: pointer;
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
		background-color: $color5;
		padding: 0.5rem;

		.content {
			color: $color6;
		}

		&[data-unread='true'] {
			background-color: $color1;

			.content {
				color: $color7;
			}

			a {
				color: $color5;
			}
		}
	}
</style>
