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
