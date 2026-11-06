import type { RequestHandler } from './$types';
import { botHandler } from '#lib/server/bots.js';
import { getConversations } from '#lib/server/messages.js';

/** The bot's conversations, most recent first, with a preview and the unread count of each. */
export const GET: RequestHandler = botHandler(async ({ user }) =>
	Response.json(await getConversations(user.id))
);
