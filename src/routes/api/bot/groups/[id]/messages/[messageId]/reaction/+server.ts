import type { RequestHandler } from './$types';
import { botError, botGroup, botHandler, botLimited, readBody } from '#lib/server/bots.js';
import { isGroupMessage, parseEmoji, setReaction } from '#lib/server/messageReactions.js';
import { publishGroupMessageReactions } from '#lib/server/realtime.js';
import { parseId } from '#lib/server/validation.js';

// the same bucket as reactions to direct messages
const MAX_REACTIONS = 60;

const react = (remove: boolean): RequestHandler =>
	botHandler(async (bot, { params, request }) => {
		const id = parseId(params.messageId);
		if (id === null) return botError(400, 'Invalid id');
		let emoji: string | null = null;
		if (!remove) {
			const body = await readBody(request);
			if (!body) return botError(400, 'Invalid JSON');
			emoji = parseEmoji(body.emoji);
			if (emoji === null) return botError(400, 'emoji must be a single emoji');
		}
		const group = await botGroup(bot.user, params.id);
		if (group instanceof Response) return group;
		// events (someone joined, left…) take no reactions
		if (!(await isGroupMessage(group.id, id))) return botError(404, 'Message not found');
		if (botLimited(bot.user.id, 'reactions', MAX_REACTIONS))
			return botError(429, 'Reacting too fast');

		const reactions = await setReaction('group', id, bot.user.id, emoji);
		publishGroupMessageReactions(
			group.id,
			id,
			reactions,
			group.members.map((m) => m.id)
		);
		return Response.json({ reactions });
	});

/** Sets the bot's reaction to a group message `{ emoji }`, replacing the one it had. */
export const PUT = react(false);
/** Removes the bot's reaction. */
export const DELETE = react(true);
