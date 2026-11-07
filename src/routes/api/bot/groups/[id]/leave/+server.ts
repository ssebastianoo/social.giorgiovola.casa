import type { RequestHandler } from './$types';
import { botError, botGroup, botHandler, botLimited } from '#lib/server/bots.js';
import { removeMember } from '#lib/server/groups.js';
import { removeUploads } from '#lib/server/images.js';
import { publishGroupUpdated } from '#lib/server/realtime.js';

// like the web app's limit on managing groups
const MAX_LEAVES = 30;

/** The bot leaves the group; when it was the last member, the group is deleted. */
export const POST: RequestHandler = botHandler(async ({ user }, { params }) => {
	const group = await botGroup(user, params.id);
	if (group instanceof Response) return group;
	if (botLimited(user.id, 'groups', MAX_LEAVES)) return botError(429, 'Leaving too fast');

	const result = await removeMember(group.id, user.id, user.id);
	if (result.deleted) await removeUploads(result.images);
	// the others see the "left" event and the bot drops out of their member list
	if (result.removed)
		void publishGroupUpdated(
			group.id,
			group.members.map((m) => m.id),
			result.events
		);
	return new Response(null, { status: 204 });
});
