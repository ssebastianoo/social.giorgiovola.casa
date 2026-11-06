import crypto from 'node:crypto';
import { and, asc, eq, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { bots, db, posts, users } from './db/index.js';
import { getPosts } from './posts.js';
import { hit, isLimited } from './ratelimit.js';
import { parseId } from './validation.js';
import type { User } from '#lib/types.js';

/** How many bots a single account can own. */
export const MAX_BOTS = 5;

const TOKEN_PREFIX = 'sgc_';
const TOKEN_RE = /^sgc_[A-Za-z0-9_-]{43}$/;

/** A new bearer token and the hash that is stored. The token itself is never stored. */
export function newToken() {
	const token = TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url');
	return { token, hash: hashToken(token) };
}

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

/** The bot making an API request, with the state of the account that owns it. */
export type BotLocals = {
	user: User;
	muted: boolean;
	muteReason: string | null;
};

// every request counts, so a runaway bot can't hammer the database
const REQUEST_WINDOW_MS = 60_000;
const MAX_REQUESTS = 120;

const json = (status: number, error: string, headers?: HeadersInit) =>
	Response.json({ error }, { status, headers });

/**
 * Authenticates a bot API request (`Authorization: Bearer <token>`). Returns the bot, or the
 * error response to send back.
 */
export async function authenticateBot(request: Request): Promise<BotLocals | Response> {
	const header = request.headers.get('authorization') ?? '';
	const match = /^(?:Bearer|Bot) (\S+)$/i.exec(header);
	if (!match || !TOKEN_RE.test(match[1]))
		return json(401, 'Missing or invalid token', { 'WWW-Authenticate': 'Bearer' });

	const owner = alias(users, 'owner');
	const [row] = await db
		.select({
			id: users.id,
			name: users.name,
			username: users.username,
			avatar: users.avatar,
			created_at: users.created_at,
			owner_id: users.owner_id,
			banned_at: users.banned_at,
			muted_at: users.muted_at,
			mute_reason: users.mute_reason,
			owner_banned_at: owner.banned_at,
			owner_muted_at: owner.muted_at,
			owner_mute_reason: owner.mute_reason
		})
		.from(bots)
		.innerJoin(users, and(eq(users.id, bots.user_id), eq(users.bot, true)))
		.innerJoin(owner, eq(owner.id, users.owner_id))
		.where(eq(bots.token_hash, hashToken(match[1])));
	if (!row) return json(401, 'Missing or invalid token', { 'WWW-Authenticate': 'Bearer' });
	// moderation follows the owner, like for identities
	if (row.banned_at || row.owner_banned_at) return json(403, 'This bot is banned');

	const key = `bot:${row.id}`;
	if (isLimited(key, MAX_REQUESTS)) return json(429, 'Too many requests', { 'Retry-After': '60' });
	hit(key, REQUEST_WINDOW_MS);

	// at most one write a minute, it is only shown in the settings
	void db
		.update(bots)
		.set({ last_used_at: sql`NOW()` })
		.where(
			and(
				eq(bots.user_id, row.id),
				or(isNull(bots.last_used_at), lt(bots.last_used_at, sql`NOW() - INTERVAL '1 minute'`))
			)
		)
		.catch((e) => console.error('bots: last_used_at failed', e));

	const muted = row.owner_muted_at
		? row.owner_mute_reason
		: row.muted_at
		? row.mute_reason
		: undefined;
	return {
		user: {
			id: row.id,
			email: null,
			name: row.name,
			username: row.username,
			avatar: row.avatar,
			created_at: row.created_at,
			owner_id: row.owner_id
		},
		muted: muted !== undefined,
		muteReason: muted ?? null
	};
}

/** Counts one write of a kind (posts, likes, follows) against the bot. True when over the limit. */
export function botLimited(botId: number, kind: string, max: number, windowMs = 60_000) {
	const key = `bot:${botId}:${kind}`;
	if (isLimited(key, max)) return true;
	hit(key, windowMs);
	return false;
}

/** The bots an account owns, for the settings page. */
export function listBots(accountId: number) {
	return db
		.select({
			id: users.id,
			name: users.name,
			username: users.username,
			avatar: users.avatar,
			created_at: users.created_at,
			last_used_at: bots.last_used_at
		})
		.from(users)
		.innerJoin(bots, eq(bots.user_id, users.id))
		.where(and(eq(users.owner_id, accountId), eq(users.bot, true)))
		.orderBy(asc(users.created_at), asc(users.id));
}

/** Reads the JSON body of a bot request, null when it isn't a JSON object. */
export async function readBody(request: Request): Promise<Record<string, unknown> | null> {
	try {
		const body = await request.json();
		return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
	} catch {
		return null;
	}
}

export { json as botError };

/** Runs `fn` for an authenticated bot, or answers with the authentication error. */
export const botHandler =
	<E extends { request: Request }>(
		fn: (bot: BotLocals, event: E) => Promise<Response> | Response
	) =>
	async (event: E) => {
		const bot = await authenticateBot(event.request);
		if (bot instanceof Response) return bot;
		return fn(bot, event);
	};

/** The `after` and `limit` query parameters of the bot API's lists. */
export function listParams(url: URL): { afterId: number | null; limit: number } | Response {
	const after = url.searchParams.get('after');
	const rawLimit = url.searchParams.get('limit');
	const afterId = after === null ? null : parseId(after);
	if (after !== null && afterId === null) return json(400, 'Invalid after');
	const limit = rawLimit === null ? 20 : Number(rawLimit);
	if (!Number.isInteger(limit) || limit < 1 || limit > 100)
		return json(400, 'limit must be between 1 and 100');
	return { afterId, limit };
}

/**
 * A list of posts for the bot API, oldest first: the ones after `afterId`, or the most recent
 * ones when it isn't given. Pass the id of the last post as `after` to get the newer ones.
 */
export async function botPosts(
	bot: User,
	where: SQL,
	{ afterId, limit }: { afterId: number | null; limit: number }
) {
	const list = await getPosts({
		loggedUser: bot,
		where,
		afterId,
		order: afterId === null ? 'DESC' : 'ASC',
		limit
	});
	return afterId === null ? list.reverse() : list;
}

/** Posts that mention the bot or reply to one of its posts (its own posts aside). */
export const mentionsOf = (bot: Pick<User, 'id' | 'username'>) =>
	sql`${posts.user_id} <> ${bot.id} AND (
		${posts.content} ~ ${`@${bot.username}(\\s|$)`}
		OR ${posts.reply_to} IN (SELECT p.id FROM posts p WHERE p.user_id = ${bot.id})
	)`;

/** Posts by the profiles the bot follows. */
export const followedBy = (bot: Pick<User, 'id'>) =>
	sql`${posts.user_id} IN (SELECT f.followed_id FROM follows f WHERE f.follower_id = ${bot.id})`;
