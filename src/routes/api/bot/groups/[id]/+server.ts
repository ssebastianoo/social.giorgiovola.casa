import type { RequestHandler } from './$types';
import { botGroup, botHandler } from '#lib/server/bots.js';
import { toGroupChat } from '#lib/server/groups.js';

/** The group's name, owner and members. */
export const GET: RequestHandler = botHandler(async ({ user }, { params }) => {
	const group = await botGroup(user, params.id);
	if (group instanceof Response) return group;
	return Response.json(toGroupChat(group));
});
