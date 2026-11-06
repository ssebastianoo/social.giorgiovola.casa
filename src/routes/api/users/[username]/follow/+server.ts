import type { RequestHandler } from './$types';
import { findPeer } from '#lib/server/messages.js';
import { getFollowStats, setFollowing } from '#lib/server/follows.js';
import { hit, isLimited } from '#lib/server/ratelimit.js';
import { publishFollow } from '#lib/server/realtime.js';

const WINDOW_MS = 60_000;
const MAX_TOGGLES = 30;

async function toggle(locals: App.Locals, username: string, following: boolean) {
	if (!locals.user) return new Response(null, { status: 401 });
	const key = `follow:${locals.user.id}`;
	if (isLimited(key, MAX_TOGGLES)) return new Response('Slow down', { status: 429 });
	const target = await findPeer(username);
	if (!target) return new Response(null, { status: 404 });
	if (target.id === locals.user.id)
		return new Response("You can't follow yourself", { status: 400 });
	hit(key, WINDOW_MS);
	if (await setFollowing(locals.user.id, target.id, following)) {
		// the trigger created the notification
		void publishFollow(locals.user.id, target.id);
	}
	return Response.json(await getFollowStats(target.id, locals.user.id));
}

export const POST: RequestHandler = ({ locals, params }) => toggle(locals, params.username, true);
export const DELETE: RequestHandler = ({ locals, params }) =>
	toggle(locals, params.username, false);
