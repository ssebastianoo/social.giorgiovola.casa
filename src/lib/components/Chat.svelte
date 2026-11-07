<script lang="ts">
	import { onMount, tick } from 'svelte';
	import Avatar from './Avatar.svelte';
	import LoadingScreen from './LoadingScreen.svelte';
	import QuoteCard from './QuoteCard.svelte';
	import { onRealtime } from '#lib/realtime.js';
	import { isMobile, user } from '#lib/store.js';
	import type {
		ChatMessage,
		ChatPeer,
		GroupChat,
		GroupMessage,
		MessageReaction,
		MessageReplyTo
	} from '#lib/types.js';
	import MentionInput from './MentionInput.svelte';
	import { splitMentions } from '#lib/mentions.js';
	import { profileHover } from '#lib/profileCard.svelte.js';
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
	/** messages on their way to the server, shown at the bottom until they land */
	let pending = $state<(Draft & { key: number; text: string })[]>([]);
	let pendingKey = 0;
	/** the visible height, which shrinks while the on-screen keyboard is open */
	let viewportHeight = $state<number | null>(null);
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
	const reactUrl = `${threadUrl}/reactions`;

	const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍'];
	// swiping a message this far to the right replies to it, like on WhatsApp
	const SWIPE_REPLY = 60;
	const SWIPE_MAX = 90;
	const LONG_PRESS_MS = 450;
	const DOUBLE_TAP_MS = 300;

	let replyingTo = $state<Message | null>(null);
	/** the message whose menu (reactions, reply, copy, delete) is open, and where to show it */
	let menu = $state<{
		message: Message;
		top: number;
		above: boolean;
		left: number;
		right: number;
		mine: boolean;
	} | null>(null);
	let menuEl = $state<HTMLDivElement>();
	/** the message whose reactions list (who reacted with what) is open, and where to show it */
	let reactors = $state<{
		id: number;
		top: number;
		above: boolean;
		left: number;
		right: number;
		mine: boolean;
	} | null>(null);
	let reactorsEl = $state<HTMLDivElement>();
	// follows the live reactions, so the list updates while it's open
	const reactorsOf = $derived(
		reactors ? messages.find((m) => m.id === reactors?.id)?.reactions ?? [] : []
	);
	/** the message being swiped, and how far */
	let swipe = $state<{ id: number; dx: number } | null>(null);
	/** briefly outlined after jumping to it from a reply */
	let highlighted = $state<number | null>(null);
	let highlightTimeout: ReturnType<typeof setTimeout>;

	const senderOf = (m: Message) => (typeof m.sender === 'string' ? m.sender : m.sender.username);
	const isMine = (m: Message) =>
		groupId !== null ? senderOf(m) === $user?.username : senderOf(m) !== peerUsername;
	/** a group event ("Alice added Bob"), shown as a line rather than a bubble */
	const isEvent = (m: Message): m is GroupMessage => 'kind' in m && m.kind !== 'message';

	const canWrite = $derived(!blockedByMe && !blockedByPeer);

	// created_at arrives as a string over JSON
	const dateOf = (m: Message) => new Date(m.created_at);
	const dayKey = (d: Date) => d.toDateString();
	/** a message starts a new day: it gets a separator above it */
	const startsDay = (index: number) =>
		index === 0 || dayKey(dateOf(messages[index])) !== dayKey(dateOf(messages[index - 1]));
	const timeOf = (m: Message) =>
		dateOf(m).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

	/** Today, Yesterday, a weekday within the week, else the date (with the year if not this one). */
	function dayLabel(d: Date) {
		const today = new Date();
		const midnight = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
		const days = Math.round((midnight(today) - midnight(d)) / 86_400_000);
		if (days === 0) return 'Today';
		if (days === 1) return 'Yesterday';
		if (days > 1 && days < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
		return d.toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'long',
			year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric'
		});
	}

	/** what a reply shows of a message: its text, or that it is a photo */
	const previewOf = (m: { content: string; images: number }) =>
		m.content || (m.images > 0 ? '📷 Photo' : '');
	const replyNameOf = (sender: MessageReplyTo['sender']) =>
		sender.username === $user?.username ? 'You' : sender.name;
	const authorNameOf = (m: Message) =>
		isMine(m) ? 'yourself' : typeof m.sender === 'string' ? peer?.name ?? m.sender : m.sender.name;

	/** group chats suggest their members for @mentions, direct chats search everyone */
	const mentionSource = $derived(
		group
			? (query: string) =>
					group.members.filter(
						(m) =>
							m.username !== $user?.username &&
							(m.username.startsWith(query) || m.name.toLowerCase().startsWith(query))
					)
			: undefined
	);

	/** reactions with the same emoji together, in the order they first appeared */
	function groupReactions(reactions: MessageReaction[]) {
		const byEmoji = new Map<string, MessageReaction[]>();
		for (const r of reactions) byEmoji.set(r.emoji, [...(byEmoji.get(r.emoji) ?? []), r]);
		return [...byEmoji].map(([emoji, by]) => ({
			emoji,
			by,
			mine: by.some((r) => r.username === $user?.username)
		}));
	}

	const myReaction = (m: Message) => m.reactions.find((r) => r.username === $user?.username);

	const setReactions = (id: number, reactions: MessageReaction[]) =>
		(messages = messages.map((m) => (m.id === id ? { ...m, reactions } : m)));

	/** Sets your reaction to a message; picking the one you already have takes it back. */
	async function react(message: Message, emoji: string) {
		menu = null;
		const me = $user;
		if (!me) return;
		const before = message.reactions;
		const removing = myReaction(message)?.emoji === emoji;
		const others = before.filter((r) => r.username !== me.username);
		// shown right away, the server's answer replaces it
		setReactions(
			message.id,
			removing
				? others
				: [...others, { emoji, username: me.username, name: me.name, avatar: me.avatar }]
		);
		try {
			const res = await fetch(reactUrl, {
				method: removing ? 'DELETE' : 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(removing ? { id: message.id } : { id: message.id, emoji })
			});
			if (res.ok) {
				setReactions(message.id, (await res.json()).reactions);
				return;
			}
			showError(
				res.status === 403 || res.status === 429 ? await res.text() : 'Something went wrong.'
			);
		} catch {
			showError('Could not reach the server, check your connection.');
		}
		setReactions(message.id, before);
	}

	function startReply(message: Message) {
		menu = null;
		if (!canWrite) return;
		replyingTo = message;
		textarea?.focus();
	}

	/** Scrolls to the message a reply answers, loading older pages until it shows up. */
	async function jumpTo(id: number) {
		let target = document.getElementById(`message-${id}`);
		for (let pages = 0; !target && hasMore && pages < 10; pages++) {
			await loadOlder();
			await tick();
			target = document.getElementById(`message-${id}`);
		}
		if (!target) return;
		target.scrollIntoView({ block: 'center', behavior: 'smooth' });
		highlighted = id;
		clearTimeout(highlightTimeout);
		highlightTimeout = setTimeout(() => (highlighted = null), 1500);
	}

	function openMenu(message: Message, el: HTMLElement) {
		reactors = null;
		const rect = el.getBoundingClientRect();
		// below the message when there is no room above it
		const above = rect.top > 180;
		menu = {
			message,
			top: above ? rect.top : rect.bottom,
			above,
			left: rect.left,
			right: window.innerWidth - rect.right,
			mine: isMine(message)
		};
	}

	function openReactors(message: Message, el: HTMLElement) {
		menu = null;
		if (reactors?.id === message.id) {
			reactors = null;
			return;
		}
		const rect = el.getBoundingClientRect();
		// above the pills when there is room for a few rows, else below them
		const above = rect.top > 240;
		reactors = {
			id: message.id,
			top: above ? rect.top : rect.bottom,
			above,
			left: rect.left,
			right: window.innerWidth - rect.right,
			mine: isMine(message)
		};
	}

	async function copyText(message: Message) {
		menu = null;
		try {
			await navigator.clipboard.writeText(message.content);
		} catch {
			showError('Could not copy the message.');
		}
	}

	// touch gestures on a message: swipe right to reply, long press for the menu, double tap for ❤️
	let gesture: {
		message: Message;
		el: HTMLElement;
		pointerId: number;
		x: number;
		y: number;
		moved: boolean;
		swiping: boolean;
		/** on a link, image or button, which keep their own taps */
		interactive: boolean;
	} | null = null;
	let pressTimer: ReturnType<typeof setTimeout>;
	let lastTap = { id: -1, time: 0 };
	// the click that ends a long press must not also open a link or an image
	let suppressClick = false;

	function onPointerDown(e: PointerEvent, message: Message) {
		suppressClick = false;
		if (e.pointerType === 'mouse' || !e.isPrimary || !canWrite) return;
		const el = e.currentTarget as HTMLElement;
		gesture = {
			message,
			el,
			pointerId: e.pointerId,
			x: e.clientX,
			y: e.clientY,
			moved: false,
			swiping: false,
			interactive: !!(e.target as Element).closest('a, button')
		};
		clearTimeout(pressTimer);
		pressTimer = setTimeout(() => {
			if (!gesture || gesture.moved) return;
			openMenu(gesture.message, gesture.el);
			navigator.vibrate?.(10);
			suppressClick = true;
			gesture = null;
		}, LONG_PRESS_MS);
	}

	function onPointerMove(e: PointerEvent) {
		if (!gesture || e.pointerId !== gesture.pointerId) return;
		const dx = e.clientX - gesture.x;
		const dy = e.clientY - gesture.y;
		if (!gesture.moved) {
			if (Math.hypot(dx, dy) < 8) return;
			gesture.moved = true;
			clearTimeout(pressTimer);
			// mostly sideways and to the right; anything else is the list scrolling
			gesture.swiping = dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.5;
			if (!gesture.swiping) {
				gesture = null;
				return;
			}
			gesture.el.setPointerCapture(e.pointerId);
		}
		const pulled = Math.max(0, dx);
		// past the threshold it resists, so it's clear that letting go now replies
		const next = Math.min(
			SWIPE_MAX,
			pulled < SWIPE_REPLY ? pulled : SWIPE_REPLY + (pulled - SWIPE_REPLY) * 0.3
		);
		if ((swipe?.dx ?? 0) < SWIPE_REPLY && next >= SWIPE_REPLY) navigator.vibrate?.(10);
		swipe = { id: gesture.message.id, dx: next };
	}

	function onPointerEnd(e: PointerEvent) {
		clearTimeout(pressTimer);
		if (!gesture || e.pointerId !== gesture.pointerId) return;
		const g = gesture;
		gesture = null;
		if (g.swiping) {
			if (e.type === 'pointerup' && (swipe?.dx ?? 0) >= SWIPE_REPLY) startReply(g.message);
			swipe = null;
			return;
		}
		if (e.type !== 'pointerup' || g.moved || g.interactive) return;
		const now = Date.now();
		if (lastTap.id === g.message.id && now - lastTap.time < DOUBLE_TAP_MS) {
			lastTap = { id: -1, time: 0 };
			// like Instagram, a double tap only ever adds the heart
			if (myReaction(g.message)?.emoji !== '❤️') react(g.message, '❤️');
		} else lastTap = { id: g.message.id, time: now };
	}

	function onWindowPointerDown(e: PointerEvent) {
		const target = e.target as Element;
		if (menu && !menuEl?.contains(target)) menu = null;
		// the pills toggle the list themselves
		if (reactors && !reactorsEl?.contains(target) && !target.closest?.('[data-reactions]'))
			reactors = null;
	}

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
		menu = null;
		reactors = null;
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

	function remove(id: number) {
		messages = messages
			.filter((m) => m.id !== id)
			.map((m) => (m.reply_to?.id === id ? { ...m, reply_to: null } : m));
		if (replyingTo?.id === id) replyingTo = null;
		if (menu?.message.id === id) menu = null;
		if (reactors?.id === id) reactors = null;
	}

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

	type Draft = { content: string; replyingTo: Message | null; attachments: Attachment[] };

	// messages go out one at a time, in order, while the input is already free for the next one
	let outbox = Promise.resolve();

	async function send() {
		const text = content.trim();
		if (!text && attachments.length === 0) return;
		const draft: Draft = { content, replyingTo, attachments };
		// cleared right away, so the next message can be typed while this one is on its way
		content = '';
		replyingTo = null;
		attachments = [];
		error = null;
		resetTyping(typingTarget);
		const key = pendingKey++;
		pending = [...pending, { ...draft, key, text }];
		outbox = outbox.then(() => post(draft, text, key));
		await tick();
		scrollToBottom();
	}

	async function post(draft: Draft, text: string, key: number) {
		const settle = () => (pending = pending.filter((p) => p.key !== key));
		try {
			const body = new FormData();
			if (groupId === null) body.set('to', peerUsername);
			body.set('content', text);
			if (draft.replyingTo) body.set('reply_to', String(draft.replyingTo.id));
			for (const { file } of draft.attachments) body.append('images', file);
			const res = await fetch(sendUrl, { method: 'POST', body });
			if (res.ok) {
				const message = await res.json();
				settle();
				// the pending bubble showed these until now
				for (const a of draft.attachments) URL.revokeObjectURL(a.url);
				await add([message], true);
				return;
			}
			showError(
				res.status === 400 || res.status === 403 || res.status === 429
					? await res.text()
					: res.status === 413
					? 'Images are too big.'
					: 'Something went wrong.'
			);
		} catch {
			showError('Could not send the message, check your connection.');
		}
		settle();
		// give back what didn't go out, without overwriting what was typed since
		if (!content.trim()) content = draft.content;
		attachments = [...draft.attachments, ...attachments];
		if (!replyingTo && draft.replyingTo && messages.some((m) => m.id === draft.replyingTo?.id))
			replyingTo = draft.replyingTo;
	}

	/**
	 * Tapping a button moves focus off the textarea, which closes the on-screen keyboard (and the
	 * send button reopened it right after). Cancelling the mousedown keeps the focus where it is.
	 */
	function keepFocus(e: MouseEvent) {
		if (document.activeElement === textarea) e.preventDefault();
	}

	// whether the last pointer was a finger: mouse users keep selecting text in the list
	let touching = false;
	function keepFocusOnTouch(e: MouseEvent) {
		// images open the viewer and links navigate: the keyboard can go there
		if (touching && !(e.target as Element).closest('a, img')) keepFocus(e);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && replyingTo) {
			e.preventDefault();
			replyingTo = null;
			return;
		}
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

		// fit the chat to what's visible above the keyboard: iOS (and Android without
		// interactive-widget) only shrink the visual viewport, leaving the input under the keyboard
		const vv = window.visualViewport;
		const fit = () => {
			// pinch zoom also shrinks it, and must stay free to pan
			if (!vv || vv.scale > 1.01) return;
			viewportHeight = vv.height;
			// the browser scrolls the page to show the focused input; the chat now fits, undo that
			if (window.scrollY !== 0) window.scrollTo(0, 0);
		};
		fit();
		vv?.addEventListener('resize', fit);
		vv?.addEventListener('scroll', fit);
		// the list shrinks when the keyboard opens, the input grows or a bar (reply, typing,
		// attachments) shows up: keep the latest message in view if it was
		const resizes = new ResizeObserver(() => {
			if (stick) scrollToBottom();
		});
		resizes.observe(list);
		const onPointer = (e: PointerEvent) => (touching = e.pointerType !== 'mouse');
		window.addEventListener('pointerdown', onPointer, true);
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
						}),
						onRealtime('group_message_reactions', ({ group_id, id, reactions }) => {
							if (group_id === groupId) setReactions(id, reactions);
						})
				  ]
				: [
						onRealtime('message', async (message) => {
							if (message.sender !== peerUsername && message.recipient !== peerUsername) return;
							await add([message]);
							if (message.sender === peerUsername) markRead();
						}),
						onRealtime('message_deleted', ({ id }) => remove(id)),
						// ids are unique across conversations: only a message shown here is updated
						onRealtime('message_reactions', ({ id, reactions }) => setReactions(id, reactions))
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
			vv?.removeEventListener('resize', fit);
			vv?.removeEventListener('scroll', fit);
			resizes.disconnect();
			window.removeEventListener('pointerdown', onPointer, true);
			clearTimeout(errorTimeout);
			clearTimeout(highlightTimeout);
			clearTimeout(pressTimer);
			clearAttachments();
		};
	});
</script>

<svelte:window
	onpointerdown={onWindowPointerDown}
	onresize={() => {
		menu = null;
		reactors = null;
	}}
	onkeydown={(e) => {
		if (e.key === 'Escape' && menu) menu = null;
		if (e.key === 'Escape' && reactors) reactors = null;
	}}
/>

{#if menu}
	{@const current = menu.message}
	{@const mineEmoji = myReaction(current)?.emoji}
	<div
		bind:this={menuEl}
		role="menu"
		onmousedown={keepFocus}
		tabindex="-1"
		class="fixed z-50 flex flex-col gap-[5px] rounded-[5px] border border-accent bg-background p-[5px]"
		style:top={`${menu.top}px`}
		style:left={menu.mine ? undefined : `${menu.left}px`}
		style:right={menu.mine ? `${menu.right}px` : undefined}
		style:transform={menu.above ? 'translateY(calc(-100% - 5px))' : 'translateY(5px)'}
	>
		<div class="flex gap-[2px]">
			{#each QUICK_REACTIONS as emoji}
				<button
					type="button"
					role="menuitem"
					class="flex size-9 cursor-pointer items-center justify-center rounded-[5px] text-[1.3em] outline-none hover:bg-white/10 focus-visible:bg-white/10 {mineEmoji ===
					emoji
						? 'bg-accent/30'
						: ''}"
					aria-label={mineEmoji === emoji ? `Remove ${emoji}` : `React with ${emoji}`}
					onclick={() => react(current, emoji)}>{emoji}</button
				>
			{/each}
		</div>
		<div class="flex flex-col border-t border-line pt-[5px] text-[0.9em]">
			<button
				type="button"
				role="menuitem"
				class="cursor-pointer rounded-[5px] px-2.5 py-[5px] text-left outline-none hover:bg-white/5"
				onclick={() => startReply(current)}>Reply</button
			>
			{#if current.content}
				<button
					type="button"
					role="menuitem"
					class="cursor-pointer rounded-[5px] px-2.5 py-[5px] text-left outline-none hover:bg-white/5"
					onclick={() => copyText(current)}>Copy</button
				>
			{/if}
			{#if menu.mine}
				<button
					type="button"
					role="menuitem"
					class="cursor-pointer rounded-[5px] px-2.5 py-[5px] text-left text-danger outline-none hover:bg-white/5"
					onclick={() => {
						menu = null;
						deleteMessage(current);
					}}>Delete</button
				>
			{/if}
		</div>
	</div>
{/if}

{#if reactors && reactorsOf.length > 0}
	{@const current = messages.find((m) => m.id === reactors?.id)}
	<div
		bind:this={reactorsEl}
		role="dialog"
		tabindex="-1"
		onmousedown={keepFocus}
		aria-label="Reactions"
		class="fixed z-50 flex max-h-60 w-64 max-w-[calc(100vw-20px)] flex-col overflow-y-auto rounded-[5px] border border-accent bg-background p-[5px]"
		style:top={`${reactors.top}px`}
		style:left={reactors.mine ? undefined : `${reactors.left}px`}
		style:right={reactors.mine ? `${reactors.right}px` : undefined}
		style:transform={reactors.above ? 'translateY(calc(-100% - 5px))' : 'translateY(5px)'}
	>
		{#each reactorsOf as reaction (reaction.username)}
			{@const yours = reaction.username === $user?.username}
			{#if yours && canWrite && current}
				<button
					type="button"
					class="flex cursor-pointer items-center gap-2.5 rounded-[5px] p-[5px] text-left outline-none hover:bg-white/5 focus-visible:bg-white/5"
					aria-label={`Remove your ${reaction.emoji}`}
					onclick={() => {
						reactors = null;
						react(current, reaction.emoji);
					}}
				>
					<Avatar user={reaction} size={32} clickable={false} />
					<span class="flex min-w-0 flex-1 flex-col">
						<span class="truncate font-bold">You</span>
						<span class="truncate text-[0.85em] text-muted">Tap to remove</span>
					</span>
					<span class="text-[1.3em]">{reaction.emoji}</span>
				</button>
			{:else}
				<a
					class="flex items-center gap-2.5 rounded-[5px] p-[5px] text-inherit outline-none hover:bg-white/5 hover:no-underline focus-visible:bg-white/5"
					href={`/@${reaction.username}`}
				>
					<Avatar user={reaction} size={32} clickable={false} />
					<span class="flex min-w-0 flex-1 flex-col">
						<span class="truncate font-bold">{yours ? 'You' : reaction.name}</span>
						<span class="truncate text-[0.85em] opacity-70">@{reaction.username}</span>
					</span>
					<span class="text-[1.3em]">{reaction.emoji}</span>
				</a>
			{/if}
		{/each}
	</div>
{/if}

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
<div
	class="flex h-[calc(100dvh-120px)] flex-col gap-2.5"
	style:height={viewportHeight ? `${viewportHeight - 120}px` : undefined}
>
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

	<!-- svelte-ignore a11y_no_noninteractive_element_interactions (only keeps the keyboard open) -->
	<div
		class="flex min-h-0 flex-1 flex-col gap-1.5 overflow-x-hidden overflow-y-auto overscroll-contain"
		bind:this={list}
		onscroll={onScroll}
		onmousedown={keepFocusOnTouch}
		role="log"
		onloadcapture={onMediaLoad}
	>
		{#each messages as message, index (message.id)}
			{@const mine = isMine(message)}
			{@const author = typeof message.sender === 'string' ? null : message.sender}
			{@const newDay = startsDay(index)}
			{#if newDay}
				<div class="my-1.5 flex items-center gap-2.5 text-[0.8em] text-muted">
					<hr aria-hidden="true" class="flex-1 border-line" />
					<span class="font-bold">{dayLabel(dateOf(message))}</span>
					<hr aria-hidden="true" class="flex-1 border-line" />
				</div>
			{/if}
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
				{#if author && !mine && (newDay || isEvent(messages[index - 1]) || senderOf(messages[index - 1]) !== author.username)}
					<div class="mt-1.5 flex items-center gap-[5px] self-start">
						<Avatar user={author} size={24} />
						<a class="text-[0.8em] font-bold text-inherit" href={`/@${author.username}`}
							>{author.name}</a
						>
					</div>
				{/if}
				{@const swiped = swipe?.id === message.id ? swipe.dx : 0}
				<div
					id={`message-${message.id}`}
					class="group/row relative flex max-w-[85%] flex-col {mine
						? 'items-end self-end'
						: 'items-start self-start'}"
				>
					{#if swiped > 0}
						<!-- the reply arrow uncovered by swiping, solid once letting go replies -->
						<svg
							class="absolute top-1/2 -translate-y-1/2"
							style:left={`${Math.min(swiped, SWIPE_REPLY) / 2 - 10}px`}
							style:opacity={Math.min(1, swiped / SWIPE_REPLY)}
							xmlns="http://www.w3.org/2000/svg"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 5 5v6" /></svg
						>
					{/if}
					<div
						class="flex max-w-full touch-pan-y items-center gap-[5px] {mine
							? 'flex-row-reverse'
							: ''} {swiped > 0 ? '' : 'transition-transform duration-150'}"
						style:transform={swiped > 0 ? `translateX(${swiped}px)` : undefined}
						onpointerdown={(e) => onPointerDown(e, message)}
						onpointermove={onPointerMove}
						onpointerup={onPointerEnd}
						onpointercancel={onPointerEnd}
						onclickcapture={(e) => {
							if (!suppressClick) return;
							suppressClick = false;
							e.preventDefault();
							e.stopPropagation();
						}}
						oncontextmenu={(e) => {
							// a long press opens the message menu instead
							if (gesture || suppressClick) e.preventDefault();
						}}
						role="group"
					>
						<div
							class="flex min-w-0 flex-col gap-1.5 rounded-[10px] p-2.5 outline-offset-2 pointer-coarse:select-none [-webkit-touch-callout:none] {mine
								? 'bg-accent text-background'
								: 'bg-white/10'} {highlighted === message.id ? 'outline-2 outline-foreground' : ''}"
						>
							{#if message.reply_to}
								{@const reply = message.reply_to}
								<button
									type="button"
									class="flex min-w-0 cursor-pointer flex-col rounded-[5px] border-l-2 px-2.5 py-[5px] text-left text-[0.85em] outline-none {mine
										? 'border-background/60 bg-black/15'
										: 'border-accent bg-black/30'}"
									title="Go to the message"
									onclick={() => jumpTo(reply.id)}
								>
									<span class="font-bold">{replyNameOf(reply.sender)}</span>
									<span class="line-clamp-2 wrap-anywhere opacity-80">{previewOf(reply)}</span>
								</button>
							{/if}
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
												draggable="false"
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
											>{:else}{#each splitMentions(part) as piece}{#if typeof piece === 'string'}{piece}{:else}<a
														class="font-bold {mine
															? 'text-inherit'
															: ''} {piece.username.toLowerCase() === $user?.username
															? 'rounded-[5px] bg-accent/25 px-[2px]'
															: ''}"
														href={`/@${piece.username}`}
														use:profileHover={piece.username.toLowerCase()}>@{piece.username}</a
													>{/if}{/each}{/if}{/each}
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
								<!-- the day is on the separator, the full date on hover -->
								<time
									class="opacity-60"
									datetime={dateOf(message).toISOString()}
									title={dateOf(message).toLocaleString()}>{timeOf(message)}</time
								>
							</div>
						</div>
						{#if canWrite}
							<!-- with a mouse: react and reply next to the message, on hover -->
							<div
								class="flex shrink-0 items-center opacity-0 group-hover/row:opacity-100 focus-within:opacity-100 pointer-coarse:hidden"
							>
								<button
									type="button"
									class="flex size-8 cursor-pointer items-center justify-center rounded-full opacity-70 outline-none hover:bg-white/10 hover:opacity-100"
									aria-label="React"
									title="React"
									onclick={(e) => {
										const bubble = e.currentTarget.parentElement?.previousElementSibling;
										if (bubble instanceof HTMLElement) openMenu(message, bubble);
									}}
									><svg
										xmlns="http://www.w3.org/2000/svg"
										width="18"
										height="18"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><path
											d="M9 9h.01"
										/><path d="M15 9h.01" /></svg
									></button
								>
								<button
									type="button"
									class="flex size-8 cursor-pointer items-center justify-center rounded-full opacity-70 outline-none hover:bg-white/10 hover:opacity-100"
									aria-label="Reply"
									title="Reply"
									onclick={() => startReply(message)}
									><svg
										xmlns="http://www.w3.org/2000/svg"
										width="18"
										height="18"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 5 5v6" /></svg
									></button
								>
							</div>
						{/if}
					</div>
					{#if message.reactions.length > 0}
						<div class="relative z-1 -mt-2 flex flex-wrap gap-[5px] px-2.5" data-reactions>
							{#each groupReactions(message.reactions) as reaction (reaction.emoji)}
								<button
									type="button"
									class="flex cursor-pointer items-center gap-[3px] rounded-full border bg-background px-1.5 text-[0.8em] leading-6 outline-none {reaction.mine
										? 'border-accent'
										: 'border-line'}"
									title={reaction.by.map((r) => r.name).join(', ')}
									aria-label={`${reaction.emoji} ${reaction.by.length}, see who reacted`}
									aria-expanded={reactors?.id === message.id}
									onclick={(e) => {
										const row = e.currentTarget.parentElement;
										if (row) openReactors(message, row);
									}}
									>{reaction.emoji}{#if reaction.by.length > 1}<span class="text-muted"
											>{reaction.by.length}</span
										>{/if}</button
								>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		{:else}
			{#if pending.length === 0}
				<p class="m-auto text-center text-muted">Say hi to {group?.name ?? peer?.name}.</p>
			{/if}
		{/each}
		{#each pending as draft (draft.key)}
			<!-- on its way: dimmed, with the loading mark where the time goes -->
			<div class="flex max-w-[85%] flex-col items-end self-end opacity-70" aria-busy="true">
				<div class="flex min-w-0 flex-col gap-1.5 rounded-[10px] bg-accent p-2.5 text-background">
					{#if draft.replyingTo}
						<div
							class="flex min-w-0 flex-col rounded-[5px] border-l-2 border-background/60 bg-black/15 px-2.5 py-[5px] text-[0.85em]"
						>
							<span class="font-bold"
								>{isMine(draft.replyingTo) ? 'You' : authorNameOf(draft.replyingTo)}</span
							>
							<span class="line-clamp-2 wrap-anywhere opacity-80"
								>{previewOf({
									content: draft.replyingTo.content,
									images: draft.replyingTo.images?.length ?? 0
								})}</span
							>
						</div>
					{/if}
					{#if draft.attachments.length}
						<div class="grid gap-1.5 {draft.attachments.length > 1 ? 'grid-cols-2' : ''}">
							{#each draft.attachments as attachment (attachment.url)}
								<img
									class="rounded-[5px] {draft.attachments.length > 1
										? 'aspect-square w-full object-cover'
										: 'max-h-[360px] max-w-full object-contain'}"
									src={attachment.url}
									alt=""
									draggable="false"
								/>
							{/each}
						</div>
					{/if}
					{#if draft.text}
						<p class="wrap-anywhere whitespace-pre-wrap">{draft.text}</p>
					{/if}
					<div class="flex justify-end">
						<LoadingScreen size={14} />
					</div>
				</div>
			</div>
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
						onmousedown={keepFocus}
						onclick={() => removeAttachment(attachment)}
						class="absolute top-0.5 right-0.5 flex size-5 cursor-pointer items-center justify-center rounded-full bg-background/80 text-[0.8rem] leading-none outline-none hover:bg-danger"
						>×</button
					>
				</div>
			{/each}
		</div>
	{/if}

	{#if replyingTo && canWrite}
		<div
			class="flex items-center gap-2.5 border-l-2 border-accent pl-2.5"
			role="presentation"
			onmousedown={keepFocus}
		>
			<button
				type="button"
				class="min-w-0 flex-1 cursor-pointer text-left text-[0.85em] outline-none"
				title="Go to the message"
				onclick={() => replyingTo && jumpTo(replyingTo.id)}
			>
				<p class="font-bold">Replying to {authorNameOf(replyingTo)}</p>
				<p class="truncate text-muted">
					{previewOf({ content: replyingTo.content, images: replyingTo.images?.length ?? 0 })}
				</p>
			</button>
			<button
				type="button"
				class="cursor-pointer px-2.5 text-[1.2em] leading-none opacity-70 outline-none hover:opacity-100"
				aria-label="Cancel reply"
				title="Cancel reply"
				onclick={() => (replyingTo = null)}>×</button
			>
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
			<MentionInput
				bind:value={content}
				bind:element={textarea}
				name=""
				placeholder="Write a message"
				label="Write a message"
				maxHeight="max-h-32"
				placement="above"
				source={mentionSource}
				onkeydown={onKeydown}
				oninput={onInput}
			/>
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
				aria-label="Send"
				class="flex cursor-pointer items-end border-b border-foreground p-2.5 outline-none"
				onmousedown={keepFocus}
				><svg fill="#d9d9d9" xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 512 512"
					><!--! Font Awesome Free 6.4.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2023 Fonticons, Inc. --><path
						d="M16.1 260.2c-22.6 12.9-20.5 47.3 3.6 57.3L160 376V479.3c0 18.1 14.6 32.7 32.7 32.7c9.7 0 18.9-4.3 25.1-11.8l62-74.3 123.9 51.6c18.9 7.9 40.8-4.5 43.9-24.7l64-416c1.9-12.1-3.4-24.3-13.5-31.2s-23.3-7.5-34-1.4l-448 256zm52.1 25.5L409.7 90.6 190.1 336l1.2 1L68.2 285.7zM403.3 425.4L236.7 355.9 450.8 116.6 403.3 425.4z"
					/></svg
				></button
			>
		</form>
	{/if}
</div>
