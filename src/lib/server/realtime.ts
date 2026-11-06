import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { db, follows, inbox, likes, posts } from './db/index.js';
import { unreadMessageCount } from './messages';
import { getPosts } from './posts';
import { sendFollowPush, sendMessagePush, sendPush } from './push';
import type { ChatMessage, Post } from '#lib/types.js';

/**
 * In-process hub for server-sent events. One instance per server process, so this assumes a
 * single node/bun process (as in docker-compose). Running several would need the hub backed by
 * something shared like Postgres LISTEN/NOTIFY.
 */

type Client = {
	userId: number | null;
	send: (chunk: string) => void;
};

const clients = new Set<Client>();
const encoder = new TextEncoder();
const HEARTBEAT_MS = 8000;

const frame = (event: string, data: unknown) =>
	`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/** An event stream body: `register` adds the client to a hub and returns how to remove it. */
function eventStream(
	signal: AbortSignal,
	register: (send: (chunk: string) => void, close: () => void) => () => void
) {
	let cleanup = () => {};
	return new ReadableStream<Uint8Array>({
		start(controller) {
			const send = (chunk: string) => {
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					cleanup();
				}
			};
			// comments keep proxies and the runtime's idle timeout from closing a quiet stream
			const heartbeat = setInterval(() => send(': ping\n\n'), HEARTBEAT_MS);
			let closed = false;
			send('retry: 3000\n\n');
			const unregister = register(send, () => cleanup());
			cleanup = () => {
				if (closed) return;
				closed = true;
				clearInterval(heartbeat);
				unregister();
				try {
					controller.close();
				} catch {
					// already closed
				}
			};
			signal.addEventListener('abort', cleanup);
			// the request may have gone away while the stream was being set up
			if (signal.aborted) cleanup();
		},
		cancel() {
			cleanup();
		}
	});
}

/** Registers a client; returns the stream body. */
export function openStream(userId: number | null, signal: AbortSignal) {
	return eventStream(signal, (send) => {
		const client: Client = { userId, send };
		clients.add(client);
		if (userId !== null) void sendUnreadCount(client);
		return () => clients.delete(client);
	});
}

type BotClient = {
	botId: number;
	/** matches a mention of the bot, like the mention trigger does */
	mention: RegExp;
	send: (chunk: string) => void;
	close: () => void;
};

const botClients = new Set<BotClient>();

/** The bot API stream: `mention` and `post` (by a followed profile) events. */
export function openBotStream(bot: { id: number; username: string }, signal: AbortSignal) {
	return eventStream(signal, (send, close) => {
		// usernames are [a-z0-9_], nothing to escape
		const client: BotClient = {
			botId: bot.id,
			mention: new RegExp(`@${bot.username}(\\s|$)`),
			send,
			close
		};
		botClients.add(client);
		send(frame('ready', { id: bot.id, username: bot.username }));
		return () => botClients.delete(client);
	});
}

/**
 * Ends the open streams of these bots. The token is only checked when a stream opens, so this
 * runs when it stops being valid: a new token, a deleted bot or a banned owner.
 */
export function closeBotStreams(botIds: number[]) {
	const ids = new Set(botIds);
	for (const client of [...botClients]) if (ids.has(client.botId)) client.close();
}

/** Whether a post mentions this bot or replies to one of its posts. */
export const mentionsBot = (
	post: Post,
	mention: RegExp,
	parentAuthor: number | null,
	botId: number
) => mention.test(post.content) || parentAuthor === botId;

async function publishToBots(post: Post) {
	if (botClients.size === 0) return;
	const authorId = (post.user as { id?: number }).id;
	const connected = [...new Set([...botClients].map((c) => c.botId))];
	const [followers, parent] = await Promise.all([
		authorId
			? db
					.select({ id: follows.follower_id })
					.from(follows)
					.where(and(eq(follows.followed_id, authorId), inArray(follows.follower_id, connected)))
			: [],
		post.reply_to
			? db.select({ user_id: posts.user_id }).from(posts).where(eq(posts.id, post.reply_to.id))
			: []
	]);
	const following = new Set(followers.map((f) => f.id));
	const parentAuthor = parent[0]?.user_id ?? null;
	for (const client of [...botClients]) {
		if (client.botId === authorId) continue;
		if (mentionsBot(post, client.mention, parentAuthor, client.botId))
			client.send(frame('mention', post));
		if (following.has(client.botId)) client.send(frame('post', post));
	}
}

async function unreadCount(userId: number): Promise<number> {
	return db.$count(inbox, and(eq(inbox.user_id, userId), isNull(inbox.read_at)));
}

async function sendUnreadCount(client: Client) {
	if (client.userId === null) return;
	try {
		client.send(frame('notifications', { count: await unreadCount(client.userId) }));
		client.send(frame('messages_unread', { count: await unreadMessageCount(client.userId) }));
	} catch (e) {
		console.error('realtime: unread count failed', e);
	}
}

/** Sends an event to everyone connected. Payloads must be safe for anonymous viewers. */
export function broadcast(event: string, data: unknown) {
	if (clients.size === 0) return;
	const chunk = frame(event, data);
	for (const client of [...clients]) client.send(chunk);
}

/** Pushes the fresh unread count to the connected streams of these users. */
export async function pushUnread(userIds: Iterable<number | null>) {
	const targets = new Set([...userIds].filter((id): id is number => id !== null));
	for (const id of targets) {
		const watching = [...clients].filter((c) => c.userId === id);
		if (watching.length === 0) continue;
		const chunk = frame('notifications', { count: await unreadCount(id) });
		for (const client of watching) client.send(chunk);
	}
}

/** Pushes the fresh unread message count to the connected streams of this user. */
export async function pushUnreadMessages(userId: number) {
	const watching = [...clients].filter((c) => c.userId === userId);
	if (watching.length === 0) return;
	const chunk = frame('messages_unread', { count: await unreadMessageCount(userId) });
	for (const client of watching) client.send(chunk);
}

/** A direct message was sent: only its two participants may ever receive it. */
export async function publishMessage(
	message: ChatMessage,
	senderId: number,
	recipientId: number,
	senderName: string
) {
	try {
		const chunk = frame('message', message);
		for (const client of [...clients]) {
			if (client.userId === senderId || client.userId === recipientId) client.send(chunk);
		}
		await pushUnreadMessages(recipientId);
		await sendMessagePush(recipientId, message, senderName);
	} catch (e) {
		console.error('realtime: publishMessage failed', e);
	}
}

/** A direct message was deleted: drop it from both participants' screens. */
export async function publishMessageDeleted(id: number, senderId: number, recipientId: number) {
	try {
		const chunk = frame('message_deleted', { id });
		for (const client of [...clients]) {
			if (client.userId === senderId || client.userId === recipientId) client.send(chunk);
		}
		// it may have been unread
		await pushUnreadMessages(recipientId);
	} catch (e) {
		console.error('realtime: publishMessageDeleted failed', e);
	}
}

/** A post was created: tell everyone, and update the parent's reply count and the inbox. */
export async function publishPost(postId: number) {
	try {
		const [post] = await getPosts({ postId });
		if (!post) return;
		broadcast('post', post);
		void publishToBots(post).catch((e) => console.error('realtime: publishToBots failed', e));
		if (post.reply_to) {
			const replies_count = await db.$count(posts, eq(posts.reply_to, post.reply_to.id));
			broadcast('counts', { id: post.reply_to.id, replies_count });
		}
		// the inbox triggers already ran: notify whoever received something from this post
		const received = await db
			.selectDistinct({ user_id: inbox.user_id })
			.from(inbox)
			.where(eq(inbox.post_id, postId));
		await pushUnread(received.map((r) => r.user_id));
		await sendPush(postId);
	} catch (e) {
		console.error('realtime: publishPost failed', e);
	}
}

export function publishDeleted(postId: number, replyTo: number | null) {
	broadcast('post_deleted', { id: postId });
	if (replyTo !== null) {
		db.$count(posts, eq(posts.reply_to, replyTo))
			.then((replies_count) => broadcast('counts', { id: replyTo, replies_count }))
			.catch((e) => console.error('realtime: publishDeleted failed', e));
	}
}

export async function publishLikes(postId: number, ownerId: number | null, total?: number) {
	try {
		total ??= await db.$count(likes, eq(likes.post_id, postId));
		broadcast('counts', { id: postId, likes: total });
		// the like may also have made this reply ratio its parent (see the notify_like trigger)
		const ratios = await db
			.selectDistinct({ user_id: inbox.user_id })
			.from(inbox)
			.where(
				and(
					eq(inbox.post_id, postId),
					inArray(inbox.type, ['ratio', 'ratioed_by_you']),
					gt(inbox.created_at, sql`NOW() - INTERVAL '1 minute'`)
				)
			);
		await pushUnread([ownerId, ...ratios.map((r) => r.user_id)]);
		await sendPush(postId, ['like', 'ratio', 'ratioed_by_you']);
	} catch (e) {
		console.error('realtime: publishLikes failed', e);
	}
}

/** A profile got a new follower: update its badge and send the push. */
export async function publishFollow(followerId: number, followedId: number) {
	try {
		await pushUnread([followedId]);
		await sendFollowPush(followerId, followedId);
	} catch (e) {
		console.error('realtime: publishFollow failed', e);
	}
}
