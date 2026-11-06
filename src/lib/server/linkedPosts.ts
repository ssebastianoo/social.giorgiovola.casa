import { eq, inArray } from 'drizzle-orm';
import type { QuotedPost } from '#lib/types.js';
import { PUBLIC_URL } from '$app/env/public';
import { db, posts, users } from './db/index.js';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// a link to a post on this instance: PUBLIC_URL/@username/id
const postLinkRegex = PUBLIC_URL
	? new RegExp(
			`${escapeRegex(PUBLIC_URL.replace(/\/+$/, ''))}/@([a-zA-Z0-9_]+)/(\\d+)(?![\\d])`,
			'i'
	  )
	: null;

/** The first post linked in the content, as its author's username and id. */
function linkedPostRef(content: string) {
	const match = postLinkRegex && content.match(postLinkRegex);
	if (!match) return null;
	const id = Number(match[2]);
	// out of range ids can't exist, and would make the query fail
	if (!Number.isSafeInteger(id) || id > 2147483647) return null;
	return { username: match[1].toLowerCase(), id };
}

/**
 * The first post on this instance each text links to, to show as an embed like a quote (null
 * when there's none). A link whose username doesn't match the post's author, or to a post
 * that's gone, gets none.
 */
export async function linkedPosts(contents: string[]): Promise<(QuotedPost | null)[]> {
	const refs = contents.map(linkedPostRef);
	const ids = [...new Set(refs.flatMap((ref) => (ref ? [ref.id] : [])))];
	if (ids.length === 0) return refs.map(() => null);

	const linked = await db
		.select({
			id: posts.id,
			content: posts.content,
			images: posts.images,
			created_at: posts.created_at,
			is_quote: posts.is_quote,
			user: {
				username: users.username,
				name: users.name,
				avatar: users.avatar
			}
		})
		.from(posts)
		.innerJoin(users, eq(posts.user_id, users.id))
		.where(inArray(posts.id, ids));
	const byId = new Map(linked.map((p) => [p.id, p]));

	return refs.map((ref) => {
		const target = ref && byId.get(ref.id);
		return target && target.user.username.toLowerCase() === ref.username ? target : null;
	});
}
