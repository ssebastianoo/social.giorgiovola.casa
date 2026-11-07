import type { RequestHandler } from './$types';
import {
	getGroup,
	getGroupThread,
	manageLimited,
	parseGroupName,
	renameGroup
} from '#lib/server/groups.js';
import { publishGroupUpdated } from '#lib/server/realtime.js';
import { mutedMessage } from '#lib/server/moderation.js';
import { parseId } from '#lib/server/validation.js';

/** A page of the group's messages: the latest ones, or older ones with `before`. */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	const id = parseId(params.id);
	const group = id === null ? null : await getGroup(id, locals.user.id);
	if (!group) return new Response('Group not found', { status: 404 });

	const raw = url.searchParams.get('before');
	const before = raw === null ? null : parseId(raw);
	if (raw !== null && before === null) return new Response('Invalid before', { status: 400 });

	return Response.json(await getGroupThread(group.id, before));
};

/** Renames the group: `{ name }`. Any member can. */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	if (locals.muted) return new Response(mutedMessage(locals), { status: 403 });
	const id = parseId(params.id);
	const group = id === null ? null : await getGroup(id, locals.user.id);
	if (!group) return new Response('Group not found', { status: 404 });

	const json = await request.json().catch(() => null);
	const parsed = parseGroupName(json?.name);
	if ('error' in parsed) return new Response(parsed.error, { status: 400 });
	const limited = manageLimited(locals.user.id);
	if (limited) return limited;

	// nothing to say when it is the same name
	if (parsed.name === group.name) return new Response(null, { status: 204 });
	const events = await renameGroup(group.id, locals.user.id, parsed.name);
	void publishGroupUpdated(
		group.id,
		group.members.map((m) => m.id),
		events
	);
	return new Response(null, { status: 204 });
};
