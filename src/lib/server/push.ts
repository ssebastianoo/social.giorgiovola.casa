import webpush from 'web-push';
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db, inbox, posts, push_subscriptions, sessions, settings, users } from './db/index.js';
import { PUBLIC_URL } from '$app/env/public';
import type { ChatMessage, NotificationType } from '#lib/types.js';

/** Web push: sends a system notification to the browsers subscribed by the recipient's account(s). */

type Vapid = { publicKey: string; privateKey: string };

// The key pair is created once and kept in the database, so there is nothing to configure.
let vapid: Promise<Vapid> | null = null;

async function loadVapid(): Promise<Vapid> {
	const read = async () => {
		const rows = await db
			.select()
			.from(settings)
			.where(inArray(settings.key, ['vapid_public', 'vapid_private']));
		const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
		return map.vapid_public && map.vapid_private
			? { publicKey: map.vapid_public, privateKey: map.vapid_private }
			: null;
	};
	const existing = await read();
	if (existing) return existing;
	const keys = webpush.generateVAPIDKeys();
	// concurrent first uses: whoever inserts first wins, the others read it back
	await db
		.insert(settings)
		.values([
			{ key: 'vapid_public', value: keys.publicKey },
			{ key: 'vapid_private', value: keys.privateKey }
		])
		.onConflictDoNothing();
	const stored = await read();
	if (!stored) throw new Error('push: could not store the VAPID keys');
	return stored;
}

export function getVapid() {
	if (!vapid) {
		vapid = loadVapid().catch((e) => {
			vapid = null;
			throw e;
		});
	}
	return vapid;
}

// Subscriptions are only accepted from the real push services: the server POSTs to the stored
// endpoint, so an arbitrary URL would let a user make it call internal addresses.
const PUSH_HOSTS = [
	'fcm.googleapis.com',
	'push.services.mozilla.com',
	'push.apple.com',
	'notify.windows.com'
];

export function isPushEndpoint(value: unknown): value is string {
	if (typeof value !== 'string' || value.length > 2048) return false;
	try {
		const url = new URL(value);
		return (
			url.protocol === 'https:' &&
			!url.port &&
			!url.username &&
			PUSH_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))
		);
	} catch {
		return false;
	}
}

const subject = () =>
	PUBLIC_URL?.startsWith('https://') ? PUBLIC_URL : 'mailto:admin@example.com';

type Row = {
	type: NotificationType;
	post_id: number;
	content: string | null;
	sender_name: string | null;
	sender_username: string | null;
	recipient_username: string;
	identity: boolean;
	recipient_id: number;
};

/** Whether the notification's post belongs to the recipient (else to the sender). */
export const recipientOwnsPost = (type: NotificationType) =>
	type === 'like' || type === 'ratioed_by_you';

const clip = (text: string, max = 140) => (text.length > max ? `${text.slice(0, max)}…` : text);

function payloadFor(row: Row) {
	const sender = row.sender_name ?? 'Someone';
	const verbs: Record<NotificationType, string> = {
		like: 'liked your post',
		reply: 'replied to your post',
		mention: 'mentioned you in a post',
		ratio: 'ratioed your post',
		ratioed_by_you: 'got ratioed by your reply',
		// follows go through sendFollowPush
		follow: 'followed you'
	};
	const verb = verbs[row.type];
	let body = row.type === 'like' || !row.content ? verb : `${verb}: ${clip(row.content)}`;
	// identities share the devices of the accounts using them: say which profile it is for
	if (row.identity) body += ` (@${row.recipient_username})`;
	// the link matches the notifications page: likes and ratios won point at the recipient's own post
	const owner = recipientOwnsPost(row.type) ? row.recipient_username : row.sender_username;
	return {
		title: sender,
		body,
		url: owner ? `/@${owner}/${row.post_id}` : '/notifications',
		tag: `${row.type}:${row.post_id}`
	};
}

/**
 * Sends a notification to every browser subscribed by an account that can use this profile:
 * the account itself, or the owner of an identity and the accounts it is shared with.
 */
async function deliver(profileId: number, payload: object) {
	const keys = await getVapid();
	const options = {
		vapidDetails: { subject: subject(), ...keys },
		TTL: 60 * 60 * 24,
		urgency: 'normal' as const
	};
	const subs = await db
		.selectDistinctOn([push_subscriptions.endpoint], {
			endpoint: push_subscriptions.endpoint,
			p256dh: push_subscriptions.p256dh,
			auth: push_subscriptions.auth
		})
		.from(push_subscriptions)
		.innerJoin(sessions, eq(sessions.token, push_subscriptions.session_token))
		.where(
			sql`${sessions.user_id} IN (
				SELECT COALESCE(owner_id, id) FROM users WHERE id = ${profileId}
				UNION SELECT account_id FROM identity_members WHERE identity_id = ${profileId}
			)`
		);
	const message = JSON.stringify(payload);
	await Promise.all(
		subs.map(async (sub) => {
			try {
				await webpush.sendNotification(
					{ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
					message,
					options
				);
			} catch (e) {
				const status = (e as { statusCode?: number }).statusCode;
				// the browser dropped the subscription
				if (status === 404 || status === 410)
					await db.delete(push_subscriptions).where(eq(push_subscriptions.endpoint, sub.endpoint));
				else console.error('push: send failed', status ?? e);
			}
		})
	);
}

/** Notifies the recipient of a direct message. */
export async function sendMessagePush(
	recipientId: number,
	message: ChatMessage,
	senderName: string
) {
	try {
		const [recipient] = await db
			.select({ id: users.id, owner_id: users.owner_id })
			.from(users)
			.where(eq(users.id, recipientId));
		if (!recipient) return;
		let body = message.content ? clip(message.content) : '📷 Photo';
		// identities share the devices of the accounts using them: say which profile it is for
		if (recipient.owner_id !== null) body += ` (@${message.recipient})`;
		await deliver(recipient.id, {
			title: senderName,
			body,
			url: `/messages/${message.sender}`,
			tag: `message:${message.sender}:${message.recipient}`,
			// shown as a large picture where the platform supports it
			image: message.images[0]
		});
	} catch (e) {
		console.error('push: sendMessagePush failed', e);
	}
}

/** Notifies `followedId` of a new follower, once: the inbox row is claimed like in sendPush. */
export async function sendFollowPush(followerId: number, followedId: number) {
	try {
		const claimed = await db
			.update(inbox)
			.set({ pushed_at: sql`NOW()` })
			.where(
				and(
					eq(inbox.type, 'follow'),
					eq(inbox.user_id, followedId),
					eq(inbox.sender_id, followerId),
					isNull(inbox.pushed_at),
					gt(inbox.created_at, sql`NOW() - INTERVAL '1 minute'`)
				)
			)
			.returning({ id: inbox.id });
		if (claimed.length === 0) return;
		const found = await db
			.select({
				id: users.id,
				name: users.name,
				username: users.username,
				owner_id: users.owner_id
			})
			.from(users)
			.where(inArray(users.id, [followerId, followedId]));
		const sender = found.find((u) => u.id === followerId);
		const recipient = found.find((u) => u.id === followedId);
		if (!sender || !recipient) return;
		let body = 'followed you';
		// identities share the owner's devices: say which profile it is for
		if (recipient.owner_id !== null) body += ` (@${recipient.username})`;
		await deliver(recipient.owner_id ?? recipient.id, {
			title: sender.name,
			body,
			url: `/@${sender.username}`,
			tag: `follow:${sender.username}:${recipient.username}`
		});
	} catch (e) {
		console.error('push: sendFollowPush failed', e);
	}
}

/**
 * Sends a push for the inbox rows `postId` just created. Rows are claimed (pushed_at) before
 * sending, so a like that is toggled off and on, or a retry, never notifies twice.
 */
export async function sendPush(postId: number, types?: NotificationType[]) {
	try {
		const sender = alias(users, 'sender');
		const recipient = alias(users, 'recipient');
		const claimed = db.$with('claimed').as(
			db
				.update(inbox)
				.set({ pushed_at: sql`NOW()` })
				.where(
					and(
						eq(inbox.post_id, postId),
						isNull(inbox.pushed_at),
						gt(inbox.created_at, sql`NOW() - INTERVAL '1 minute'`),
						types ? inArray(inbox.type, types) : undefined
					)
				)
				.returning({
					user_id: inbox.user_id,
					sender_id: inbox.sender_id,
					post_id: inbox.post_id,
					type: inbox.type
				})
		);
		const rows: Row[] = await db
			.with(claimed)
			.select({
				type: claimed.type,
				post_id: sql<number>`${claimed.post_id}`,
				content: posts.content,
				sender_name: sender.name,
				sender_username: sender.username,
				recipient_username: recipient.username,
				identity: sql<boolean>`${recipient.owner_id} IS NOT NULL`,
				recipient_id: recipient.id
			})
			.from(claimed)
			.innerJoin(recipient, eq(recipient.id, claimed.user_id))
			.leftJoin(sender, eq(sender.id, claimed.sender_id))
			.leftJoin(posts, eq(posts.id, claimed.post_id))
			.where(sql`${claimed.user_id} IS DISTINCT FROM ${claimed.sender_id}`);
		if (rows.length === 0) return;

		for (const row of rows) await deliver(row.recipient_id, payloadFor(row));
	} catch (e) {
		console.error('push: sendPush failed', e);
	}
}
