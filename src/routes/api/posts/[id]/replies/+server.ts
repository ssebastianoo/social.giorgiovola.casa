import { getPosts } from '$lib/server/posts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	const replies = await getPosts({ reply_to: parseInt(params.id), loggedUser: locals.user });

	return new Response(JSON.stringify(replies));
};
