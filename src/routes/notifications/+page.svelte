<script lang="ts">
	import type { PageData } from './$types';
	import { notisCount, user } from '$lib/store';
	import type { Notification } from '$lib/types';
	import Avatar from '$lib/components/Avatar.svelte';
	import { goto } from '$app/navigation';
	export let data: PageData;

	const readNotification = async (notification: Notification, redirect = true) => {
		if (notification.read_at === null) {
			fetch(`/api/notifications/${notification.id}/read`, {
				method: 'POST'
			});
			$notisCount -= 1;

			if (!redirect) {
				for (const not of data.notifications) {
					if (not.id === notification.id) {
						not.read_at = new Date();
						data.notifications = data.notifications;
						break;
					}
				}
			}
		}
		if (redirect) {
			if (notification.type === 'like') {
				goto(`/@${$user?.username}/${notification.post.id}`);
			} else {
				goto(`/@${notification.sender.username}/${notification.post.id}`);
			}
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
			<div class="notification-content">
				<Avatar user={notification.sender} size={50} />
				<div class="notification-text">
					{#if notification.type === 'like'}
						<p>
							<a href={`/@${notification.sender.username}`}>@{notification.sender.username}</a>
							liked
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
			</div>
			{#if !notification.read_at}
				<button
					class="btn"
					on:keypress|stopPropagation|preventDefault={async () => {
						await readNotification(notification, false);
					}}
					on:click|stopPropagation|preventDefault={async () => {
						await readNotification(notification, false);
					}}
					><svg fill="#d9d9d9" xmlns="http://www.w3.org/2000/svg" height="1em" viewBox="0 0 448 512"
						><!--! Font Awesome Free 6.4.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2023 Fonticons, Inc. --><path
							d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"
						/></svg
					></button
				>
			{/if}
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
		gap: 15px;
		margin-top: 10px;
	}

	.notification {
		cursor: pointer;
		display: flex;
		justify-content: space-between;
		align-items: center;
		background-color: $color5;
		padding: 10px;
		border-radius: 10px;

		.notification-content {
			display: flex;
			gap: 10px;

			.notification-text {
				display: flex;
				flex-direction: column;
				justify-content: center;
			}
		}

		.btn {
			width: 20px;
			height: 20px;
			display: flex;
			justify-content: center;
			align-items: center;
		}

		.content {
			color: $color6;
		}

		&[data-unread='true'] {
			border: 1px solid $color1;
		}
	}
</style>
