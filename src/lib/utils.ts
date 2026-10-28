import { env } from '$env/dynamic/public';
import type { User } from './types';

export function getAvatar(
	user: Pick<User, 'avatar'> & Pick<User, 'username'>,
	size: number,
	absolute = false
) {
	if (!user.avatar) {
		// social cards and Discord don't accept SVGs
		if (absolute) return `${env.PUBLIC_URL}/avatar/${user.username}.png?size=${size}`;
		return `/avatar/${user.username}.svg?size=${size}`;
	}
	if (absolute) return `${env.PUBLIC_URL}${user.avatar}`;
	return user.avatar;
}
