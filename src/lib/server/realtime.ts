import { sql } from './db';
import { getPosts } from './posts';

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

const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

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
	const res = await sql`SELECT COUNT(*)::int AS count FROM inbox WHERE user_id = ${userId} AND read_at IS NULL`;
	return res[0].count;
}

async function sendUnreadCount(client: Client) {
	if (client.userId === null) return;
	try {
		client.send(frame('notifications', { count: await unreadCount(client.userId) }));
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

/** A post was created: tell everyone, and update the parent's reply count and the inbox. */
export async function publishPost(postId: number) {
	try {
		const [post] = await getPosts({ postId });
		if (!post) return;
		broadcast('post', post);
		if (post.reply_to) {
			const parent = await sql`SELECT COUNT(*)::int AS count FROM posts WHERE reply_to = ${post.reply_to.id}`;
			broadcast('counts', { id: post.reply_to.id, replies_count: parent[0].count });
		}
		// the inbox triggers already ran: notify whoever received something from this post
		const inbox = await sql`SELECT DISTINCT user_id FROM inbox WHERE post_id = ${postId}`;
		await pushUnread(inbox.map((r) => r.user_id));
	} catch (e) {
		console.error('realtime: publishPost failed', e);
	}
}

export function publishDeleted(postId: number, replyTo: number | null) {
	broadcast('post_deleted', { id: postId });
	if (replyTo !== null) {
		sql`SELECT COUNT(*)::int AS count FROM posts WHERE reply_to = ${replyTo}`
			.then((r) => broadcast('counts', { id: replyTo, replies_count: r[0].count }))
			.catch((e) => console.error('realtime: publishDeleted failed', e));
	}
}

export async function publishLikes(postId: number, ownerId: number | null) {
	try {
		const res = await sql`SELECT COUNT(*)::int AS count FROM likes WHERE post_id = ${postId}`;
		broadcast('counts', { id: postId, likes: res[0].count });
		await pushUnread([ownerId]);
	} catch (e) {
		console.error('realtime: publishLikes failed', e);
	}
}
