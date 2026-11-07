import { and, asc, desc, eq, gt, inArray, lt, ne, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db, blocks, group_chats, group_members, group_messages, users } from './db/index.js';
import type {
	ChatPeer,
	GroupChat,
	GroupConversation,
	GroupMessage,
	GroupMessageKind
} from '#lib/types.js';
import { groupEventText } from '#lib/groupEvents.js';
import { linkedPosts } from './linkedPosts.js';
import { withRepliesAndReactions } from './messageReactions.js';
import { hit, isLimited } from './ratelimit.js';
import { LIMITS, USERNAME_RE } from './validation.js';

const THREAD_PAGE = 30;
const PREVIEW_LENGTH = 200;
// avatars shown for a group in the conversation list
const LIST_MEMBERS = 3;

type Member = ChatPeer & { id: number };

/** A group with the ids the server needs; `toGroupChat` is what its members get to see. */
export type GroupState = {
	id: number;
	name: string;
	/** who can remove members: see `effectiveOwner` */
	ownerId: number | null;
	/** longest standing first */
	members: Member[];
};

export function parseGroupName(raw: unknown): { name: string } | { error: string } {
	const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
	if (!name || name.length > LIMITS.groupName)
		return { error: `Group names must be between 1 and ${LIMITS.groupName} characters` };
	return { name };
}

// creating, renaming and changing members, per profile
const MANAGE_WINDOW_MS = 60_000;
const MAX_MANAGE = 30;
const CREATE_WINDOW_MS = 60 * 60_000;
const MAX_CREATE = 10;

function limited(key: string, max: number, windowMs: number): Response | null {
	if (isLimited(key, max)) {
		return new Response('You are doing that too often, try again later', { status: 429 });
	}
	hit(key, windowMs);
	return null;
}

export const manageLimited = (userId: number) =>
	limited(`group-manage:${userId}`, MAX_MANAGE, MANAGE_WINDOW_MS);
export const createLimited = (userId: number) =>
	limited(`group-create:${userId}`, MAX_CREATE, CREATE_WINDOW_MS);

/** A list of usernames from a request body: lowercased, without "@" and duplicates. */
export function parseUsernames(raw: unknown): string[] | null {
	if (!Array.isArray(raw) || raw.length > LIMITS.groupMembers) return null;
	const names = raw.map((u) =>
		typeof u === 'string' ? u.trim().replace(/^@/, '').toLowerCase() : ''
	);
	if (names.some((u) => !USERNAME_RE.test(u))) return null;
	return [...new Set(names)];
}

/**
 * Who `meId` may bring into a group, by username: existing profiles that aren't bots and with no
 * block either way. Returns their ids, or the error to send back.
 */
export async function resolveNewMembers(
	meId: number,
	usernames: string[]
): Promise<number[] | Response> {
	const found = await findProfiles(usernames);
	const missing = usernames.find((u) => !found.some((f) => f.username === u));
	if (missing) return new Response(`User not found: @${missing}`, { status: 404 });
	const bot = found.find((f) => f.bot);
	if (bot) return new Response(`Bots can't join group chats (@${bot.username})`, { status: 400 });
	const blocked = await blockedAmong(
		meId,
		found.map((f) => f.id)
	);
	const refused = found.find((f) => blocked.has(f.id));
	if (refused) return new Response(`You can't add @${refused.username}`, { status: 403 });
	return found.map((f) => f.id).filter((id) => id !== meId);
}

export const toGroupChat = (group: GroupState): GroupChat => ({
	id: group.id,
	name: group.name,
	owner: group.members.find((m) => m.id === group.ownerId)?.username ?? null,
	members: group.members.map(({ username, name, avatar }) => ({ username, name, avatar }))
});

/** What makes a group message unread for `userId`: sent by someone else after its last read. */
const unreadFor = (userId: number) =>
	and(
		gt(group_messages.id, group_members.last_read_id),
		ne(group_messages.sender_id, userId),
		// events (someone joined, left…) never count
		eq(group_messages.kind, 'message')
	);

export async function isGroupMuted(groupId: number, userId: number) {
	const [row] = await db
		.select({ muted: group_members.muted })
		.from(group_members)
		.where(and(eq(group_members.group_id, groupId), eq(group_members.user_id, userId)));
	return row?.muted ?? false;
}

export async function setGroupMuted(groupId: number, userId: number, muted: boolean) {
	await db
		.update(group_members)
		.set({ muted })
		.where(and(eq(group_members.group_id, groupId), eq(group_members.user_id, userId)));
}

/** Unread group messages of a profile over all its groups. */
export async function unreadGroupCount(userId: number) {
	const [row] = await db
		.select({ count: sql<number>`COUNT(*)::int` })
		.from(group_messages)
		.innerJoin(
			group_members,
			and(eq(group_members.group_id, group_messages.group_id), eq(group_members.user_id, userId))
		)
		// muted groups stay out of the badge
		.where(and(unreadFor(userId), eq(group_members.muted, false)));
	return row?.count ?? 0;
}

async function loadMembers(groupId: number): Promise<Member[]> {
	return db
		.select({ id: users.id, username: users.username, name: users.name, avatar: users.avatar })
		.from(group_members)
		.innerJoin(users, eq(users.id, group_members.user_id))
		.where(eq(group_members.group_id, groupId))
		.orderBy(asc(group_members.joined_at), asc(users.id));
}

/** The group, or null when it doesn't exist or `userId` isn't a member: the two look the same. */
export async function getGroup(groupId: number, userId: number): Promise<GroupState | null> {
	const [group] = await db
		.select({ id: group_chats.id, name: group_chats.name, owner_id: group_chats.owner_id })
		.from(group_chats)
		.where(eq(group_chats.id, groupId));
	if (!group) return null;
	const members = await loadMembers(groupId);
	if (!members.some((m) => m.id === userId)) return null;
	// the owner's profile was deleted: the longest standing member takes over
	const ownerId = members.some((m) => m.id === group.owner_id)
		? group.owner_id
		: members[0]?.id ?? null;
	return { id: group.id, name: group.name, ownerId, members };
}

export async function memberIds(groupId: number) {
	const rows = await db
		.select({ id: group_members.user_id })
		.from(group_members)
		.where(eq(group_members.group_id, groupId));
	return rows.map((r) => r.id);
}

/** Profiles by username, with what decides whether they can join a group. */
export async function findProfiles(usernames: string[]) {
	if (usernames.length === 0) return [];
	return db
		.select({ id: users.id, username: users.username, bot: users.bot })
		.from(users)
		.where(inArray(users.username, usernames));
}

/** The profiles among `ids` that `meId` blocked or that blocked `meId`. */
export async function blockedAmong(meId: number, ids: number[]) {
	if (ids.length === 0) return new Set<number>();
	const rows = await db
		.select({ blocker_id: blocks.blocker_id, blocked_id: blocks.blocked_id })
		.from(blocks)
		.where(
			or(
				and(eq(blocks.blocker_id, meId), inArray(blocks.blocked_id, ids)),
				and(eq(blocks.blocked_id, meId), inArray(blocks.blocker_id, ids))
			)
		);
	return new Set(rows.map((r) => (r.blocker_id === meId ? r.blocked_id : r.blocker_id)));
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** An event shown in the chat: someone joined, left, renamed the group… */
type GroupEvent = {
	kind: Exclude<GroupMessageKind, 'message'>;
	sender_id: number;
	target_id?: number;
	content?: string;
};

async function insertEvents(tx: Tx, groupId: number, events: GroupEvent[]) {
	if (events.length === 0) return [];
	const rows = await tx
		.insert(group_messages)
		.values(events.map((e) => ({ group_id: groupId, content: '', ...e })))
		.returning({ id: group_messages.id });
	return rows.map((r) => r.id);
}

/** Creates a group with its "created" event; returns its id and the event. */
export async function createGroup(ownerId: number, name: string, others: number[]) {
	const { id, eventIds } = await db.transaction(async (tx) => {
		const [group] = await tx
			.insert(group_chats)
			.values({ name, owner_id: ownerId })
			.returning({ id: group_chats.id });
		await tx
			.insert(group_members)
			.values([ownerId, ...others].map((user_id) => ({ group_id: group.id, user_id })));
		const eventIds = await insertEvents(tx, group.id, [
			{ kind: 'created', sender_id: ownerId, content: name }
		]);
		return { id: group.id, eventIds };
	});
	return { id, events: await loadMessages(eventIds) };
}

/**
 * `actorId` adds members, up to the size limit; returns who was actually added and the events
 * to show. Newcomers can read the history but it isn't unread for them.
 */
export async function addMembers(
	groupId: number,
	actorId: number,
	ids: number[]
): Promise<{ added: number[]; events: GroupMessage[] } | { error: string }> {
	type Added = { added: number[]; eventIds: number[] } | { error: string };
	const result = await db.transaction(async (tx): Promise<Added> => {
		// one add at a time per group, so concurrent ones can't go over the limit together
		await tx
			.select({ id: group_chats.id })
			.from(group_chats)
			.where(eq(group_chats.id, groupId))
			.for('update');
		const current = await tx
			.select({ id: group_members.user_id })
			.from(group_members)
			.where(eq(group_members.group_id, groupId));
		const fresh = ids.filter((id) => !current.some((m) => m.id === id));
		if (fresh.length === 0) return { added: [], eventIds: [] };
		if (current.length + fresh.length > LIMITS.groupMembers)
			return { error: `Groups can have at most ${LIMITS.groupMembers} members` };
		// the "added" events come first, so they are part of the history newcomers have read
		const eventIds = await insertEvents(
			tx,
			groupId,
			fresh.map((target_id) => ({ kind: 'added', sender_id: actorId, target_id }))
		);
		const latest = sql`(SELECT COALESCE(MAX(${group_messages.id}), 0) FROM ${group_messages} WHERE ${group_messages.group_id} = ${groupId})`;
		await tx
			.insert(group_members)
			.values(fresh.map((user_id) => ({ group_id: groupId, user_id, last_read_id: latest })))
			.onConflictDoNothing();
		return { added: fresh, eventIds };
	});
	if ('error' in result) return result;
	return { added: result.added, events: await loadMessages(result.eventIds) };
}

/**
 * `actorId` removes a member, or leaves when it is themselves. The owner leaving passes the group
 * on to the longest standing member; the last one leaving deletes it, and returns its images so
 * they can be removed from disk.
 */
export async function removeMember(groupId: number, actorId: number, userId: number) {
	const result = await db.transaction(async (tx) => {
		const nothing = {
			removed: false,
			deleted: false,
			images: [] as string[],
			eventIds: [] as number[]
		};
		const [group] = await tx
			.select({ owner_id: group_chats.owner_id })
			.from(group_chats)
			.where(eq(group_chats.id, groupId))
			.for('update');
		if (!group) return nothing;
		const removed = await tx
			.delete(group_members)
			.where(and(eq(group_members.group_id, groupId), eq(group_members.user_id, userId)))
			.returning({ id: group_members.user_id });
		if (removed.length === 0) return nothing;

		const [next] = await tx
			.select({ id: group_members.user_id })
			.from(group_members)
			.where(eq(group_members.group_id, groupId))
			.orderBy(asc(group_members.joined_at), asc(group_members.user_id))
			.limit(1);
		if (!next) {
			const withImages = await tx
				.select({ images: group_messages.images })
				.from(group_messages)
				.where(
					and(eq(group_messages.group_id, groupId), sql`CARDINALITY(${group_messages.images}) > 0`)
				);
			await tx.delete(group_chats).where(eq(group_chats.id, groupId));
			const images = withImages.flatMap((m) => m.images);
			return { ...nothing, removed: true, deleted: true, images };
		}
		const events: GroupEvent[] = [
			actorId === userId
				? { kind: 'left', sender_id: userId }
				: { kind: 'removed', sender_id: actorId, target_id: userId }
		];
		if (group.owner_id === userId || group.owner_id === null) {
			await tx.update(group_chats).set({ owner_id: next.id }).where(eq(group_chats.id, groupId));
			if (group.owner_id === userId) events.push({ kind: 'owner', sender_id: next.id });
		}
		return { ...nothing, removed: true, eventIds: await insertEvents(tx, groupId, events) };
	});
	const { eventIds, ...rest } = result;
	return { ...rest, events: await loadMessages(eventIds) };
}

/** Renames the group; returns the "renamed" event. */
export async function renameGroup(groupId: number, actorId: number, name: string) {
	const eventIds = await db.transaction(async (tx) => {
		await tx.update(group_chats).set({ name }).where(eq(group_chats.id, groupId));
		return insertEvents(tx, groupId, [{ kind: 'renamed', sender_id: actorId, content: name }]);
	});
	return loadMessages(eventIds);
}

const target = alias(users, 'target');

/** Group messages matching `where`, newest first, with their sender and target. */
function selectMessages(where: SQL | undefined) {
	return db
		.select({
			id: group_messages.id,
			group_id: group_messages.group_id,
			kind: group_messages.kind,
			content: group_messages.content,
			images: group_messages.images,
			reply_to_id: group_messages.reply_to_id,
			created_at: group_messages.created_at,
			username: users.username,
			name: users.name,
			avatar: users.avatar,
			target_username: target.username,
			target_name: target.name,
			target_avatar: target.avatar
		})
		.from(group_messages)
		.innerJoin(users, eq(users.id, group_messages.sender_id))
		.leftJoin(target, eq(target.id, group_messages.target_id))
		.where(where)
		.orderBy(desc(group_messages.id));
}

type MessageRow = Awaited<ReturnType<typeof selectMessages>>[number];

async function toGroupMessages(rows: MessageRow[]): Promise<GroupMessage[]> {
	// events carry a group name as content, not something to link
	const [linked, extras] = await Promise.all([
		linkedPosts(rows.map((r) => (r.kind === 'message' ? r.content : ''))),
		withRepliesAndReactions('group', rows)
	]);
	return rows.map((r, i) => ({
		id: r.id,
		group_id: r.group_id,
		kind: r.kind,
		sender: { username: r.username, name: r.name, avatar: r.avatar },
		target:
			r.target_username !== null && r.target_name !== null
				? { username: r.target_username, name: r.target_name, avatar: r.target_avatar }
				: null,
		content: r.content,
		images: r.images,
		created_at: r.created_at,
		linked_post: linked[i],
		reply_to: extras[i].reply_to,
		reactions: extras[i].reactions
	}));
}

/** These messages, oldest first. */
async function loadMessages(ids: number[]) {
	if (ids.length === 0) return [];
	return toGroupMessages((await selectMessages(inArray(group_messages.id, ids))).reverse());
}

/** A page of a group's messages, oldest first: the latest ones, or the ones before `before`. */
export async function getGroupThread(groupId: number, before?: number | null) {
	const rows = await selectMessages(
		and(
			eq(group_messages.group_id, groupId),
			before != null ? lt(group_messages.id, before) : undefined
		)
	).limit(THREAD_PAGE + 1);
	return {
		hasMore: rows.length > THREAD_PAGE,
		messages: await toGroupMessages(rows.slice(0, THREAD_PAGE).reverse())
	};
}

/** Sends a message; `replyTo` must be a message of this group (see isGroupMessage). */
export async function sendGroupMessage(
	groupId: number,
	sender: Member,
	content: string,
	images: string[] = [],
	replyTo: number | null = null
): Promise<GroupMessage> {
	const [row] = await db
		.insert(group_messages)
		.values({ group_id: groupId, sender_id: sender.id, content, images, reply_to_id: replyTo })
		.returning({ id: group_messages.id });
	const [message] = await loadMessages([row.id]);
	return message;
}

/** Deletes a message, only if `senderId` wrote it in this group. Events can't be deleted. */
export async function deleteGroupMessage(groupId: number, senderId: number, id: number) {
	const [row] = await db
		.delete(group_messages)
		.where(
			and(
				eq(group_messages.id, id),
				eq(group_messages.group_id, groupId),
				eq(group_messages.sender_id, senderId),
				eq(group_messages.kind, 'message')
			)
		)
		.returning({ images: group_messages.images });
	return row ?? null;
}

/** Marks the whole group as read for this member; returns whether anything changed. */
export async function markGroupRead(groupId: number, userId: number) {
	const latest = sql`(SELECT COALESCE(MAX(${group_messages.id}), 0) FROM ${group_messages} WHERE ${group_messages.group_id} = ${groupId})`;
	const updated = await db
		.update(group_members)
		.set({ last_read_id: latest })
		.where(
			and(
				eq(group_members.group_id, groupId),
				eq(group_members.user_id, userId),
				lt(group_members.last_read_id, latest)
			)
		)
		.returning({ id: group_members.user_id });
	return updated.length > 0;
}

/** The user's groups for the conversation list, most recent activity first. */
export async function getGroupConversations(userId: number): Promise<GroupConversation[]> {
	const groups = await db
		.select({
			id: group_chats.id,
			name: group_chats.name,
			created_at: group_chats.created_at,
			last_read_id: group_members.last_read_id,
			muted: group_members.muted
		})
		.from(group_members)
		.innerJoin(group_chats, eq(group_chats.id, group_members.group_id))
		.where(eq(group_members.user_id, userId));
	if (groups.length === 0) return [];
	const ids = groups.map((g) => g.id);

	const [latest, unread, members] = await Promise.all([
		db
			.selectDistinctOn([group_messages.group_id], {
				group_id: group_messages.group_id,
				kind: group_messages.kind,
				sender_id: group_messages.sender_id,
				sender_username: users.username,
				sender_name: users.name,
				target_username: target.username,
				target_name: target.name,
				content: sql<string>`LEFT(${group_messages.content}, ${PREVIEW_LENGTH})`,
				images: sql<number>`CARDINALITY(${group_messages.images})`,
				created_at: group_messages.created_at
			})
			.from(group_messages)
			.innerJoin(users, eq(users.id, group_messages.sender_id))
			.leftJoin(target, eq(target.id, group_messages.target_id))
			.where(inArray(group_messages.group_id, ids))
			.orderBy(group_messages.group_id, desc(group_messages.id)),
		db
			.select({ group_id: group_messages.group_id, count: sql<number>`COUNT(*)::int` })
			.from(group_messages)
			.innerJoin(
				group_members,
				and(eq(group_members.group_id, group_messages.group_id), eq(group_members.user_id, userId))
			)
			.where(unreadFor(userId))
			.groupBy(group_messages.group_id),
		db
			.select({
				group_id: group_members.group_id,
				id: users.id,
				username: users.username,
				name: users.name,
				avatar: users.avatar
			})
			.from(group_members)
			.innerJoin(users, eq(users.id, group_members.user_id))
			.where(inArray(group_members.group_id, ids))
			.orderBy(asc(group_members.joined_at), asc(users.id))
	]);
	const me = members.find((m) => m.id === userId)?.username;

	return groups
		.map((g): GroupConversation => {
			const last = latest.find((l) => l.group_id === g.id);
			const all = members.filter((m) => m.group_id === g.id);
			const event = !!last && last.kind !== 'message';
			let preview = '';
			if (last && event) {
				const target =
					last.target_username !== null && last.target_name !== null
						? { username: last.target_username, name: last.target_name }
						: null;
				const sender = { username: last.sender_username, name: last.sender_name };
				preview = groupEventText({ kind: last.kind, sender, target, content: last.content }, me);
			} else if (last) preview = last.content || (last.images > 0 ? '📷 Photo' : '');
			return {
				group: {
					id: g.id,
					name: g.name,
					members: all
						.filter((m) => m.id !== userId)
						.slice(0, LIST_MEMBERS)
						.map(({ username, name, avatar }) => ({ username, name, avatar })),
					size: all.length
				},
				preview,
				event,
				sender: last ? last.sender_name : null,
				mine: last?.sender_id === userId,
				created_at: last?.created_at ?? g.created_at,
				unread: unread.find((u) => u.group_id === g.id)?.count ?? 0,
				muted: g.muted
			};
		})
		.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}
