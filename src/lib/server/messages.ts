import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db, blocks, messages, users } from './db/index.js';
import type { ChatMessage, ChatPeer, Conversation } from '#lib/types.js';
import { linkedPosts } from './linkedPosts.js';

const THREAD_PAGE = 30;
const PREVIEW_LENGTH = 200;

type Party = { id: number; username: string };

const between = (a: number, b: number) =>
	or(
		and(eq(messages.sender_id, a), eq(messages.recipient_id, b)),
		and(eq(messages.sender_id, b), eq(messages.recipient_id, a))
	);

export function unreadMessageCount(userId: number) {
	return db.$count(messages, and(eq(messages.recipient_id, userId), isNull(messages.read_at)));
}

/** Who blocked whom between two profiles: `me` if I did, `peer` if they did. */
export async function getBlock(
	meId: number,
	peerId: number
): Promise<{ me: boolean; peer: boolean }> {
	const rows = await db
		.select({ blocker_id: blocks.blocker_id })
		.from(blocks)
		.where(
			or(
				and(eq(blocks.blocker_id, meId), eq(blocks.blocked_id, peerId)),
				and(eq(blocks.blocker_id, peerId), eq(blocks.blocked_id, meId))
			)
		);
	return {
		me: rows.some((r) => r.blocker_id === meId),
		peer: rows.some((r) => r.blocker_id === peerId)
	};
}

export async function setBlocked(meId: number, peerId: number, blocked: boolean) {
	if (blocked) {
		await db.insert(blocks).values({ blocker_id: meId, blocked_id: peerId }).onConflictDoNothing();
	} else {
		await db.delete(blocks).where(and(eq(blocks.blocker_id, meId), eq(blocks.blocked_id, peerId)));
	}
}

export async function findPeer(username: string): Promise<(ChatPeer & Party) | null> {
	const [peer] = await db
		.select({ id: users.id, username: users.username, name: users.name, avatar: users.avatar })
		.from(users)
		.where(eq(users.username, username.toLowerCase()));
	return peer ?? null;
}

type Row = { id: number; content: string; images: string[]; created_at: Date };

const toChatMessage = (row: Row, sender: string, recipient: string) => ({
	id: row.id,
	sender,
	recipient,
	content: row.content,
	images: row.images,
	created_at: row.created_at
});

/** Fills `linked_post` with the post each message links to, if any. */
async function withLinkedPosts(found: Omit<ChatMessage, 'linked_post'>[]): Promise<ChatMessage[]> {
	const linked = await linkedPosts(found.map((m) => m.content));
	return found.map((m, i) => ({ ...m, linked_post: linked[i] }));
}

/** A page of a conversation, oldest first: the latest messages, or the ones before `before`. */
export async function getThread(me: Party, peer: Party, before?: number | null) {
	const rows = await db
		.select({
			id: messages.id,
			sender_id: messages.sender_id,
			content: messages.content,
			images: messages.images,
			created_at: messages.created_at
		})
		.from(messages)
		.where(and(between(me.id, peer.id), before != null ? lt(messages.id, before) : undefined))
		.orderBy(desc(messages.id))
		.limit(THREAD_PAGE + 1);

	return {
		hasMore: rows.length > THREAD_PAGE,
		messages: await withLinkedPosts(
			rows
				.slice(0, THREAD_PAGE)
				.reverse()
				.map((row) =>
					row.sender_id === me.id
						? toChatMessage(row, me.username, peer.username)
						: toChatMessage(row, peer.username, me.username)
				)
		)
	};
}

type ListOptions = { afterId: number | null; limit: number };

/**
 * A conversation for the bot API, oldest first: the messages after `afterId`, or the latest
 * ones when it isn't given.
 */
export async function getThreadFrom(me: Party, peer: Party, { afterId, limit }: ListOptions) {
	const rows = await db
		.select({
			id: messages.id,
			sender_id: messages.sender_id,
			content: messages.content,
			images: messages.images,
			created_at: messages.created_at
		})
		.from(messages)
		.where(and(between(me.id, peer.id), afterId !== null ? gt(messages.id, afterId) : undefined))
		.orderBy(afterId === null ? desc(messages.id) : asc(messages.id))
		.limit(limit);
	if (afterId === null) rows.reverse();
	return withLinkedPosts(
		rows.map((row) =>
			row.sender_id === me.id
				? toChatMessage(row, me.username, peer.username)
				: toChatMessage(row, peer.username, me.username)
		)
	);
}

/** Messages received by a profile from anyone, oldest first, like `getThreadFrom`. */
export async function getReceived(me: Party, { afterId, limit }: ListOptions) {
	const rows = await db
		.select({
			id: messages.id,
			sender: users.username,
			content: messages.content,
			images: messages.images,
			created_at: messages.created_at
		})
		.from(messages)
		.innerJoin(users, eq(users.id, messages.sender_id))
		.where(
			and(eq(messages.recipient_id, me.id), afterId !== null ? gt(messages.id, afterId) : undefined)
		)
		.orderBy(afterId === null ? desc(messages.id) : asc(messages.id))
		.limit(limit);
	if (afterId === null) rows.reverse();
	return withLinkedPosts(rows.map((row) => toChatMessage(row, row.sender, me.username)));
}

export async function sendMessage(
	me: Party,
	peer: Party,
	content: string,
	images: string[] = []
): Promise<ChatMessage> {
	const [row] = await db
		.insert(messages)
		.values({ sender_id: me.id, recipient_id: peer.id, content, images })
		.returning({ id: messages.id, created_at: messages.created_at });
	const [message] = await withLinkedPosts([
		{ ...row, sender: me.username, recipient: peer.username, content, images }
	]);
	return message;
}

/**
 * Deletes a message, only if `senderId` sent it. Returns the recipient and the images to remove
 * from disk, or null when there was nothing of theirs to delete.
 */
export async function deleteMessage(senderId: number, id: number) {
	const [row] = await db
		.delete(messages)
		.where(and(eq(messages.id, id), eq(messages.sender_id, senderId)))
		.returning({ recipient_id: messages.recipient_id, images: messages.images });
	return row ?? null;
}

/** Marks what `peerId` sent to `userId` as read; returns whether anything changed. */
export async function markThreadRead(userId: number, peerId: number) {
	const updated = await db
		.update(messages)
		.set({ read_at: sql`NOW()` })
		.where(
			and(
				eq(messages.recipient_id, userId),
				eq(messages.sender_id, peerId),
				isNull(messages.read_at)
			)
		)
		.returning({ id: messages.id });
	return updated.length > 0;
}

/** The user's conversations, most recent first. */
export async function getConversations(userId: number): Promise<Conversation[]> {
	// the pair of participants, in the same order whoever sent the message
	const low = sql`LEAST(${messages.sender_id}, ${messages.recipient_id})`;
	const high = sql`GREATEST(${messages.sender_id}, ${messages.recipient_id})`;
	const latest = await db
		.selectDistinctOn([low, high], {
			id: messages.id,
			sender_id: messages.sender_id,
			recipient_id: messages.recipient_id,
			content: sql<string>`LEFT(${messages.content}, ${PREVIEW_LENGTH})`,
			images: sql<number>`CARDINALITY(${messages.images})`,
			created_at: messages.created_at
		})
		.from(messages)
		.where(or(eq(messages.sender_id, userId), eq(messages.recipient_id, userId)))
		.orderBy(low, high, desc(messages.id));
	if (latest.length === 0) return [];

	const peerOf = (row: (typeof latest)[number]) =>
		row.sender_id === userId ? row.recipient_id : row.sender_id;

	const [peers, unread] = await Promise.all([
		db
			.select({ id: users.id, username: users.username, name: users.name, avatar: users.avatar })
			.from(users)
			.where(inArray(users.id, latest.map(peerOf))),
		db
			.select({ sender_id: messages.sender_id, count: sql<number>`COUNT(*)::int` })
			.from(messages)
			.where(and(eq(messages.recipient_id, userId), isNull(messages.read_at)))
			.groupBy(messages.sender_id)
	]);

	return latest
		.sort((a, b) => b.id - a.id)
		.flatMap((row) => {
			const peer = peers.find((p) => p.id === peerOf(row));
			if (!peer) return [];
			const { username, name, avatar } = peer;
			return [
				{
					peer: { username, name, avatar },
					preview: row.content || (row.images > 0 ? '📷 Photo' : ''),
					mine: row.sender_id === userId,
					created_at: row.created_at,
					unread: unread.find((u) => u.sender_id === peer.id)?.count ?? 0
				}
			];
		});
}
