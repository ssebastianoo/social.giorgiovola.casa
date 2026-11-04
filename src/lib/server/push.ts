import webpush from 'web-push';
import { sql } from './db';
import { PUBLIC_URL } from '$app/env/public';

/** Web push: sends a system notification to the browsers subscribed by the recipient's account. */

type Vapid = { publicKey: string; privateKey: string };

// The key pair is created once and kept in the database, so there is nothing to configure.
let vapid: Promise<Vapid> | null = null;

async function loadVapid(): Promise<Vapid> {
	const read = async () => {
		const rows =
			await sql`SELECT key, value FROM settings WHERE key IN ('vapid_public', 'vapid_private')`;
		const map = Object.fromEntries(rows.map((r) => [r.key, r.value as string]));
		return map.vapid_public && map.vapid_private
			? { publicKey: map.vapid_public, privateKey: map.vapid_private }
			: null;
	};
	const existing = await read();
	if (existing) return existing;
	const keys = webpush.generateVAPIDKeys();
	// concurrent first uses: whoever inserts first wins, the others read it back
	await sql`
		INSERT INTO settings (key, value)
		VALUES ('vapid_public', ${keys.publicKey}), ('vapid_private', ${keys.privateKey})
		ON CONFLICT DO NOTHING
	`;
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
	type: 'mention' | 'reply' | 'like';
	post_id: number;
	content: string | null;
	sender_name: string | null;
	sender_username: string | null;
	recipient_username: string;
	identity: boolean;
	account_id: number;
};

const clip = (text: string, max = 140) => (text.length > max ? `${text.slice(0, max)}…` : text);

function payloadFor(row: Row) {
	const sender = row.sender_name ?? 'Someone';
	const verb =
		row.type === 'like'
			? 'liked your post'
			: row.type === 'reply'
			? 'replied to your post'
			: 'mentioned you in a post';
	let body = row.type === 'like' || !row.content ? verb : `${verb}: ${clip(row.content)}`;
	// identities share the owner's devices: say which profile it is for
	if (row.identity) body += ` (@${row.recipient_username})`;
	// the link matches the notifications page: a like points at the recipient's own post
	const owner = row.type === 'like' ? row.recipient_username : row.sender_username;
	return {
		title: sender,
		body,
		url: owner ? `/@${owner}/${row.post_id}` : '/notifications',
		tag: `${row.type}:${row.post_id}`
	};
}

/**
 * Sends a push for the inbox rows `postId` just created. Rows are claimed (pushed_at) before
 * sending, so a like that is toggled off and on, or a retry, never notifies twice.
 */
export async function sendPush(postId: number, type?: 'like') {
	try {
		const only = type ?? null;
		const rows = await sql<Row[]>`
			WITH claimed AS (
				UPDATE inbox SET pushed_at = NOW()
				WHERE post_id = ${postId}
					AND pushed_at IS NULL
					AND created_at > NOW() - INTERVAL '1 minute'
					AND (${only}::text IS NULL OR type = ${only})
				RETURNING id, user_id, sender_id, post_id, type
			)
			SELECT c.type, c.post_id, p.content,
				s.name AS sender_name, s.username AS sender_username,
				u.username AS recipient_username,
				u.owner_id IS NOT NULL AS identity,
				COALESCE(u.owner_id, u.id) AS account_id
			FROM claimed c
			INNER JOIN users u ON u.id = c.user_id
			LEFT JOIN users s ON s.id = c.sender_id
			LEFT JOIN posts p ON p.id = c.post_id
			WHERE c.user_id IS DISTINCT FROM c.sender_id
		`;
		if (rows.length === 0) return;

		const keys = await getVapid();
		const options = {
			vapidDetails: { subject: subject(), ...keys },
			TTL: 60 * 60 * 24,
			urgency: 'normal' as const
		};

		for (const row of rows) {
			const subs = await sql<{ endpoint: string; p256dh: string; auth: string }[]>`
				SELECT DISTINCT ON (ps.endpoint) ps.endpoint, ps.p256dh, ps.auth
				FROM push_subscriptions ps
				INNER JOIN sessions se ON se.token = ps.session_token
				WHERE se.user_id = ${row.account_id}
			`;
			const message = JSON.stringify(payloadFor(row));
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
							await sql`DELETE FROM push_subscriptions WHERE endpoint = ${sub.endpoint}`;
						else console.error('push: send failed', status ?? e);
					}
				})
			);
		}
	} catch (e) {
		console.error('push: sendPush failed', e);
	}
}
