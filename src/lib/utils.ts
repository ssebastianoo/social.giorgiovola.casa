import { PUBLIC_URL } from '$app/env/public';
import type { Post, User } from './types';

/** A reply ratios its parent when it has more likes than the parent. Replying to yourself never does. */
export function isRatio(post: Pick<Post, 'likes' | 'reply_to' | 'user'>) {
	return (
		post.reply_to != null &&
		post.user.username !== post.reply_to.username &&
		post.likes > (post.reply_to.likes ?? 0)
	);
}

/**
 * The reply's share of the likes it and its parent have together, as a whole percent:
 * 2 likes against the parent's 1 is 67%, 1 against 0 is 100%. Above 50 means it ratios.
 */
export function ratioPercent(post: Pick<Post, 'likes' | 'reply_to'>) {
	const parent = post.reply_to?.likes ?? 0;
	const total = post.likes + parent;
	return total === 0 ? 0 : Math.round((post.likes / total) * 100);
}

export function getAvatar(
	user: Pick<User, 'avatar'> & Pick<User, 'username'>,
	size: number,
	absolute = false
) {
	if (!user.avatar) {
		// social cards and Discord don't accept SVGs
		if (absolute) return `${PUBLIC_URL}/avatar/${user.username}.png?size=${size}`;
		return `/avatar/${user.username}.svg?size=${size}`;
	}
	if (absolute) return `${PUBLIC_URL}${user.avatar}`;
	return user.avatar;
}

/** Whether a whitespace-delimited word is a link. Anchored, so `javascript:alert(1)//https://x` isn't. */
export function isHttpLink(word: string) {
	if (!/^https?:\/\/\S+$/.test(word)) return false;
	try {
		const { protocol } = new URL(word);
		return protocol === 'https:' || protocol === 'http:';
	} catch {
		return false;
	}
}
