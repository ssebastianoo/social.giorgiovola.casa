<script lang="ts">
	import { onMount, tick } from 'svelte';
	import Avatar from './Avatar.svelte';
	import QuoteCard from './QuoteCard.svelte';
	import { onRealtime } from '#lib/realtime.js';
	import { isMobile, user } from '#lib/store.js';
	import type { ChatMessage, ChatPeer, GroupChat, GroupMessage } from '#lib/types.js';
	import { isHttpLink } from '#lib/utils.js';
	import { openImage } from '#lib/imageViewer.svelte.js';
	import { groupEventText } from '#lib/groupEvents.js';
	import {
		dmKey,
		groupKey,
		listenTyping,
		resetTyping,
		sendTyping,
		typingIn,
		typingText
	} from '#lib/typing.svelte.js';

	type Message = ChatMessage | GroupMessage;

	type Props = {
		initial: Message[];
		initialHasMore: boolean;
		/** a direct conversation: the other person */
		peer?: ChatPeer;
		/** direct conversations. me: I blocked them, peer: they blocked me */
		block?: { me: boolean; peer: boolean };
		/** a group chat */
		group?: GroupChat;
		/** the viewer muted this conversation: no push, not in the badge */
		muted?: boolean;
	};

	let {
		initial,
		initialHasMore,
		peer,
		block,
		group,
		muted: initialMuted = false
	}: Props = $props();

	// the page is keyed on the conversation, so these only need their first value
	// svelte-ignore state_referenced_locally
	let blockedByMe = $state(block?.me ?? false);
	// svelte-ignore state_referenced_locally
	let muted = $state(initialMuted);
	// svelte-ignore state_referenced_locally
	const blockedByPeer = block?.peer ?? false;
	// svelte-ignore state_referenced_locally
	let messages = $state(initial);
	// svelte-ignore state_referenced_locally
	let hasMore = $state(initialHasMore);
	// svelte-ignore state_referenced_locally
	const groupId = group?.id ?? null;
	// svelte-ignore state_referenced_locally
	const peerUsername = peer?.username ?? '';

	let list: HTMLDivElement;
	let textarea = $state<HTMLTextAreaElement>();
	let fileInput = $state<HTMLInputElement>();
	let content = $state('');
	let sending = $state(false);
	let loadingOlder = false;
	let error = $state<string | null>(null);
	let attachments = $state<Attachment[]>([]);
	let errorTimeout: ReturnType<typeof setTimeout>;
	let dragging = $state(false);
	let dragDepth = 0;

	const MAX_IMAGES = 5;
	const MAX_BYTES = 10 * 1024 * 1024;
	const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|avif|bmp|ico|svg)$/i;

	type Attachment = { file: File; url: string };

	const threadUrl = groupId !== null ? `/api/groups/${groupId}` : `/api/messages/${peerUsername}`;
	const sendUrl = groupId !== null ? `/api/groups/${groupId}/messages` : '/api/messages';

	const senderOf = (m: Message) => (typeof m.sender === 'string' ? m.sender : m.sender.username);
	const isMine = (m: Message) =>
		groupId !== null ? senderOf(m) === $user?.username : senderOf(m) !== peerUsername;
	/** a group event ("Alice added Bob"), shown as a line rather than a bubble */
	const isEvent = (m: Message): m is GroupMessage => 'kind' in m && m.kind !== 'message';

	const typingTarget = groupId !== null ? { group: groupId } : { to: peerUsername };
	const typers = $derived(typingIn(groupId !== null ? groupKey(groupId) : dmKey(peerUsername)));

	function onInput() {
		if (content.trim()) sendTyping(typingTarget);
	}

	// group chats: the 3 first other members, for the header
	const faces = $derived(
		group?.members.filter((m) => m.username !== $user?.username).slice(0, 3) ?? []
	);

	const merge = (current: Message[], incoming: Message[]) =>
		[...new Map([...current, ...incoming].map((m) => [m.id, m])).values()].sort(
			(a, b) => a.id - b.id
		);

	const scrollToBottom = () => (list.scrollTop = list.scrollHeight);
	const isAtBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 80;

	// whether the view follows the bottom: images load after the first scroll and would
	// otherwise grow the list under the reader, leaving them mid-conversation
	let stick = true;

	/** Images don't bubble load, so this listens in the capture phase. */
	function onMediaLoad() {
		if (stick) scrollToBottom();
	}

	async function add(incoming: Message[], forceScroll = false) {
		const follow = forceScroll || isAtBottom();
		messages = merge(messages, incoming);
		await tick();
		if (follow) scrollToBottom();
	}

	// set when there may be unread messages, cleared once the reader has seen the bottom
	let pendingRead = true;

	/** Marks the thread read, but only while the latest messages are on screen: someone reading older history hasn't seen the new ones. */
	function markRead() {
		pendingRead = true;
		if (document.visibilityState !== 'visible' || !isAtBottom()) return;
		pendingRead = false;
		fetch(`${threadUrl}/read`, { method: 'POST' }).catch(() => {});
	}

	function onScroll() {
		stick = isAtBottom();
		if (list.scrollTop < 100) loadOlder();
		if (pendingRead && isAtBottom()) markRead();
	}

	async function toggleMute() {
		const muting = !muted;
		try {
			const res = await fetch(`${threadUrl}/mute`, { method: muting ? 'POST' : 'DELETE' });
			if (res.ok) muted = muting;
			else showError('Something went wrong.');
		} catch {
			showError('Could not reach the server, check your connection.');
		}
	}

	async function toggleBlock() {
		const blocking = !blockedByMe;
		if (
			blocking &&
			!confirm(`Block @${peerUsername}? Neither of you will be able to message the other.`)
		)
			return;
		try {
			const res = await fetch(`${threadUrl}/block`, { method: blocking ? 'POST' : 'DELETE' });
			if (res.ok) blockedByMe = blocking;
			else showError('Something went wrong.');
		} catch {
			showError('Could not reach the server, check your connection.');
		}
	}

	async function deleteMessage(message: Message) {
		const forWhom = groupId !== null ? 'everyone in the group' : 'both of you';
		if (!confirm(`Delete this message? It will be removed for ${forWhom}.`)) return;
		try {
			const res = await fetch(sendUrl, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: message.id })
			});
			// 404: already gone, e.g. deleted from another tab
			if (res.ok || res.status === 404) remove(message.id);
			else showError('Something went wrong.');
		} catch {
			showError('Could not reach the server, check your connection.');
		}
	}

	const remove = (id: number) => (messages = messages.filter((m) => m.id !== id));

	/** Catches up on what the stream can't have delivered: it drops while the app is in the background. */
	async function sync() {
		try {
			const res = await fetch(threadUrl);
			if (!res.ok) return;
			const latest: { messages: Message[]; hasMore: boolean } = await res.json();
			// drop what was deleted while the stream was down, within the span this page covers
			const oldest = latest.hasMore ? latest.messages[0]?.id ?? 0 : 0;
			const ids = new Set(latest.messages.map((m) => m.id));
			messages = messages.filter((m) => m.id < oldest || ids.has(m.id));
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
				const older: { messages: Message[]; hasMore: boolean } = await res.json();
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

	function showError(message: string) {
		error = message;
		clearTimeout(errorTimeout);
		errorTimeout = setTimeout(() => (error = null), 4000);
	}

	function isImage(file: File) {
		return file.type.startsWith('image/') || (!file.type && IMAGE_EXT_RE.test(file.name));
	}

	function addFiles(files: Iterable<File>) {
		const added: Attachment[] = [];
		for (const file of files) {
			if (!isImage(file)) {
				showError(`${file.name || 'That file'} is not an image.`);
				continue;
			}
			if (file.size > MAX_BYTES) {
				showError(`${file.name || 'Image'} is too big, max size is 10mb.`);
				continue;
			}
			if (attachments.length + added.length >= MAX_IMAGES) {
				showError(`You can attach at most ${MAX_IMAGES} images.`);
				break;
			}
			added.push({ file, url: URL.createObjectURL(file) });
		}
		if (added.length) attachments = [...attachments, ...added];
	}

	function removeAttachment(attachment: Attachment) {
		URL.revokeObjectURL(attachment.url);
		attachments = attachments.filter((a) => a !== attachment);
	}

	function clearAttachments() {
		for (const a of attachments) URL.revokeObjectURL(a.url);
		attachments = [];
	}

	function onFilesSelected() {
		if (!fileInput) return;
		addFiles(Array.from(fileInput.files ?? []));
		// lets the same file be picked again after removing it
		fileInput.value = '';
	}

	function onPaste(e: ClipboardEvent) {
		const files = Array.from(e.clipboardData?.files ?? []);
		if (files.length === 0) return;
		e.preventDefault();
		addFiles(files);
	}

	async function send() {
		const text = content.trim();
		if ((!text && attachments.length === 0) || sending) return;
		sending = true;
		error = null;
		try {
			const body = new FormData();
			if (groupId === null) body.set('to', peerUsername);
			body.set('content', text);
			for (const { file } of attachments) body.append('images', file);
			const res = await fetch(sendUrl, { method: 'POST', body });
			if (res.ok) {
				content = '';
				resetTyping(typingTarget);
				clearAttachments();
				await add([await res.json()], true);
			} else {
				error =
					res.status === 400 || res.status === 403 || res.status === 429
						? await res.text()
						: res.status === 413
						? 'Images are too big.'
						: 'Something went wrong.';
			}
		} catch {
			error = 'Could not send the message, check your connection.';
		}
		sending = false;
		textarea?.focus();
	}

	function onKeydown(e: KeyboardEvent) {
		// on touch keyboards Enter is a new line, sending is the button's job
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !$isMobile) {
			e.preventDefault();
			send();
		}
	}

	// dropping works anywhere on the page: otherwise a slightly missed drop would make the
	// browser navigate away to the image
	const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');

	onMount(() => {
		const onDragEnter = (e: DragEvent) => {
			if (!hasFiles(e)) return;
			e.preventDefault();
			dragDepth++;
			dragging = true;
		};
		const onDragOver = (e: DragEvent) => {
			if (!hasFiles(e)) return;
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
		};
		const onDragLeave = (e: DragEvent) => {
			if (!hasFiles(e)) return;
			dragDepth = Math.max(0, dragDepth - 1);
			if (dragDepth === 0) dragging = false;
		};
		const onDrop = (e: DragEvent) => {
			if (!hasFiles(e)) return;
			e.preventDefault();
			dragDepth = 0;
			dragging = false;
			addFiles(Array.from(e.dataTransfer?.files ?? []));
		};
		window.addEventListener('dragenter', onDragEnter);
		window.addEventListener('dragover', onDragOver);
		window.addEventListener('dragleave', onDragLeave);
		window.addEventListener('drop', onDrop);
		listenTyping();
		scrollToBottom();
		markRead();
		const offs =
			groupId !== null
				? [
						onRealtime('group_message', async (message) => {
							if (message.group_id !== groupId) return;
							await add([message]);
							if (!isMine(message)) markRead();
						}),
						onRealtime('group_message_deleted', ({ group_id, id }) => {
							if (group_id === groupId) remove(id);
						})
				  ]
				: [
						onRealtime('message', async (message) => {
							if (message.sender !== peerUsername && message.recipient !== peerUsername) return;
							await add([message]);
							if (message.sender === peerUsername) markRead();
						}),
						onRealtime('message_deleted', ({ id }) => remove(id))
				  ];
		offs.push(onRealtime('open', sync));
		const onVisibility = () => {
			if (document.visibilityState === 'visible') sync();
		};
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			for (const off of offs) off();
			window.removeEventListener('dragenter', onDragEnter);
			window.removeEventListener('dragover', onDragOver);
			window.removeEventListener('dragleave', onDragLeave);
			window.removeEventListener('drop', onDrop);
			document.removeEventListener('visibilitychange', onVisibility);
			clearTimeout(errorTimeout);
			clearAttachments();
		};
	});
</script>

{#if dragging}
	<div
		class="pointer-events-none fixed inset-0 z-999 flex items-center justify-center bg-background/70 p-5 backdrop-blur-[2px]"
	>
		<div
			class="w-full max-w-[442px] rounded-md border-2 border-dashed border-accent p-10 text-center"
		>
			Drop images to attach
		</div>
	</div>
{/if}

<!-- 120px: the fixed header's offset and the padding of the layout's main column -->
<div class="flex h-[calc(100dvh-120px)] flex-col gap-2.5">
	<div class="flex items-center gap-2.5 border-b border-line pb-2.5">
		<a
			class="px-1 text-[1.4em] text-inherit hover:no-underline"
			href="/messages"
			title="Back to messages">&larr;</a
		>
		{#if group}
			<a
				class="flex min-w-0 items-center gap-2.5 text-inherit hover:no-underline"
				href={`/messages/groups/${group.id}/settings`}
				title="Group info"
			>
				<div class="flex shrink-0 -space-x-3">
					{#each faces as face (face.username)}
						<Avatar user={face} size={32} clickable={false} />
					{/each}
				</div>
				<div class="min-w-0">
					<p class="truncate font-extrabold">{group.name}</p>
					<p class="truncate text-[0.85rem] opacity-70">{group.members.length} members</p>
				</div>
			</a>
		{:else if peer}
			<Avatar user={peer} size={40} />
			<a class="min-w-0 text-inherit" href={`/@${peer.username}`}>
				<p class="truncate font-extrabold">{peer.name}</p>
				<p class="truncate text-[0.85rem] opacity-70">@{peer.username}</p>
			</a>
		{/if}
		<div class="ml-auto flex shrink-0 items-center gap-2.5 text-[0.85rem]">
			<button
				type="button"
				class="flex cursor-pointer items-center gap-[5px] opacity-70 outline-none hover:opacity-100"
				title={muted
					? 'Muted: no notifications, not counted in the badge'
					: 'Stop notifications from this chat'}
				onclick={toggleMute}
				>{#if muted}<svg
						xmlns="http://www.w3.org/2000/svg"
						width="1em"
						height="1em"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
						><path d="M13.7 21a2 2 0 0 1-3.4 0" /><path d="M18.6 13A17.9 17.9 0 0 1 18 8" /><path
							d="M6.3 6.3A5.9 5.9 0 0 0 6 8c0 7-3 9-3 9h14"
						/><path d="M18 8a6 6 0 0 0-9.3-5" /><path d="M2 2l20 20" /></svg
					>Unmute{:else}Mute{/if}</button
			>
			{#if group}
				<a
					class="text-inherit opacity-70 hover:opacity-100"
					href={`/messages/groups/${group.id}/settings`}>Info</a
				>
			{:else}
				<button
					type="button"
					class="cursor-pointer opacity-70 outline-none hover:opacity-100"
					onclick={toggleBlock}>{blockedByMe ? 'Unblock' : 'Block'}</button
				>
			{/if}
		</div>
	</div>

	<div
		class="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto"
		bind:this={list}
		onscroll={onScroll}
		onloadcapture={onMediaLoad}
	>
		{#each messages as message, index (message.id)}
			{@const mine = isMine(message)}
			{@const author = typeof message.sender === 'string' ? null : message.sender}
			{#if isEvent(message)}
				<!-- someone joined, left, renamed the group… -->
				<p
					class="my-1.5 self-center text-center text-[0.8em] text-muted"
					title={new Date(message.created_at).toLocaleString()}
				>
					{groupEventText(message, $user?.username)}
				</p>
			{:else}
				<!-- in groups, name who wrote a run of messages from someone else -->
				{#if author && !mine && (index === 0 || isEvent(messages[index - 1]) || senderOf(messages[index - 1]) !== author.username)}
					<div class="mt-1.5 flex items-center gap-[5px] self-start">
						<Avatar user={author} size={24} />
						<a class="text-[0.8em] font-bold text-inherit" href={`/@${author.username}`}
							>{author.name}</a
						>
					</div>
				{/if}
				<div
					class="flex max-w-[85%] flex-col gap-1.5 rounded-[10px] p-2.5 {mine
						? 'self-end bg-accent text-background'
						: 'self-start bg-white/10'}"
				>
					{#if message.images?.length}
						<div class="grid gap-1.5 {message.images.length > 1 ? 'grid-cols-2' : ''}">
							{#each message.images as image, i}
								<button
									type="button"
									class="flex cursor-zoom-in justify-center overflow-hidden rounded-[5px] bg-black/20 outline-none"
									aria-label="Open image"
									onclick={() => openImage(message.images ?? [], i)}
								>
									<img
										class={message.images.length > 1
											? 'aspect-square w-full object-cover'
											: 'max-h-[360px] max-w-full object-contain'}
										src={image}
										alt=""
										loading="lazy"
									/>
								</button>
							{/each}
						</div>
					{/if}
					{#if message.content}
						<p class="wrap-anywhere whitespace-pre-wrap">
							{#each message.content.split(/(\s)/) as part}{#if isHttpLink(part)}<a
										class={mine ? 'text-inherit underline' : ''}
										href={part}
										target="_blank"
										rel="noopener noreferrer nofollow">{part}</a
									>{:else}{part}{/if}{/each}
						</p>
					{/if}
					{#if message.linked_post}
						<!-- on its own dark ground, so it reads the same in both bubble colors -->
						<div class="rounded-[5px] bg-background text-foreground">
							<QuoteCard quote={message.linked_post} />
						</div>
					{/if}
					<div class="flex items-center justify-end gap-2 text-[0.7rem]">
						{#if mine}
							<button
								type="button"
								class="cursor-pointer opacity-60 outline-none hover:opacity-100"
								aria-label="Delete message"
								title="Delete message"
								onclick={() => deleteMessage(message)}
								><svg
									xmlns="http://www.w3.org/2000/svg"
									width="1em"
									height="1em"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path
										d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"
									/><path d="M10 11v6" /><path d="M14 11v6" /></svg
								></button
							>
						{/if}
						<p class="opacity-60">{new Date(message.created_at).toLocaleString()}</p>
					</div>
				</div>
			{/if}
		{:else}
			<p class="m-auto text-center text-muted">Say hi to {group?.name ?? peer?.name}.</p>
		{/each}
	</div>

	{#if typers.length > 0}
		<p class="-mb-[5px] truncate text-[0.8em] text-muted" aria-live="polite">
			{typingText(typers)}
		</p>
	{/if}

	{#if error}
		<p class="rounded-[5px] bg-danger p-2.5">{error}</p>
	{/if}

	{#if attachments.length > 0}
		<div class="flex flex-wrap gap-2.5">
			{#each attachments as attachment (attachment.url)}
				<div class="relative size-16 overflow-hidden rounded-[5px] border border-line">
					<img class="size-full object-cover" src={attachment.url} alt="" />
					<button
						type="button"
						title="Remove"
						aria-label="Remove image"
						onclick={() => removeAttachment(attachment)}
						class="absolute top-0.5 right-0.5 flex size-5 cursor-pointer items-center justify-center rounded-full bg-background/80 text-[0.8rem] leading-none outline-none hover:bg-danger"
						>×</button
					>
				</div>
			{/each}
		</div>
	{/if}

	{#if blockedByMe}
		<p class="p-2.5 text-center text-muted">You blocked @{peerUsername}.</p>
	{:else if blockedByPeer}
		<p class="p-2.5 text-center text-muted">You can't message this user.</p>
	{:else}
		<form
			class="flex"
			onsubmit={(e) => {
				e.preventDefault();
				send();
			}}
			onpaste={onPaste}
		>
			<input
				bind:this={fileInput}
				onchange={onFilesSelected}
				type="file"
				accept="image/*"
				multiple
				hidden
			/>
			<!-- prettier-ignore -->
			<textarea
				class="input max-h-32 resize-none field-sizing-content"
				rows="1"
				maxlength="2000"
				placeholder="Write a message"
				aria-label="Write a message"
				bind:this={textarea}
				bind:value={content}
				onkeydown={onKeydown}
				oninput={onInput}
			></textarea>
			<button
				type="button"
				title="Attach images"
				aria-label="Attach images"
				disabled={attachments.length >= MAX_IMAGES}
				onclick={() => fileInput?.click()}
				class="flex cursor-pointer items-end border-b border-foreground p-2.5 outline-none disabled:cursor-default disabled:opacity-40"
				><svg
					xmlns="http://www.w3.org/2000/svg"
					height="20px"
					viewBox="0 0 24 24"
					fill="none"
					stroke="#d9d9d9"
					stroke-width="1.8"
					stroke-linecap="round"
					stroke-linejoin="round"
					><rect x="3" y="3" width="18" height="18" rx="3" /><circle
						cx="8.5"
						cy="8.5"
						r="1.5"
					/><path d="M21 15l-5-5L5 21" /></svg
				></button
			>
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
	{/if}
</div>
