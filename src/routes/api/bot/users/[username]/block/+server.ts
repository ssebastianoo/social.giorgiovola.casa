import type { RequestHandler } from './$types';
import { botError, botHandler, botLimited } from '#lib/server/bots.js';
import { findPeer, getBlock, setBlocked } from '#lib/server/messages.js';

const MAX_TOGGLES = 30;

const block = (blocked: boolean): RequestHandler =>
	botHandler(async (bot, { params }) => {
		const target = await findPeer(params.username);
		if (!target) return botError(404, 'User not found');
		if (target.id === bot.user.id) return botError(400, "A bot can't block itself");
		if (botLimited(bot.user.id, 'blocks', MAX_TOGGLES)) return botError(429, 'Slow down');
		await setBlocked(bot.user.id, target.id, blocked);
		return Response.json({ blocked: (await getBlock(bot.user.id, target.id)).me });
	});

/** Blocks the profile: no messages in either direction. Idempotent. */
export const PUT = block(true);
/** Unblocks it. Idempotent. */
export const DELETE = block(false);
