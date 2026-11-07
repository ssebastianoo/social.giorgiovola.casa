import type { RequestHandler } from './$types';
import { botHandler } from '#lib/server/bots.js';
import { getGroupConversations } from '#lib/server/groups.js';

/** The group chats the bot is in, most recent activity first, with a preview and unread count. */
export const GET: RequestHandler = botHandler(async ({ user }) =>
	Response.json(await getGroupConversations(user.id))
);
