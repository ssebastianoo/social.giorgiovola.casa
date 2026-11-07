import type { RequestHandler } from './$types';
import { botError, botGroup, botHandler } from '#lib/server/bots.js';
import { deleteGroupMessage } from '#lib/server/groups.js';
import { removeUploads } from '#lib/server/images.js';
import { publishGroupMessageDeleted } from '#lib/server/realtime.js';
import { parseId } from '#lib/server/validation.js';

/** Deletes one of the bot's own messages in the group, for everyone. */
export const DELETE: RequestHandler = botHandler(async ({ user }, { params }) => {
	const id = parseId(params.messageId);
	if (id === null) return botError(400, 'Invalid id');
	const group = await botGroup(user, params.id);
	if (group instanceof Response) return group;
	const deleted = await deleteGroupMessage(group.id, user.id, id);
	if (!deleted) return botError(404, 'Message not found');
	await removeUploads(deleted.images);
	void publishGroupMessageDeleted(
		group.id,
		id,
		group.members.map((m) => m.id)
	);
	return new Response(null, { status: 204 });
});
