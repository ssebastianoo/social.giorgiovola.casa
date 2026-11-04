<script lang="ts">
	import { onMount, tick } from 'svelte';
	import Avatar from './Avatar.svelte';
	import { onRealtime } from '#lib/realtime.js';
	import { isMobile } from '#lib/store.js';
	import type { ChatMessage, ChatPeer } from '#lib/types.js';
	import { isHttpLink } from '#lib/utils.js';

	export let peer: ChatPeer;
	export let initial: ChatMessage[];
	export let initialHasMore: boolean;

	let messages = initial;
	let hasMore = initialHasMore;
	let list: HTMLDivElement;
	let textarea: HTMLTextAreaElement;
	let content = '';
	let sending = false;
	let loadingOlder = false;
	let error: string | null = null;

	const threadUrl = `/api/messages/${peer.username}`;

	const merge = (current: ChatMessage[], incoming: ChatMessage[]) =>
		[...new Map([...current, ...incoming].map((m) => [m.id, m])).values()].sort(
			(a, b) => a.id - b.id
		);

	const scrollToBottom = () => (list.scrollTop = list.scrollHeight);
	const isAtBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 80;

	async function add(incoming: ChatMessage[], forceScroll = false) {
		const stick = forceScroll || isAtBottom();
		messages = merge(messages, incoming);
		await tick();
		if (stick) scrollToBottom();
	}

	function markRead() {
		if (document.visibilityState !== 'visible') return;
		fetch(`${threadUrl}/read`, { method: 'POST' }).catch(() => {});
	}

	/** Catches up on what the stream can't have delivered: it drops while the app is in the background. */
	async function sync() {
		try {
			const res = await fetch(threadUrl);
			if (!res.ok) return;
			const latest: { messages: ChatMessage[]; hasMore: boolean } = await res.json();
			const newest = messages.at(-1);
			// more than a page arrived: there would be a hole between the two lists
			if (newest && latest.messages.length > 0 && latest.messages[0].id > newest.id) {
				messages = [];
				hasMore = latest.hasMore;
			}
			await add(latest.messages);
			markRead();
		} catch {
			// offline: the next reconnect tries again
		}
	}

	async function loadOlder() {
		if (!hasMore || loadingOlder || messages.length === 0) return;
		loadingOlder = true;
		try {
			const res = await fetch(`${threadUrl}?before=${messages[0].id}`);
			if (res.ok) {
				const older: { messages: ChatMessage[]; hasMore: boolean } = await res.json();
				const height = list.scrollHeight;
				messages = merge(messages, older.messages);
				hasMore = older.hasMore;
				await tick();
				// keep the viewer on the message they were reading
				list.scrollTop += list.scrollHeight - height;
			}
		} catch {
			// scrolling up again retries
		}
		loadingOlder = false;
	}

	async function send() {
		const text = content.trim();
		if (!text || sending) return;
		sending = true;
		error = null;
		try {
			const res = await fetch('/api/messages', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ to: peer.username, content: text })
			});
			if (res.ok) {
				content = '';
				await add([await res.json()], true);
			} else {
				error = res.status === 400 ? await res.text() : 'Something went wrong.';
			}
		} catch {
			error = 'Could not send the message, check your connection.';
		}
		sending = false;
		textarea.focus();
	}

	function onKeydown(e: KeyboardEvent) {
		// on touch keyboards Enter is a new line, sending is the button's job
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !$isMobile) {
			e.preventDefault();
			send();
		}
	}

	onMount(() => {
		scrollToBottom();
		markRead();
		const offMessage = onRealtime('message', (message) => {
			if (message.sender !== peer.username && message.recipient !== peer.username) return;
			add([message]);
			if (message.sender === peer.username) markRead();
		});
		const offOpen = onRealtime('open', sync);
		const onVisibility = () => {
			if (document.visibilityState === 'visible') sync();
		};
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			offMessage();
			offOpen();
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});
</script>

<!-- 120px: the fixed header's offset and the padding of the layout's main column -->
<div class="flex h-[calc(100dvh-120px)] flex-col gap-2.5">
	<div class="flex items-center gap-2.5 border-b border-line pb-2.5">
		<a
			class="px-1 text-[1.4em] text-inherit hover:no-underline"
			href="/messages"
			title="Back to messages">&larr;</a
		>
		<Avatar user={peer} size={40} />
		<a class="min-w-0 text-inherit" href={`/@${peer.username}`}>
			<p class="truncate font-extrabold">{peer.name}</p>
			<p class="truncate text-[0.85rem] opacity-70">@{peer.username}</p>
		</a>
	</div>

	<div
		class="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto"
		bind:this={list}
		on:scroll={() => {
			if (list.scrollTop < 100) loadOlder();
		}}
	>
		{#each messages as message (message.id)}
			{@const mine = message.sender !== peer.username}
			<div
				class="max-w-[85%] rounded-[10px] p-2.5 {mine
					? 'self-end border border-accent bg-accent/20'
					: 'self-start bg-black/70'}"
			>
				<p class="wrap-anywhere whitespace-pre-wrap">
					{#each message.content.split(/(\s)/) as part}{#if isHttpLink(part)}<a
								href={part}
								target="_blank"
								rel="noopener noreferrer nofollow">{part}</a
							>{:else}{part}{/if}{/each}
				</p>
				<p class="mt-1 text-right text-[0.7rem] opacity-60">
					{new Date(message.created_at).toLocaleString()}
				</p>
			</div>
		{:else}
			<p class="m-auto text-center text-muted">Say hi to {peer.name}.</p>
		{/each}
	</div>

	{#if error}
		<p class="rounded-[5px] bg-danger p-2.5">{error}</p>
	{/if}

	<form class="flex" on:submit|preventDefault={send}>
		<textarea
			class="input max-h-32 resize-none field-sizing-content"
			rows="1"
			maxlength="2000"
			placeholder="Write a message"
			aria-label="Write a message"
			bind:this={textarea}
			bind:value={content}
			on:keydown={onKeydown}
		></textarea>
		<button
			type="submit"
			title="Send"
			disabled={sending}
			class="flex cursor-pointer items-end border-b border-foreground p-2.5 outline-none"
			><svg fill="#d9d9d9" xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 512 512"
				><!--! Font Awesome Free 6.4.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2023 Fonticons, Inc. --><path
					d="M16.1 260.2c-22.6 12.9-20.5 47.3 3.6 57.3L160 376V479.3c0 18.1 14.6 32.7 32.7 32.7c9.7 0 18.9-4.3 25.1-11.8l62-74.3 123.9 51.6c18.9 7.9 40.8-4.5 43.9-24.7l64-416c1.9-12.1-3.4-24.3-13.5-31.2s-23.3-7.5-34-1.4l-448 256zm52.1 25.5L409.7 90.6 190.1 336l1.2 1L68.2 285.7zM403.3 425.4L236.7 355.9 450.8 116.6 403.3 425.4z"
				/></svg
			></button
		>
	</form>
</div>
