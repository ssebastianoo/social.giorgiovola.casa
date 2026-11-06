import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db, users } from '#lib/server/db/index.js';
import {
	MAX_PROFILE_UPDATES,
	PROFILE_WINDOW_MS,
	botError,
	botHandler,
	botLimited,
	readBody
} from '#lib/server/bots.js';
import { getFollowStats } from '#lib/server/follows.js';
import { profileColumns, updateProfile, type ProfileChanges } from '#lib/server/profile.js';
import { closeBotStreams } from '#lib/server/realtime.js';

/** The bot's own profile. */
export const GET: RequestHandler = botHandler(async ({ user, muted, muteReason }) => {
	const [profile] = await db.select(profileColumns).from(users).where(eq(users.id, user.id));
	return Response.json({
		...profile,
		created_at: user.created_at,
		muted,
		mute_reason: muteReason,
		...(await getFollowStats(user.id))
	});
});

const FIELDS = ['name', 'username', 'bio', 'website'] as const;

/** Changes the bot's name, username, bio and website. Fields left out are kept. */
export const PATCH: RequestHandler = botHandler(async ({ user }, { request }) => {
	const body = await readBody(request);
	if (!body) return botError(400, 'Invalid JSON');

	const changes: ProfileChanges = {};
	for (const field of FIELDS) {
		const value = body[field];
		if (value === undefined) continue;
		if (typeof value !== 'string') return botError(400, `${field} must be a string`);
		changes[field] = value;
	}
	if (Object.keys(changes).length === 0)
		return botError(400, `Nothing to update, send any of ${FIELDS.join(', ')}`);

	if (botLimited(user.id, 'profile', MAX_PROFILE_UPDATES, PROFILE_WINDOW_MS))
		return botError(429, 'Updating the profile too often');
	const result = await updateProfile(user.id, user.username, changes);
	if ('error' in result) return botError(400, result.error);
	// the stream matches mentions against the username it was opened with
	if (result.profile.username !== user.username) closeBotStreams([user.id]);
	return Response.json(result.profile);
});
