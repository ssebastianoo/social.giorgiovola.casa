import type { RequestHandler } from './$types';
import { getProfileCard } from '#lib/server/follows.js';

/** Data for the profile hover card. Public like the profile page; mutuals only when signed in. */
export const GET: RequestHandler = async ({ locals, params }) => {
	const card = await getProfileCard(params.username, locals.user?.id);
	if (!card) return new Response(null, { status: 404 });
	// not cached by the browser: following from the card must show up on the next hover
	return Response.json(card);
};
