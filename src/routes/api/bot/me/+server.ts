import type { RequestHandler } from './$types';
import { botHandler } from '#lib/server/bots.js';
import { getFollowStats } from '#lib/server/follows.js';

/** The bot's own profile. */
export const GET: RequestHandler = botHandler(async ({ user, muted, muteReason }) => {
	const { id, username, name, avatar, created_at } = user;
	return Response.json({
		id,
		username,
		name,
		avatar,
		created_at,
		muted,
		mute_reason: muteReason,
		...(await getFollowStats(id))
	});
});
