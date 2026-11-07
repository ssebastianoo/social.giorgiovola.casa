import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import {
	db,
	group_message_reactions,
	group_messages,
	message_reactions,
	messages,
	users
} from './db/index.js';
import type { MessageReaction, MessageReplyTo } from '#lib/types.js';
import { hit, isLimited } from './ratelimit.js';

/** Replies and reactions, shared by direct and group messages. */

const REPLY_PREVIEW_LENGTH = 200;
const MAX_EMOJI_LENGTH = 16;

// reacting, per profile, over direct and group messages together
const REACT_WINDOW_MS = 60_000;
const MAX_REACTIONS = 60;

/** `direct`: messages between two profiles, `group`: messages of a group chat */
export type Thread = 'direct' | 'group';

const tableOf = (thread: Thread) => (thread === 'direct' ? messages : group_messages);
const reactionsTableOf = (thread: Thread) =>
	thread === 'direct' ? message_reactions : group_message_reactions;

/** A single emoji, or null. People can pick any emoji, not only the quick ones the app offers. */
export function parseEmoji(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const emoji = raw.trim();
	if (!emoji || emoji.length > MAX_EMOJI_LENGTH) return null;
	const graphemes = [...new Intl.Segmenter().segment(emoji)];
	if (graphemes.length !== 1) return null;
	return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(emoji) ? emoji : null;
}

/** The 429 to send back when this profile reacts too often, or null. Counts the reaction. */
export function reactionLimited(userId: number): Response | null {
	const key = `react:${userId}`;
	if (isLimited(key, MAX_REACTIONS)) {
		return new Response('You are reacting too fast, try again in a minute', { status: 429 });
	}
	hit(key, REACT_WINDOW_MS);
	return null;
}

/** The reactions to these messages, oldest first, by message id. */
export async function reactionsOf(thread: Thread, ids: number[]) {
	const byMessage = new Map<number, MessageReaction[]>();
	if (ids.length === 0) return byMessage;
	const table = reactionsTableOf(thread);
	const rows = await db
		.select({
			message_id: table.message_id,
			emoji: table.emoji,
			username: users.username,
			name: users.name
		})
		.from(table)
		.innerJoin(users, eq(users.id, table.user_id))
		.where(inArray(table.message_id, ids))
		.orderBy(asc(table.created_at), asc(table.user_id));
	for (const { message_id, ...reaction } of rows) {
		const list = byMessage.get(message_id);
		if (list) list.push(reaction);
		else byMessage.set(message_id, [reaction]);
	}
	return byMessage;
}

/** What replies show of these messages, by id. Deleted ones are missing. */
async function repliedTo(thread: Thread, ids: number[]) {
	const byId = new Map<number, MessageReplyTo>();
	if (ids.length === 0) return byId;
	const table = tableOf(thread);
	const rows = await db
		.select({
			id: table.id,
			username: users.username,
			name: users.name,
			content: sql<string>`LEFT(${table.content}, ${REPLY_PREVIEW_LENGTH})`,
			images: sql<number>`CARDINALITY(${table.images})::int`
		})
		.from(table)
		.innerJoin(users, eq(users.id, table.sender_id))
		.where(inArray(table.id, [...new Set(ids)]));
	for (const { id, username, name, content, images } of rows) {
		byId.set(id, { id, sender: { username, name }, content, images });
	}
	return byId;
}

/** Fills `reply_to` and `reactions` of these messages. */
export async function withRepliesAndReactions<T extends { id: number; reply_to_id: number | null }>(
	thread: Thread,
	found: T[]
): Promise<
	(Omit<T, 'reply_to_id'> & { reply_to: MessageReplyTo | null; reactions: MessageReaction[] })[]
> {
	const [replies, reactions] = await Promise.all([
		repliedTo(
			thread,
			found.flatMap((m) => (m.reply_to_id !== null ? [m.reply_to_id] : []))
		),
		reactionsOf(
			thread,
			found.map((m) => m.id)
		)
	]);
	return found.map(({ reply_to_id, ...m }) => ({
		...m,
		reply_to: reply_to_id !== null ? replies.get(reply_to_id) ?? null : null,
		reactions: reactions.get(m.id) ?? []
	}));
}

/**
 * Sets (or with a null emoji removes) this profile's reaction to a message, and returns the
 * message's reactions after the change.
 */
export async function setReaction(
	thread: Thread,
	messageId: number,
	userId: number,
	emoji: string | null
) {
	const table = reactionsTableOf(thread);
	if (emoji === null) {
		await db.delete(table).where(and(eq(table.message_id, messageId), eq(table.user_id, userId)));
	} else {
		// a new emoji replaces the old one and moves to the end, like a fresh reaction
		await db
			.insert(table)
			.values({ message_id: messageId, user_id: userId, emoji })
			.onConflictDoUpdate({
				target: [table.message_id, table.user_id],
				set: { emoji, created_at: sql`NOW()` }
			});
	}
	return (await reactionsOf(thread, [messageId])).get(messageId) ?? [];
}

/** The two participants of a direct message, if `userId` is one of them. */
export async function directMessageParties(messageId: number, userId: number) {
	const [row] = await db
		.select({ sender_id: messages.sender_id, recipient_id: messages.recipient_id })
		.from(messages)
		.where(
			and(
				eq(messages.id, messageId),
				or(eq(messages.sender_id, userId), eq(messages.recipient_id, userId))
			)
		);
	return row ?? null;
}

/** Whether `messageId` is a message (not an event) of this group: what replies and reactions accept. */
export async function isGroupMessage(groupId: number, messageId: number) {
	return (
		(await db.$count(
			group_messages,
			and(
				eq(group_messages.id, messageId),
				eq(group_messages.group_id, groupId),
				eq(group_messages.kind, 'message')
			)
		)) > 0
	);
}

/** Whether `messageId` is a message between these two profiles. */
export async function isDirectMessageBetween(messageId: number, a: number, b: number) {
	return (
		(await db.$count(
			messages,
			and(
				eq(messages.id, messageId),
				or(
					and(eq(messages.sender_id, a), eq(messages.recipient_id, b)),
					and(eq(messages.sender_id, b), eq(messages.recipient_id, a))
				)
			)
		)) > 0
	);
}
