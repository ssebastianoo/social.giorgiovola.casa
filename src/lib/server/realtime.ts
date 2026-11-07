import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { db, follows, inbox, likes, posts, users } from './db/index.js';
import { unreadMessageCount } from './messages';
import { getPosts } from './posts';
import { sendFollowPush, sendGroupMessagePush, sendMessagePush, sendPush } from './push';
import type { ChatMessage, GroupMessage, MessageReaction, Post } from '#lib/types.js';

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

/**
 * The bot API stream: `mention`, `post` (by a followed profile), `message` (DM) and
 * `group_message` (in a group the bot is in) events.
 */
export function openBotStream(bot: { id: number; username: string }, signal: AbortSignal) {
	return eventStream(signal, (send, close) => {
		// usernames are [a-z0-9_], nothing to escape. same rule as MENTION_RE (#lib/mentions.ts)
		const client: BotClient = {
			botId: bot.id,
			mention: new RegExp(`(?<![a-zA-Z0-9_@/])@${bot.username}(?![a-zA-Z0-9_])`),
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
 * runs when it stops being valid (a new token, a deleted bot or a banned owner) and when the
 * bot is renamed, so its mentions are matched against the new username.
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
		// a bot hears about what it receives, not about what it sent itself
		for (const client of [...botClients]) {
			if (client.botId === recipientId) client.send(chunk);
		}
		await pushUnreadMessages(recipientId);
		await sendMessagePush(recipientId, senderId, message, senderName);
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

/** The reactions to a direct message changed: only its two participants see them. */
export function publishMessageReactions(
	id: number,
	reactions: MessageReaction[],
	participants: [number, number]
) {
	sendTo(participants, 'message_reactions', { id, reactions });
}

/** The reactions to a group message changed: only the group's members see them. */
export function publishGroupMessageReactions(
	groupId: number,
	id: number,
	reactions: MessageReaction[],
	members: number[]
) {
	sendTo(members, 'group_message_reactions', { group_id: groupId, id, reactions });
}

/** Sends an event to the connected streams of these profiles only. */
function sendTo(userIds: number[], event: string, data: unknown) {
	const targets = new Set(userIds);
	const chunk = frame(event, data);
	for (const client of [...clients]) {
		if (client.userId !== null && targets.has(client.userId)) client.send(chunk);
	}
}

/** Sends a chunk to the open streams of these bots, if any of them is one. */
function sendToBots(userIds: number[], chunk: string) {
	if (botClients.size === 0) return;
	const targets = new Set(userIds);
	for (const client of [...botClients]) if (targets.has(client.botId)) client.send(chunk);
}

/**
 * Someone is writing a message: in a direct conversation (`groupId` null) to `recipients`' only
 * member, else in that group. Sent to the web streams only: bots don't get typing events.
 */
export function publishTyping(
	from: { id: number; username: string; name: string },
	recipients: number[],
	groupId: number | null
) {
	sendTo(
		recipients.filter((id) => id !== from.id),
		'typing',
		{ group_id: groupId, user: { username: from.username, name: from.name } }
	);
}

/** A group message was sent: only the group's current members may receive it. */
export async function publishGroupMessage(
	message: GroupMessage,
	senderId: number,
	members: number[],
	groupName: string
) {
	try {
		sendTo(members, 'group_message', message);
		const others = members.filter((id) => id !== senderId);
		// like for direct messages, a bot doesn't hear back what it sent
		sendToBots(others, frame('group_message', message));
		for (const id of others) await pushUnreadMessages(id);
		await sendGroupMessagePush(others, message, groupName);
	} catch (e) {
		console.error('realtime: publishGroupMessage failed', e);
	}
}

/** A group message was deleted: drop it from the members' screens. */
export async function publishGroupMessageDeleted(groupId: number, id: number, members: number[]) {
	try {
		sendTo(members, 'group_message_deleted', { group_id: groupId, id });
		// it may have been unread
		for (const id of members) await pushUnreadMessages(id);
	} catch (e) {
		console.error('realtime: publishGroupMessageDeleted failed', e);
	}
}

/**
 * A group was renamed or its members changed: `members` is everyone affected, removed members
 * included, so their screens drop it. `events` are the lines this added to the chat ("Alice
 * added Bob"); they are never unread and send no push, but unread counts may have changed.
 */
export async function publishGroupUpdated(
	groupId: number,
	members: number[],
	events: GroupMessage[] = []
) {
	try {
		for (const event of events) {
			sendTo(members, 'group_message', event);
			// bots learn this way that they were added to (or removed from) a group
			sendToBots(members, frame('group_message', event));
		}
		sendTo(members, 'group_updated', { id: groupId });
		for (const id of members) await pushUnreadMessages(id);
	} catch (e) {
		console.error('realtime: publishGroupUpdated failed', e);
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
		if (post.quote && !('deleted' in post.quote)) await publishQuotes(post.quote.id);
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

/** The quote count of a post changed. */
async function publishQuotes(postId: number) {
	const quotes = await db.$count(posts, eq(posts.quote_of, postId));
	broadcast('counts', { id: postId, quotes });
}

export function publishDeleted(postId: number, replyTo: number | null, quoteOf: number | null) {
	broadcast('post_deleted', { id: postId });
	if (replyTo !== null) {
		db.$count(posts, eq(posts.reply_to, replyTo))
			.then((replies_count) => broadcast('counts', { id: replyTo, replies_count }))
			.catch((e) => console.error('realtime: publishDeleted failed', e));
	}
	if (quoteOf !== null)
		publishQuotes(quoteOf).catch((e) => console.error('realtime: publishDeleted failed', e));
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

/**
 * A post's regiorgs changed: update its count everywhere. When `regiorgerId` regiorged it just
 * now, the post goes out with who regiorged it (for followers' feeds) and its author is notified.
 */
export async function publishRegiorg(
	postId: number,
	ownerId: number | null,
	total: number,
	regiorgerId: number | null
) {
	try {
		broadcast('counts', { id: postId, regiorgs: total });
		if (regiorgerId === null) return;
		const [[post], [regiorger]] = await Promise.all([
			getPosts({ postId }),
			db
				.select({ username: users.username, name: users.name })
				.from(users)
				.where(eq(users.id, regiorgerId))
		]);
		if (post && regiorger) broadcast('regiorg', { ...post, regiorged_by: regiorger });
		// the trigger created the notification (not for regiorging your own post)
		await pushUnread([ownerId]);
		await sendPush(postId, ['regiorg']);
	} catch (e) {
		console.error('realtime: publishRegiorg failed', e);
	}
}

/** Someone voted in the poll of a post: its fresh vote counts, in option order. */
export function publishPollVotes(postId: number, votes: number[]) {
	broadcast('poll', { id: postId, votes });
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
