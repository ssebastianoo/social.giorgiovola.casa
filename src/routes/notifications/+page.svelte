<script lang="ts">
	import type { PageData } from './$types';
	import { notisCount, user } from '#lib/store.js';
	import type { Notification } from '#lib/types.js';
	import Avatar from '#lib/components/Avatar.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { disablePush, enablePush, getPushState, type PushState } from '#lib/push.js';
	export let data: PageData;

	let push: PushState | null = null;
	let pushBusy = false;
	let pushError = false;

	const togglePush = async () => {
		pushBusy = true;
		pushError = false;
		try {
			push = push === 'on' ? await disablePush() : await enablePush();
		} catch (e) {
			console.error(e);
			pushError = true;
		}
		pushBusy = false;
	};

	// the unread count is pushed by the layout; reload the list when it grows
	onMount(() => {
		getPushState().then((state) => (push = state));
		let last = $notisCount;
		return notisCount.subscribe((count) => {
			if (count > last) invalidateAll();
			last = count;
		});
	});

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
{#if push === 'on' || push === 'off'}
	<div class="mt-2.5 flex items-center justify-between gap-2.5 rounded-[10px] bg-black/70 p-2.5">
		<p>
			{push === 'on'
				? 'Push notifications are on for this browser.'
				: 'Get a notification on this device when someone likes, replies, mentions or messages you.'}
		</p>
		<button class="btn" disabled={pushBusy} on:click={togglePush}>
			{push === 'on' ? 'Turn off' : 'Turn on'}
		</button>
	</div>
	{#if pushError}<p class="mt-2.5 text-muted">Something went wrong, try again.</p>{/if}
{:else if push === 'denied'}
	<p class="mt-2.5 text-muted">
		Notifications are blocked for this site: allow them in your browser settings to turn them on.
	</p>
{/if}
<div class="mt-2.5 flex flex-col gap-3.75">
	{#each data.notifications as notification}
		<div
			class="flex cursor-pointer items-center justify-between rounded-[10px] bg-black/70 p-2.5 {notification.read_at
				? ''
				: 'border border-accent'}"
			role="button"
			tabindex="0"
			on:keypress={async () => {
				await readNotification(notification);
			}}
			on:click={async () => {
				await readNotification(notification);
			}}
		>
			<div class="flex gap-2.5">
				<Avatar user={notification.sender} size={50} />
				<div class="flex flex-col justify-center">
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
						<p class="text-muted">
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
					class="btn flex size-8 items-center justify-center"
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
