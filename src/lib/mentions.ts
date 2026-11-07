// an "@username" anywhere, also next to punctuation ("(@user)", "@user,"), but not right after a
// username character, "@" or "/": emails (a@b.com) and post links (/@user/57) aren't mentions.
// keep in sync with the mention trigger (drizzle/0025_mentions_next_to_punctuation.sql)
export const MENTION_RE = /(?<![a-zA-Z0-9_@/])@([a-zA-Z0-9_]+)/g;

/** Splits text into plain strings and mentioned usernames, in order. */
export function splitMentions(text: string): (string | { username: string })[] {
	const parts: (string | { username: string })[] = [];
	let last = 0;
	for (const match of text.matchAll(MENTION_RE)) {
		if (match.index > last) parts.push(text.slice(last, match.index));
		parts.push({ username: match[1] });
		last = match.index + match[0].length;
	}
	if (last < text.length) parts.push(text.slice(last));
	return parts;
}

/** Whether the text mentions `username`. */
export const mentions = (text: string, username: string) =>
	[...text.matchAll(MENTION_RE)].some((m) => m[1] === username);

// posts already reported, so scrolling past one again doesn't repeat the request
const reported = new Set<string>();

/** Marks the current profile's mention notification for a post as read. */
export function markMentionSeen(userId: number, postId: number) {
	const key = `${userId}:${postId}`;
	if (reported.has(key)) return;
	reported.add(key);
	fetch(`/api/posts/${postId}/seen`, { method: 'POST' })
		.then((res) => {
			if (!res.ok) reported.delete(key);
		})
		.catch(() => reported.delete(key));
}
