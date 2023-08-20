import { PUBLIC_URL } from '$env/static/public';
import type { User } from './types';

export function getAvatar(
	user: Pick<User, 'avatar'> & Pick<User, 'username'>,
	size: number,
	absolute = false
) {
	if (!user.avatar) return `https://source.boringavatars.com/beam/${size}/${user.username}`;
	if (absolute) return `${PUBLIC_URL}${user.avatar}`;
	return user.avatar;
}
