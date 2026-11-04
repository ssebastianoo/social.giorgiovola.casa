import { PUBLIC_URL } from '$app/env/public';
import type { User } from './types';

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
