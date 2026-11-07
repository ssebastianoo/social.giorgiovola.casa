import type { RequestHandler } from './$types';
import { getGroup, manageLimited, removeMember } from '#lib/server/groups.js';
import { removeUploads } from '#lib/server/images.js';
import { publishGroupUpdated } from '#lib/server/realtime.js';
import { parseId } from '#lib/server/validation.js';

/** Leaves the group (your own username), or removes someone else from it (owner only). */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	const id = parseId(params.id);
	const group = id === null ? null : await getGroup(id, locals.user.id);
	if (!group) return new Response('Group not found', { status: 404 });

	const target = group.members.find((m) => m.username === params.username.toLowerCase());
	if (!target) return new Response('Not a member of this group', { status: 404 });
	if (target.id !== locals.user.id && group.ownerId !== locals.user.id)
		return new Response('Only the owner of the group can remove people', { status: 403 });
	const limited = manageLimited(locals.user.id);
	if (limited) return limited;

	const result = await removeMember(group.id, locals.user.id, target.id);
	if (result.deleted) await removeUploads(result.images);
	// the removed member is told too, so the group goes away from their screens
	if (result.removed)
		void publishGroupUpdated(
			group.id,
			group.members.map((m) => m.id),
			result.events
		);
	return new Response(null, { status: 204 });
};
