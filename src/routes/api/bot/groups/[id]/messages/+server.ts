import type { RequestHandler } from './$types';
import {
	botError,
	botGroup,
	botHandler,
	botLimited,
	listParams,
	readBody
} from '#lib/server/bots.js';
import { getGroupMessagesFrom, sendGroupMessage } from '#lib/server/groups.js';
import { isGroupMessage } from '#lib/server/messageReactions.js';
import { publishGroupMessage } from '#lib/server/realtime.js';
import { LIMITS, parseId } from '#lib/server/validation.js';

// the same bucket as direct messages
const MAX_MESSAGES = 20;

/** The group's messages and events, oldest first: the latest ones, or the ones after `after`. */
export const GET: RequestHandler = botHandler(async ({ user }, { params, url }) => {
	const group = await botGroup(user, params.id);
	if (group instanceof Response) return group;
	const list = listParams(url);
	if (list instanceof Response) return list;
	return Response.json(await getGroupMessagesFrom(group.id, list));
});

/** Sends a text message to the group, optionally replying to one. JSON only, no images. */
export const POST: RequestHandler = botHandler(async (bot, { params, request }) => {
	if (bot.muted)
		return botError(
			403,
			`This bot is muted and can't send messages.${
				bot.muteReason ? ` Reason: ${bot.muteReason}` : ''
			}`
		);
	const body = await readBody(request);
	if (!body) return botError(400, 'Invalid JSON');

	const content = typeof body.content === 'string' ? body.content.trim() : '';
	if (!content) return botError(400, 'Missing content');
	if (content.length > LIMITS.messageContent)
		return botError(400, `Messages can be at most ${LIMITS.messageContent} characters`);
	const replyTo = body.reply_to == null ? null : parseId(body.reply_to);
	if (body.reply_to != null && replyTo === null) return botError(400, 'Invalid reply_to');

	const group = await botGroup(bot.user, params.id);
	if (group instanceof Response) return group;
	if (replyTo !== null && !(await isGroupMessage(group.id, replyTo)))
		return botError(400, 'reply_to must be a message of this group');

	if (botLimited(bot.user.id, 'messages', MAX_MESSAGES)) return botError(429, 'Messaging too fast');
	const message = await sendGroupMessage(group.id, bot.user, content, [], replyTo);
	void publishGroupMessage(
		message,
		bot.user.id,
		group.members.map((m) => m.id),
		group.name
	);
	return Response.json(message, { status: 201 });
});
