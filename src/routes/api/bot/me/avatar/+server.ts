import type { RequestHandler } from './$types';
import {
	MAX_PROFILE_UPDATES,
	PROFILE_WINDOW_MS,
	botError,
	botHandler,
	botLimited
} from '#lib/server/bots.js';
import { updateProfile } from '#lib/server/profile.js';
import { LIMITS } from '#lib/server/validation.js';

/**
 * Replaces the bot's avatar. The body is the image itself; multipart forms would be refused by
 * SvelteKit's cross-site form check, since bots send no Origin.
 */
export const PUT: RequestHandler = botHandler(async ({ user }, { request }) => {
	if (Number(request.headers.get('content-length')) > LIMITS.avatarBytes)
		return botError(413, 'Avatar too big, max size is 10mb');
	const buffer = Buffer.from(await request.arrayBuffer());
	if (buffer.length === 0) return botError(400, 'Missing image, send it as the request body');

	if (botLimited(user.id, 'profile', MAX_PROFILE_UPDATES, PROFILE_WINDOW_MS))
		return botError(429, 'Updating the profile too often');
	const result = await updateProfile(user.id, user.username, {}, buffer);
	if ('error' in result) return botError(400, result.error);
	return Response.json(result.profile);
});

/** Removes the bot's avatar, back to the generated one. */
export const DELETE: RequestHandler = botHandler(async ({ user }) => {
	if (botLimited(user.id, 'profile', MAX_PROFILE_UPDATES, PROFILE_WINDOW_MS))
		return botError(429, 'Updating the profile too often');
	const result = await updateProfile(user.id, user.username, {}, null);
	if ('error' in result) return botError(400, result.error);
	return Response.json(result.profile);
});
