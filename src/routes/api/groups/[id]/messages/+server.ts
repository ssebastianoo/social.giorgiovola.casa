import type { RequestHandler } from './$types';
import { deleteGroupMessage, getGroup, sendGroupMessage } from '#lib/server/groups.js';
import { removeUploads } from '#lib/server/images.js';
import {
	checkMessage,
	countMessage,
	messageLimited,
	readMessageBody,
	saveMessageImages
} from '#lib/server/messageInput.js';
import { mutedMessage } from '#lib/server/moderation.js';
import { publishGroupMessage, publishGroupMessageDeleted } from '#lib/server/realtime.js';
import { parseId } from '#lib/server/validation.js';

/** Sends a message to the group: JSON `{ content }`, or multipart with `content` and `images`. */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	if (locals.muted) return new Response(mutedMessage(locals), { status: 403 });

	const body = await readMessageBody(request);
	if (body instanceof Response) return body;
	const hasImages = body.files.length > 0;
	const limited = messageLimited(locals.user.id, hasImages);
	if (limited) return limited;
	const invalid = checkMessage(body);
	if (invalid) return invalid;

	const id = parseId(params.id);
	const group = id === null ? null : await getGroup(id, locals.user.id);
	if (!group) return new Response('Group not found', { status: 404 });

	countMessage(locals.user.id, hasImages);
	const images = await saveMessageImages(body.files);
	if (images instanceof Response) return images;

	let message;
	try {
		message = await sendGroupMessage(group.id, locals.user, body.content, images);
	} catch (e) {
		await removeUploads(images);
		throw e;
	}
	void publishGroupMessage(
		message,
		locals.user.id,
		group.members.map((m) => m.id),
		group.name
	);
	return Response.json(message);
};

/** Deletes one of your own messages in the group: `{ id }`. */
export const DELETE: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	const groupId = parseId(params.id);
	const group = groupId === null ? null : await getGroup(groupId, locals.user.id);
	if (!group) return new Response('Group not found', { status: 404 });

	const json = await request.json().catch(() => null);
	const id = parseId(json?.id);
	if (id === null) return new Response('Missing message id', { status: 400 });

	const deleted = await deleteGroupMessage(group.id, locals.user.id, id);
	if (!deleted) return new Response('Message not found', { status: 404 });

	await removeUploads(deleted.images);
	void publishGroupMessageDeleted(
		group.id,
		id,
		group.members.map((m) => m.id)
	);
	return new Response(null, { status: 204 });
};
