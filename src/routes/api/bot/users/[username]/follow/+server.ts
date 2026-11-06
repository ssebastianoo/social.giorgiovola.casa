import type { RequestHandler } from './$types';
import { botError, botHandler, botLimited } from '#lib/server/bots.js';
import { findPeer } from '#lib/server/messages.js';
import { getFollowStats, setFollowing } from '#lib/server/follows.js';
import { publishFollow } from '#lib/server/realtime.js';

const MAX_TOGGLES = 30;

const follow = (following: boolean): RequestHandler =>
	botHandler(async (bot, { params }) => {
		const target = await findPeer(params.username);
		if (!target) return botError(404, 'User not found');
		if (target.id === bot.user.id) return botError(400, "A bot can't follow itself");
		if (botLimited(bot.user.id, 'follows', MAX_TOGGLES)) return botError(429, 'Slow down');
		if (await setFollowing(bot.user.id, target.id, following)) {
			// the trigger created the notification
			void publishFollow(bot.user.id, target.id);
		}
		return Response.json(await getFollowStats(target.id, bot.user.id));
	});

/** Follows the profile (does nothing when it is already followed). */
export const PUT = follow(true);
/** Unfollows it. */
export const DELETE = follow(false);
