import { getPosts } from '$lib/server/posts';
import { parseId } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	const id = parseId(params.id);
	if (id === null) return new Response('Not found', { status: 404 });

	const replies = await getPosts({ reply_to: id, loggedUser: locals.user, order: 'ASC' });

	return new Response(JSON.stringify(replies), {
		headers: { 'Content-Type': 'application/json' }
	});
};
