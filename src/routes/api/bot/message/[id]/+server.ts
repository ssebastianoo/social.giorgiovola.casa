import type { RequestHandler } from './$types';
import { botError, botHandler } from '#lib/server/bots.js';
import { deleteMessage } from '#lib/server/messages.js';
import { publishMessageDeleted } from '#lib/server/realtime.js';
import { removeUploads } from '#lib/server/images.js';
import { parseId } from '#lib/server/validation.js';

/** Deletes one of the bot's own messages, for both sides of the conversation. */
export const DELETE: RequestHandler = botHandler(async ({ user }, { params }) => {
	const id = parseId(params.id);
	if (id === null) return botError(400, 'Invalid id');
	const deleted = await deleteMessage(user.id, id);
	// someone else's message and a missing one look the same: ids of others' messages stay private
	if (!deleted) return botError(404, 'Message not found');
	await removeUploads(deleted.images);
	void publishMessageDeleted(id, user.id, deleted.recipient_id);
	return new Response(null, { status: 204 });
});
