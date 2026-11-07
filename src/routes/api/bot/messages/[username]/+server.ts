import type { RequestHandler } from './$types';
import { botError, botHandler, botLimited, listParams, readBody } from '#lib/server/bots.js';
import { findPeer, getBlock, getThreadFrom, sendMessage } from '#lib/server/messages.js';
import { isDirectMessageBetween } from '#lib/server/messageReactions.js';
import { publishMessage } from '#lib/server/realtime.js';
import { LIMITS, parseId } from '#lib/server/validation.js';

const MAX_MESSAGES = 20;

/** The conversation with a user, oldest first: the latest messages, or the ones after `after`. */
export const GET: RequestHandler = botHandler(async ({ user }, { params, url }) => {
	const peer = await findPeer(params.username);
	if (!peer) return botError(404, 'User not found');
	const list = listParams(url);
	if (list instanceof Response) return list;
	return Response.json(await getThreadFrom(user, peer, list));
});

/** Sends a text message, optionally replying to one. JSON only: bots can't attach images. */
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

	const peer = await findPeer(params.username);
	if (!peer) return botError(404, 'User not found');
	if (peer.id === bot.user.id) return botError(400, "A bot can't message itself");
	const block = await getBlock(bot.user.id, peer.id);
	if (block.me) return botError(403, 'Unblock this user to message them');
	if (block.peer) return botError(403, "You can't message this user");
	if (replyTo !== null && !(await isDirectMessageBetween(replyTo, bot.user.id, peer.id)))
		return botError(400, 'reply_to must be a message of this conversation');

	if (botLimited(bot.user.id, 'messages', MAX_MESSAGES)) return botError(429, 'Messaging too fast');
	const message = await sendMessage(bot.user, peer, content, [], replyTo);
	void publishMessage(message, bot.user.id, peer.id, bot.user.name);
	return Response.json(message, { status: 201 });
});
