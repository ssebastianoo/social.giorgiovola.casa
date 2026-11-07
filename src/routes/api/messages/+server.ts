import type { RequestHandler } from './$types';
import {
	deleteMessage,
	findPeer,
	getBlock,
	getConversations,
	sendMessage
} from '#lib/server/messages.js';
import { publishMessage, publishMessageDeleted } from '#lib/server/realtime.js';
import { mutedMessage } from '#lib/server/moderation.js';
import { parseId } from '#lib/server/validation.js';
import { removeUploads } from '#lib/server/images.js';
import {
	checkMessage,
	countMessage,
	messageLimited,
	readMessageBody,
	readReplyTo,
	saveMessageImages
} from '#lib/server/messageInput.js';
import { isDirectMessageBetween } from '#lib/server/messageReactions.js';

// people offered first when sharing a post by message
const RECENT_PEERS = 8;

/** The people you talked to most recently, newest first. */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	const conversations = await getConversations(locals.user.id);
	return Response.json(conversations.slice(0, RECENT_PEERS).map((c) => c.peer));
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	if (locals.muted) return new Response(mutedMessage(locals), { status: 403 });

	const body = await readMessageBody(request);
	if (body instanceof Response) return body;
	const hasImages = body.files.length > 0;
	const limited = messageLimited(locals.user.id, hasImages);
	if (limited) return limited;
	const invalid = checkMessage(body);
	if (invalid) return invalid;
	const replyTo = readReplyTo(body.fields);
	if (replyTo instanceof Response) return replyTo;

	const peer = await findPeer(typeof body.fields.to === 'string' ? body.fields.to : '');
	if (!peer) return new Response('User not found', { status: 404 });
	if (peer.id === locals.user.id) {
		return new Response("You can't message yourself", { status: 400 });
	}

	const block = await getBlock(locals.user.id, peer.id);
	if (block.me) return new Response('Unblock this user to message them', { status: 403 });
	if (block.peer) return new Response("You can't message this user", { status: 403 });
	if (replyTo !== null && !(await isDirectMessageBetween(replyTo, locals.user.id, peer.id))) {
		return new Response('The message you are replying to is gone', { status: 400 });
	}

	countMessage(locals.user.id, hasImages);
	const images = await saveMessageImages(body.files);
	if (images instanceof Response) return images;

	let message;
	try {
		message = await sendMessage(locals.user, peer, body.content, images, replyTo);
	} catch (e) {
		await removeUploads(images);
		throw e;
	}
	void publishMessage(message, locals.user.id, peer.id, locals.user.name);
	return Response.json(message);
};

/** Deletes one of your own messages, for both participants. */
export const DELETE: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	const json = await request.json().catch(() => null);
	const id = parseId(json?.id);
	if (id === null) return new Response('Missing message id', { status: 400 });

	const deleted = await deleteMessage(locals.user.id, id);
	// someone else's message and a missing one look the same: ids of others' messages stay private
	if (!deleted) return new Response('Message not found', { status: 404 });

	await removeUploads(deleted.images);
	void publishMessageDeleted(id, locals.user.id, deleted.recipient_id);
	return new Response(null, { status: 204 });
};
