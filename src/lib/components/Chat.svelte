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
	let fileInput: HTMLInputElement;
	let attachments: Attachment[] = [];
	let errorTimeout: ReturnType<typeof setTimeout>;
	let dragging = false;
	let dragDepth = 0;

	const MAX_IMAGES = 5;
	const MAX_BYTES = 10 * 1024 * 1024;
	const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|avif|bmp|ico|svg)$/i;

	type Attachment = { file: File; url: string };

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
			body.set('to', peer.username);
			body.set('content', text);
			for (const { file } of attachments) body.append('images', file);
			const res = await fetch('/api/messages', { method: 'POST', body });
			if (res.ok) {
				content = '';
				clearAttachments();
				await add([await res.json()], true);
			} else {
				error =
					res.status === 400
						? await res.text()
						: res.status === 413
						? 'Images are too big.'
						: 'Something went wrong.';
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
				class="flex max-w-[85%] flex-col gap-1.5 rounded-[10px] p-2.5 {mine
					? 'self-end bg-accent text-background'
					: 'self-start bg-white/10'}"
			>
				{#if message.images?.length}
					<div class="grid gap-1.5 {message.images.length > 1 ? 'grid-cols-2' : ''}">
						{#each message.images as image}
							<a
								class="flex justify-center overflow-hidden rounded-[5px] bg-black/20"
								href={image}
								target="_blank"
								rel="noopener noreferrer"
							>
								<img
									class={message.images.length > 1
										? 'aspect-square w-full object-cover'
										: 'max-h-[360px] max-w-full object-contain'}
									src={image}
									alt=""
									loading="lazy"
								/>
							</a>
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
				<p class="text-right text-[0.7rem] opacity-60">
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

	{#if attachments.length > 0}
		<div class="flex flex-wrap gap-2.5">
			{#each attachments as attachment (attachment.url)}
				<div class="relative size-16 overflow-hidden rounded-[5px] border border-line">
					<img class="size-full object-cover" src={attachment.url} alt="" />
					<button
						type="button"
						title="Remove"
						aria-label="Remove image"
						on:click={() => removeAttachment(attachment)}
						class="absolute top-0.5 right-0.5 flex size-5 cursor-pointer items-center justify-center rounded-full bg-background/80 text-[0.8rem] leading-none outline-none hover:bg-danger"
						>×</button
					>
				</div>
			{/each}
		</div>
	{/if}

	<form class="flex" on:submit|preventDefault={send} on:paste={onPaste}>
		<input
			bind:this={fileInput}
			on:change={onFilesSelected}
			type="file"
			accept="image/*"
			multiple
			hidden
		/>
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
			type="button"
			title="Attach images"
			aria-label="Attach images"
			disabled={attachments.length >= MAX_IMAGES}
			on:click={() => fileInput.click()}
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
				><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path
					d="M21 15l-5-5L5 21"
				/></svg
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
</div>
