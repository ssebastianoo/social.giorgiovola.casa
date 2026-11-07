import type { RequestHandler } from './$types';
import { botError, botHandler, botLimited, readBody } from '#lib/server/bots.js';
import { getBlock } from '#lib/server/messages.js';
import { directMessageParties, parseEmoji, setReaction } from '#lib/server/messageReactions.js';
import { publishMessageReactions } from '#lib/server/realtime.js';
import { parseId } from '#lib/server/validation.js';

const MAX_REACTIONS = 60;

const react = (remove: boolean): RequestHandler =>
	botHandler(async (bot, { params, request }) => {
		const id = parseId(params.id);
		if (id === null) return botError(400, 'Invalid id');
		let emoji: string | null = null;
		if (!remove) {
			const body = await readBody(request);
			if (!body) return botError(400, 'Invalid JSON');
			emoji = parseEmoji(body.emoji);
			if (emoji === null) return botError(400, 'emoji must be a single emoji');
		}
		// a message the bot isn't part of and a missing one look the same
		const parties = await directMessageParties(id, bot.user.id);
		if (!parties) return botError(404, 'Message not found');
		const peerId = parties.sender_id === bot.user.id ? parties.recipient_id : parties.sender_id;
		const block = await getBlock(bot.user.id, peerId);
		if (block.me || block.peer) return botError(403, "You can't react in this conversation");
		if (botLimited(bot.user.id, 'reactions', MAX_REACTIONS))
			return botError(429, 'Reacting too fast');

		const reactions = await setReaction('direct', id, bot.user.id, emoji);
		publishMessageReactions(id, reactions, [parties.sender_id, parties.recipient_id]);
		return Response.json({ reactions });
	});

/** Sets the bot's reaction to a direct message `{ emoji }`, replacing the one it had. */
export const PUT = react(false);
/** Removes the bot's reaction. */
export const DELETE = react(true);
