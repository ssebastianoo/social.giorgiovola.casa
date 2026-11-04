import { and, eq, isNull } from 'drizzle-orm';
import { db, inbox, likes, posts } from './db/index.js';
import { unreadMessageCount } from './messages';
import { getPosts } from './posts';
import { sendMessagePush, sendPush } from './push';
import type { ChatMessage } from '#lib/types.js';

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

/** Registers a client; returns the stream body and a cleanup. */
export function openStream(userId: number | null, signal: AbortSignal) {
	let cleanup = () => {};
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			const client: Client = {
				userId,
				send: (chunk) => {
					try {
						controller.enqueue(encoder.encode(chunk));
					} catch {
						cleanup();
					}
				}
			};
			// comments keep proxies and the runtime's idle timeout from closing a quiet stream
			const heartbeat = setInterval(() => client.send(': ping\n\n'), HEARTBEAT_MS);
			let closed = false;
			cleanup = () => {
				if (closed) return;
				closed = true;
				clearInterval(heartbeat);
				clients.delete(client);
				try {
					controller.close();
				} catch {
					// already closed
				}
			};
			signal.addEventListener('abort', cleanup);
			clients.add(client);
			client.send('retry: 3000\n\n');
			if (userId !== null) void sendUnreadCount(client);
		},
		cancel() {
			cleanup();
		}
	});
	return body;
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

/** A post was created: tell everyone, and update the parent's reply count and the inbox. */
export async function publishPost(postId: number) {
	try {
		const [post] = await getPosts({ postId });
		if (!post) return;
		broadcast('post', post);
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

export async function publishLikes(postId: number, ownerId: number | null) {
	try {
		const total = await db.$count(likes, eq(likes.post_id, postId));
		broadcast('counts', { id: postId, likes: total });
		await pushUnread([ownerId]);
		await sendPush(postId, 'like');
	} catch (e) {
		console.error('realtime: publishLikes failed', e);
	}
}
