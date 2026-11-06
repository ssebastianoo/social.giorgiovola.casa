<script lang="ts">
	import Button from '#lib/components/Button.svelte';
	import type { PageData } from './$types';
	import { notisCount, user } from '#lib/store.js';
	import type { Notification } from '#lib/types.js';
	import Avatar from '#lib/components/Avatar.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { disablePush, enablePush, getPushState, PushError, type PushState } from '#lib/push.js';
	let { data }: { data: PageData } = $props();

	// reassignable so read state can be updated locally until the next load
	let notifications = $derived(data.notifications);
	let push: PushState | null = $state(null);
	let pushBusy = $state(false);
	let pushError: 'unavailable' | 'failed' | null = $state(null);

	const togglePush = async () => {
		pushBusy = true;
		pushError = null;
		try {
			push = push === 'on' ? await disablePush() : await enablePush();
		} catch (e) {
			console.error(e);
			pushError = e instanceof PushError && e.reason === 'unavailable' ? 'unavailable' : 'failed';
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
				notifications = notifications.map((not) =>
					not.id === notification.id ? { ...not, read_at: new Date() } : not
				);
			}
		}
		if (redirect) {
			if (notification.type === 'follow' || !notification.post) {
				goto(`/@${notification.sender.username}`);
			} else if (
				notification.type === 'like' ||
				notification.type === 'ratioed_by_you' ||
				notification.type === 'regiorg'
			) {
				goto(`/@${$user?.username}/${notification.post.id}`);
			} else {
				goto(`/@${notification.sender.username}/${notification.post.id}`);
			}
		}
	};

	const readAll = async () => {
		const res = await fetch('/api/notifications/read', { method: 'POST' });
		if (!res.ok) return;
		$notisCount = 0;
		const now = new Date();
		notifications = notifications.map((not) => (not.read_at ? not : { ...not, read_at: now }));
	};
</script>

<div class="flex items-center justify-between gap-2.5">
	<h1>Notifications</h1>
	{#if notifications.some((n) => !n.read_at)}
		<Button onclick={readAll}>Mark all as read</Button>
	{/if}
</div>
{#if push === 'on' || push === 'off'}
	<div class="mt-2.5 flex items-center justify-between gap-2.5 rounded-[10px] bg-black/70 p-2.5">
		<p>
			{push === 'on'
				? 'Push notifications are on for this browser.'
				: 'Get a notification on this device when someone likes, regiorgios, quotes, replies, mentions, follows or messages you.'}
		</p>
		<Button disabled={pushBusy} onclick={togglePush}>
			{push === 'on' ? 'Turn off' : 'Turn on'}
		</Button>
	</div>
	{#if pushError === 'unavailable'}
		<p class="mt-2.5 text-muted">
			This browser has no push service, so it can't receive push notifications. Browsers without
			Google services (like Helium or ungoogled-chromium) don't support them; in Brave, turn on "Use
			Google services for push messaging". Chrome, Edge, Firefox and Safari work.
		</p>
	{:else if pushError === 'failed'}
		<p class="mt-2.5 text-muted">Something went wrong, try again.</p>
	{/if}
{:else if push === 'denied'}
	<p class="mt-2.5 text-muted">
		Notifications are blocked for this site: allow them in your browser settings to turn them on.
	</p>
{/if}
<div class="mt-2.5 flex flex-col gap-3.75">
	{#each notifications as notification (notification.id)}
		<div
			class="flex cursor-pointer items-center justify-between rounded-[10px] bg-black/70 p-2.5 {notification.read_at
				? ''
				: 'border border-accent'}"
			role="button"
			tabindex="0"
			onkeypress={async () => {
				await readNotification(notification);
			}}
			onclick={async () => {
				await readNotification(notification);
			}}
		>
			<div class="flex min-w-0 gap-2.5">
				<div class="shrink-0"><Avatar user={notification.sender} size={50} /></div>
				<div class="flex min-w-0 flex-col justify-center wrap-anywhere">
					{#if notification.type === 'follow'}
						<p>
							<a href={`/@${notification.sender.username}`}>@{notification.sender.username}</a>
							followed you
						</p>
					{:else if !notification.post}
						<!-- the post was deleted along with the notification, so this can't happen -->
					{:else if notification.type === 'like'}
						<p>
							<a href={`/@${notification.sender.username}`}>@{notification.sender.username}</a>
							liked
							<a href={`/@${$user?.username}/${notification.post.id}`}>your post</a>
						</p>
					{:else if notification.type === 'regiorg'}
						<p>
							<a href={`/@${notification.sender.username}`}>@{notification.sender.username}</a>
							regiorged
							<a href={`/@${$user?.username}/${notification.post.id}`}>your post</a>
						</p>
					{:else if notification.type === 'quote'}
						<p>
							<a href={`/@${notification.sender.username}`}>@{notification.sender.username}</a>
							<a href={`/@${notification.sender.username}/${notification.post.id}`}>quoted</a>
							your post
						</p>
						{#if notification.post.content}
							<p class="text-muted">
								{notification.post.content.slice(
									0,
									100
								)}{#if notification.post.content.length > 100}...{/if}
							</p>
						{/if}
					{:else if notification.type === 'mention'}
						<p>
							<a href={`/@${notification.sender.username}`}>@{notification.sender.username}</a>
							mentioned you in
							<a href={`/@${notification.sender.username}/${notification.post.id}`}>a post</a>
						</p>
					{:else if notification.type === 'ratio'}
						<p>
							<a href={`/@${notification.sender.username}`}>@{notification.sender.username}</a>
							ratioed
							<a href={`/@${notification.sender.username}/${notification.post.id}`}>your post</a>
						</p>
					{:else if notification.type === 'ratioed_by_you'}
						<p>
							You ratioed
							<a href={`/@${notification.sender.username}`}>@{notification.sender.username}</a>
							with <a href={`/@${$user?.username}/${notification.post.id}`}>your reply</a>
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
				<Button
					class="size-8 shrink-0"
					aria-label="Mark as read"
					onkeypress={async (e) => {
						e.stopPropagation();
						e.preventDefault();
						await readNotification(notification, false);
					}}
					onclick={async (e) => {
						e.stopPropagation();
						e.preventDefault();
						await readNotification(notification, false);
					}}
					><svg fill="#d9d9d9" xmlns="http://www.w3.org/2000/svg" height="1em" viewBox="0 0 448 512"
						><!--! Font Awesome Free 6.4.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2023 Fonticons, Inc. --><path
							d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"
						/></svg
					></Button
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
