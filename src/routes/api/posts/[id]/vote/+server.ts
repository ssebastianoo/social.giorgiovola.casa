import type { RequestHandler } from './$types';
import { vote } from '#lib/server/polls.js';
import { hit, isLimited } from '#lib/server/ratelimit.js';
import { parseId } from '#lib/server/validation.js';

const WINDOW_MS = 60_000;
const MAX_VOTES = 30;

/** Votes in the poll of a post: { option } is the index of the chosen option. */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	const postId = parseId(params.id);
	if (postId === null) return new Response('Poll not found', { status: 404 });

	let option: unknown;
	try {
		option = (await request.json())?.option;
	} catch {
		return new Response('Invalid JSON', { status: 400 });
	}
	if (typeof option !== 'number') return new Response('Invalid option', { status: 400 });

	const key = `vote:${locals.user.id}`;
	if (isLimited(key, MAX_VOTES)) return new Response('Too many requests', { status: 429 });
	hit(key, WINDOW_MS);

	const result = await vote(locals.user.id, postId, option);
	if (!result.ok) return new Response(result.message, { status: result.status });
	return Response.json({ voted: result.voted, votes: result.votes });
};
