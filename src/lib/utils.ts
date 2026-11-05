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
